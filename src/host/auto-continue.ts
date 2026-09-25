/**
 * 输出 token 上限截断后的自动续写.
 *
 * 为什么不能走 `agent/request-error`: max-tokens 根本不是错误——适配器把 stop_reason
 * `length` 映射成 `{ kind: 'max-tokens' }`, agent-loop 只是结束回合, 请求本身是成功
 * 返回的, 所以重试链路永远看不到它.
 *
 * 为什么不在 `agent/turn-stopping` 里 steer: 该钩子 payload 只有 `{agent,turn,signal}`,
 * 拿不到结束原因, 无法区分 "正常说完" 和 "被截断", steer 会变成无限续写.
 *
 * `session/event` 是 post-commit 追加流, 构造期种子 (resume/fork/replay) 不发射, 因此
 * 重新打开一个历史上被截断过的旧会话不会触发续写.
 * @module dsh-llm-retry-settings/host/auto-continue
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
// 类型侧导入: 它们把 `agent/status` 与 `session/event` / `session/disposed` 并进
// cordis 的 Events 表, 运行时不需要这两个包.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import { DEFAULT_CONTINUATION_PROMPT, PRODUCER_ID } from '../shared.ts'
import { diag } from './diag.ts'
import type { LiveConfig } from './live-config.ts'
import type { Observer } from './observation.ts'
import type { SessionModels } from './session-models.ts'

/** 会话账本上限 (防长跑进程无界增长). */
const STATE_MAX = 200

/** `continueOnError=true` 时值得再补一轮的瞬时错误码; 确定性错误 (参数/内容/凭证) 不补. */
const TRANSIENT_CONTINUE_CODES = new Set([
  'PI_AI_ERROR',
  'TRANSPORT',
  'TIMEOUT',
  'SERVER',
  'EMPTY_RESPONSE',
  'STREAM_CLOSED',
  'MALFORMED_RESPONSE',
  'INVALID_RESPONSE',
  'PI_AI_NOT_WARMED',
  'UNKNOWN',
])

/** 一个会话的自动续写账本. */
interface ContinueState {
  /** 本轮截断链上已经补了几次续写. */
  chain: number
  /** 已因触顶拒绝过 (只提示一次, 不刷屏). */
  capped: boolean
  /**
   * 已处理过的 turn/end 回合号: `session/event` 与 `agent/status` 两条触发路径共用,
   * 保证同一次截断最多续写一轮. 回合号单调递增, 所以它同时就是 "上一次已投递" 的
   * 标记——不需要额外的 pending 标志 (那玩意在只走兜底路径时会永久卡死).
   */
  lastTurn: number
}

/** 会话事件的最小结构. */
interface SessionEventLike {
  type?: unknown
  data?: any
}

/** 会话的最小结构 (只用到公开的 `seq` / `eventAt`). */
interface SessionLike {
  id?: unknown
  seq?: number
  eventAt?: (index: number) => SessionEventLike | undefined
}

/** 回合结束原因. */
interface TurnEnd {
  turn: number
  kind: string
  code?: string | undefined
}

/** 从回合结束原因里取错误码 (三个历史落点). */
function codeOf(reason: any): string | undefined {
  const code = reason?.error?.code ?? reason?.error?.failure?.code ?? reason?.failure?.code
  return typeof code === 'string' ? code : undefined
}

/** `agent.inbox` 是否已有待处理消息 (用户自己排队/steer 的输入). */
function inboxBusy(agent: any): boolean {
  const inbox = agent?.inbox
  if (inbox === undefined || inbox === null) return false
  const size = (value: unknown): number => (Array.isArray(value) ? value.length : 0)
  return size(inbox.nextTurn) > 0 || size(inbox.nextStep) > 0
}

/**
 * 从会话日志尾部找最近一条 `turn/end`.
 *
 * 只给 `agent/status` 兜底路径用: 该钩子不带原因, 得自己回看日志. 最多回看 400 条
 * 事件——turn/end 之后紧跟的事件寥寥, 再多就说明这个会话不正常, 宁可不续写也不做
 * 全量扫描. 读取走公开的 `seq` / `eventAt()`, 不依赖 Session 内部的 log 数组.
 */
function lastTurnEnd(session: SessionLike): TurnEnd | undefined {
  if (typeof session.eventAt !== 'function' || typeof session.seq !== 'number') return undefined
  const end = session.seq
  const read = (index: number): TurnEnd | undefined => {
    const event = session.eventAt?.(index)
    if (event?.type !== 'turn/end') return undefined
    const reason = event.data?.reason
    return {
      turn: typeof event.data?.turn === 'number' ? event.data.turn : -1,
      kind: typeof reason?.kind === 'string' ? reason.kind : '',
      code: codeOf(reason),
    }
  }
  // 兜底路径每次 idle 都会调用: turn/end 几乎总在尾部, 先扫 24 条, 未命中才放宽到 400.
  const near = Math.max(0, end - 24)
  for (let i = end - 1; i >= near; i -= 1) {
    const hit = read(i)
    if (hit !== undefined) return hit
  }
  const far = Math.max(0, end - 400)
  for (let i = near - 1; i >= far; i -= 1) {
    const hit = read(i)
    if (hit !== undefined) return hit
  }
  return undefined
}

/**
 * 手工构造续写用的 UserMessage.
 *
 * 不用 `createUserMessage` (`@deepseek-ai/dsh-llm`): 宿主 bundle 以 `bundle: true`
 * 构建, 引入该包会把整个 dsh-llm 打进来. 产物形状与
 * `createUserMessage({content,source})` 一致——id/role/content/source 四字段 + 深冻结,
 * `Session.append` 的运行时校验只要求 JSON 可序列化.
 */
function makeContinuationMessage(text: string): unknown {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    // session 格式 v4 拒绝退役的 `kind: 'plugin'`: 第三方生产者必须写
    // `plugin:<生产者 id>`, 否则投递时抛 format v4 message requires a
    // producer-owned source kind (用户可见为 "本轮运行失败").
    source: Object.freeze({ kind: `plugin:${PRODUCER_ID}` }),
  })
}

/**
 * 回合内模型有没有输出过可见正文 (text 块非空)——**仅供诊断**.
 *
 * max-tokens 的截断点有两种: 正文被截断 (text 有内容, 历史里有可见的 "中断处") 与
 * 思考被截断 (只有 reasoning 块). 曾据此发两种不同的续写指令, 已废弃: 全量对比 75 个
 * 手动停止样本, 其中 45 个同样没有正文却照样能接上; 真正决定能否接上的是 provider /
 * model 中转是否回显上一段思考. 所以这里只把 text=yes/no 写进 host.log, 供用户自定义
 * 续写提示词时判断措辞.
 */
function visibleTextBeforeTurnEnd(session: SessionLike, turn: number): boolean {
  if (typeof session.eventAt !== 'function' || typeof session.seq !== 'number') return true
  const end = session.seq
  const hasText = (content: unknown): boolean =>
    Array.isArray(content)
    && content.some((part: any) => part?.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '')
  for (let i = end - 1, floor = Math.max(-1, end - 120); i > floor; i -= 1) {
    const event = session.eventAt(i)
    if (event === undefined || typeof event.type !== 'string') continue
    if (event.type === 'turn/start' && event.data?.turn === turn) return false
    if (event.type === 'assistant/message') {
      if (hasText(event.data?.message?.content ?? event.data?.content)) return true
    }
  }
  return false
}

/** 输出截断的自动续写状态机. */
export class AutoContinue {
  private readonly states = new Map<string, ContinueState>()

  /**
   * @param ctx - 插件上下文.
   * @param live - 生效配置的读取口.
   * @param models - 会话模型缓存.
   * @param observer - 观测计数.
   */
  constructor(
    private readonly ctx: Context,
    private readonly live: LiveConfig,
    private readonly models: SessionModels,
    private readonly observer: Observer,
  ) {}

  /** 挂上三条事件监听. */
  install(): void {
    this.ctx.on('session/event', (session: any, event: any) => {
      this.onSessionEvent(session, event)
    })
    // 兜底触发: 回合结束且没有后续工作时 agent 转 idle, 此时 turn/end 已落日志.
    // 若主路径 (session/event) 正常, lastTurn 去重会让这里直接 return.
    this.ctx.on('agent/status', (payload: any) => {
      this.onAgentStatus(payload)
    })
    // 会话离场即清账本, 避免长跑进程里 Map 无界增长.
    this.ctx.on('session/disposed', (session: any) => {
      if (session === undefined || session === null) return
      const id = String(session.id)
      this.states.delete(id)
      this.models.forget(id)
    })
  }

  /** 会话账本 (按需创建, 超出上限丢最早插入的). */
  private stateOf(id: string): ContinueState {
    let state = this.states.get(id)
    if (state === undefined) {
      state = { chain: 0, capped: false, lastTurn: -1 }
      this.states.set(id, state)
      while (this.states.size > STATE_MAX) {
        const oldest = this.states.keys().next().value
        if (typeof oldest !== 'string') break
        this.states.delete(oldest)
      }
    }
    return state
  }

  private onSessionEvent(session: any, event: any): void {
    try {
      if (session === undefined || session === null || event === undefined || event === null) return
      if (typeof event.type !== 'string') return
      switch (event.type) {
        case 'user/message': {
          const state = this.stateOf(String(session.id))
          const source = event.data?.source
          const kind = source?.kind
          // 真人重新发言 = 旧截断链作废, 计数归零.
          if (kind === 'user') {
            if (state.chain > 0) diag(`人工发言，重置续写链 session=${session.id} chain=${state.chain}`)
            state.chain = 0
            state.capped = false
            return
          }
          // 识别自己的续写消息: v4 形态 `kind='plugin:'+PRODUCER_ID`.
          if (kind === `plugin:${PRODUCER_ID}`) diag(`续写消息已入会话 session=${session.id}`)
          return
        }
        // 模型名只在请求元数据里: payload 里只有 provider, overrides 的 model 匹配全靠这里.
        case 'request/context':
        case 'request/header': {
          const meta = event.type === 'request/context' ? event.data : event.data?.header?.config
          const model = meta?.model
          if (typeof model === 'string' && model !== '') {
            this.models.remember(
              String(session.id),
              typeof meta?.provider === 'string' ? meta.provider : '',
              model,
            )
          }
          return
        }
        case 'turn/end': {
          const reason = event.data?.reason
          if (reason === undefined || reason === null || typeof reason.kind !== 'string') return
          this.handleTurnEnd(
            session,
            typeof event.data?.turn === 'number' ? event.data.turn : -1,
            reason.kind,
            'session/event',
            undefined,
            codeOf(reason),
          )
          return
        }
        default:
          return
      }
    } catch (error) {
      diag(`自动续写处理异常（session/event）：${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`)
      this.ctx.logger.warn('[dsh-llm-retry-settings] 自动续写处理失败', error)
    }
  }

  private onAgentStatus(payload: any): void {
    try {
      if (payload === undefined || payload === null || payload.status !== 'idle') return
      // 关闭自动续写时不必回看日志: 每次 idle 扫 400 条事件是白工.
      if (!this.live.current().autoContinue) return
      const session = payload.agent?.session
      if (session === undefined || session === null || session.id === undefined) return
      const end = lastTurnEnd(session)
      if (end === undefined) return
      this.handleTurnEnd(session, end.turn, end.kind, 'agent/status', payload.agent, end.code)
    } catch (error) {
      diag(`自动续写处理异常（agent/status）：${String(error)}`)
    }
  }

  /**
   * 一次 turn/end 的唯一处理入口, 两条触发路径共用.
   * @param session - 会话.
   * @param turn - 回合号.
   * @param kind - 结束原因类别.
   * @param via - 触发路径 (诊断用).
   * @param agentHint - 兜底路径已经拿到的 agent 实例.
   * @param errorCode - 结束原因里的错误码.
   */
  private handleTurnEnd(
    session: any,
    turn: number,
    kind: string,
    via: string,
    agentHint?: any,
    errorCode?: string | undefined,
  ): void {
    const config = this.live.current()
    const state = this.stateOf(String(session.id))
    if (state.lastTurn === turn) return
    state.lastTurn = turn
    // 两种值得补一轮的结束原因: 输出被 token 上限截断; 或瞬时错误把重试耗光了
    // (后者要用户显式打开 continueOnError, 且只认 TRANSIENT_CONTINUE_CODES).
    const truncation = kind === 'max-tokens'
    const transientFailure = kind === 'error' && config.continueOnError
      && TRANSIENT_CONTINUE_CODES.has(errorCode ?? '')
    if (!truncation && !transientFailure) {
      state.chain = 0
      state.capped = false
      return
    }
    diag(
      `turn/end via=${via} session=${session.id} turn=${turn} kind=${kind}`
      + `${transientFailure ? ` code=${errorCode ?? ''}` : ''} autoContinue=${config.autoContinue}`
      + ` maxContinuations=${config.maxContinuations} chain=${state.chain}`,
    )
    if (!config.autoContinue) return
    if (state.chain >= config.maxContinuations) {
      if (!state.capped) {
        state.capped = true
        this.observer.hitCap(turn)
        diag(`bail via=${via}: 连续续写触顶（${state.chain}/${config.maxContinuations}）session=${session.id}`)
        this.ctx.logger.info(
          `[dsh-llm-retry-settings] 会话 ${String(session.id)} 连续续写已达上限（${config.maxContinuations} 次），停止自动续写`,
        )
      }
      return
    }
    // agentHint: 兜底路径已经拿到实例, 不必再问注册表, 也就不会被 ctx.agents 是否可用卡住.
    let agent: any = agentHint
    if (agent === undefined || agent === null) {
      const agents = (this.ctx as unknown as { agents?: { get(id: string): any } }).agents
      if (agents === undefined || typeof agents.get !== 'function') {
        diag(`bail via=${via}: ctx.agents 不可用（inject 未满足？）`)
        return
      }
      agent = agents.get(String(session.id))
      if (agent === undefined || agent === null) {
        diag(`bail via=${via}: agents.get(${String(session.id)}) 无实例`)
        return
      }
    }
    // 按 id 比对而非对象引用: resume/fork 之后 store 可能给出同 id 的另一个 Session
    // 实例, 引用相等会误判成 "不是同一个会话" 而静默放弃.
    if (agent.session?.id !== session.id) {
      diag(`bail via=${via}: agent.session.id=${String(agent.session?.id)} 与事件 session.id=${String(session.id)} 不符`)
      return
    }
    if (typeof agent.followup !== 'function') {
      diag(`bail via=${via}: agent.followup 不是函数（type=${typeof agent.followup}）`)
      return
    }
    // 用户自己排了消息 (或 steer) 时不再补续写: 那条消息本身就是 "继续".
    if (inboxBusy(agent)) {
      this.observer.skippedByUser(turn)
      diag(`bail via=${via}: inbox 已有待处理消息，跳过自动续写 session=${String(session.id)}`)
      return
    }
    // —— 关键: 必须等 agent 真正空闲后再投递 ——
    //
    // 两道坑:
    //
    // (1) `session/event` 是在 `Session.append()` 内部**同步**派发的, 而 append 有重入
    //     保护, 见已置位即抛 "session append cannot reenter while another append is
    //     being published"; followup 做的第一件事就是 session.append, 所以在监听器里
    //     同步 followup 必然自撞.
    //
    // (2) 挪进微任务之后死在第二道: turn/end 时驱动还在收尾, phase.kind 仍是
    //     "running", 而 wakeDriver 只在 maintenance / wakeAfterAbort 时才 latch
    //     wakeRequested, 否则直接 return——消息确实插进了 next-turn 队列, 唤醒却被
    //     丢弃. 表现就是 "进了排队但永远发不出去".
    //
    // 正解是官方给的 `whenIdle()`: `await this.activityDone` 直到驱动边界 settle.
    // 截断点分型只用于诊断 (text=yes/no), 判定必须发生在投递前, 通过公开的
    // `seq` / `eventAt` 读取当前会话事件.
    const hasVisibleText = visibleTextBeforeTurnEnd(session, turn)
    state.chain += 1
    const expectedChain = state.chain
    const sessionId = String(session.id)
    const attempt = (round: number): void => {
      void (async () => {
        try {
          if (typeof agent.whenIdle === 'function') await agent.whenIdle()
          else await new Promise((resolve) => setTimeout(resolve, 0))
          // 等待期间情况可能已经变了: 跑了新回合, 人工重新发言 (chain 被重置), 或会话
          // 已 dispose. 任何一种都放弃, 绝不补一发过期的续写.
          if (state.lastTurn !== turn || state.chain !== expectedChain || !this.states.has(sessionId)) {
            diag(`放弃投递 round=${round} via=${via} session=${sessionId} turn=${turn} lastTurn=${state.lastTurn} chain=${state.chain}`)
            return
          }
          // 等待 whenIdle 期间用户可能已经自己发言/排队: 让位给用户.
          if (inboxBusy(agent)) {
            this.observer.skippedByUser(turn)
            diag(`放弃投递 round=${round} via=${via} session=${sessionId}：等待期间 inbox 已有新消息`)
            return
          }
          const fresh = this.live.current()
          const custom = fresh.continuationPrompt.trim()
          const prompt = custom === '' ? DEFAULT_CONTINUATION_PROMPT : custom
          agent.followup(makeContinuationMessage(prompt))
          const known = this.models.of(sessionId)
          this.observer.continued({ turn, provider: known?.provider, model: known?.model })
          diag(
            `续写已投递 round=${round} via=${via} session=${sessionId} turn=${turn}`
            + ` prompt=${custom === '' ? 'default' : 'custom'} text=${hasVisibleText ? 'yes' : 'no'}`
            + ` chain=${state.chain}/${fresh.maxContinuations}`,
          )
        } catch (error) {
          diag(`续写投递失败 round=${round} via=${via} session=${sessionId} turn=${turn}：${String(error)}`)
          // Inbox.mutate 是先 append 后改本地数组, 重入抛错即未入队, 只有这一种错误可以
          // 重试而不会双插.
          if (round === 1 && String(error).includes('reenter')) setTimeout(() => { attempt(2) }, 0)
        }
      })()
    }
    attempt(1)
  }
}
