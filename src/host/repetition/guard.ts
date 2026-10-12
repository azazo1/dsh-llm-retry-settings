/** 在 agent 流发布点中止重复输出, 不伪造 token 上限或修改已提交历史. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { diag } from '../diag.ts'
import type { LiveConfig } from '../live-config.ts'
import type { Observer } from '../observation.ts'
import type { SessionModels } from '../session-models.ts'
import { RepetitionDetector } from './detector.ts'

export const REPEAT_CANCEL_REASON = 'dsh-llm-retry-settings:repeated-output'

interface AttemptState {
  attemptId: string
  turn: number
  stopped: boolean
  blocks: Map<string, RepetitionDetector>
}

interface EndReasonLike {
  kind?: unknown
  reason?: { kind?: unknown; reason?: unknown }
}

export class RepetitionGuard {
  private attempts = new WeakMap<Agent, AttemptState>()
  private readonly pending = new Map<string, number>()

  constructor(
    private readonly ctx: Context,
    private readonly live: LiveConfig,
    private readonly models: SessionModels,
    private readonly observer: Observer,
  ) {}

  install(): void {
    this.ctx.on('agent/assistant-stream', ({ agent, frame }) => {
      try {
        this.onFrame(agent, frame)
      } catch (error) {
        // 发射型监听器不得抛错, 否则可能令整个回合的收尾失败.
        diag(`重复检测失败: ${String(error)}`)
        this.ctx.logger.warn('[dsh-llm-retry-settings] 重复检测失败', error)
      }
    }, { global: true })
    this.ctx.on('agent/disposed', ({ agent }) => {
      this.attempts.delete(agent)
      this.pending.delete(String(agent.session.id))
    }, { global: true })
    this.ctx.on('session/disposed', (session) => { this.pending.delete(String(session.id)) })
    this.ctx.effect(() => () => {
      this.attempts = new WeakMap()
      this.pending.clear()
    }, 'dsh-llm-retry-settings: repetition state')
  }

  /** 只认本进程本回合的检测结果, 真人停止及旧会话恢复不得触发自动续写. */
  take(sessionId: string, turn: number, reason: EndReasonLike | undefined): boolean {
    const pendingTurn = this.pending.get(sessionId)
    if (pendingTurn === undefined || pendingTurn !== turn) return false
    this.pending.delete(sessionId)
    return reason?.kind === 'aborted' && reason.reason?.kind === 'hook'
      && reason.reason.reason === REPEAT_CANCEL_REASON
  }

  private onFrame(agent: Agent, frame: AssistantStreamFrame): void {
    if (frame.type === 'end') {
      this.attempts.delete(agent)
      return
    }
    if (frame.type === 'start') {
      // 即使关闭也保留本回合元数据, 这样用户在重复卡流时打开开关也能立即检测.
      this.attempts.set(agent, {
        attemptId: String(frame.attemptId), turn: frame.turn, stopped: false, blocks: new Map(),
      })
      return
    }
    const config = this.live.current()
    const state = this.attempts.get(agent)
    if (config.repeatMode === 'off') {
      state?.blocks.clear()
      return
    }
    if (state === undefined || state.stopped || state.attemptId !== String(frame.attemptId)) return
    const chunk = frame.chunk
    if (chunk.type === 'block-end') {
      state.blocks.delete(`text-delta:${chunk.index}`)
      state.blocks.delete(`reasoning-delta:${chunk.index}`)
      return
    }
    // 不检测工具参数, 也不把正文与思维链拼在一起制造假重复.
    if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') return
    const key = `${chunk.type}:${chunk.index}`
    let detector = state.blocks.get(key)
    if (detector === undefined) {
      detector = new RepetitionDetector()
      state.blocks.set(key, detector)
      // 防御异常适配器无限打开块, 每个 attempt 最多保留 32 个检测窗口.
      while (state.blocks.size > 32) state.blocks.delete(state.blocks.keys().next().value!)
    }
    const hit = detector.push(chunk.text, {
      minRepeats: config.repeatMinRepeats, minChars: config.repeatMinChars,
    })
    if (hit === undefined) return
    const sessionId = String(agent.session.id)
    state.stopped = true
    this.pending.set(sessionId, state.turn)
    while (this.pending.size > 200) this.pending.delete(this.pending.keys().next().value!)
    try {
      // 使用公开的取消 API, agent-loop 自己提交安全的 text/reasoning 前缀并关闭请求.
      // 保留真人的排队输入, 续写时仍由 AutoContinue 判断是否需要让位.
      agent.cancel({ kind: 'hook', reason: REPEAT_CANCEL_REASON }, { keepInbox: true })
    } catch (error) {
      this.pending.delete(sessionId)
      throw error
    }
    const known = this.models.of(sessionId)
    this.observer.repeated({
      turn: state.turn, provider: known?.provider, model: known?.model,
      channel: chunk.type === 'reasoning-delta' ? 'reasoning' : 'text', ...hit,
    })
    // 不记录实际输出文本, 防止日志包含用户内容或思维链.
    diag(`重复输出已中止 session=${sessionId} turn=${state.turn} channel=${chunk.type}`
      + ` period=${hit.period} repeats=${hit.repeats} chars=${hit.chars}`)
  }
}
