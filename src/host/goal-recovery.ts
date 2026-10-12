/** 重复中止后恢复原本已激活的 goal, 使用宿主正式服务. */
import type { Context } from '@deepseek-ai/cordis'
import { diag } from './diag.ts'

interface GoalViewLike {
  id: string
  revision: number
  phase: string
  activation: string
  roundsStarted: number
  maxGoalRounds: number
}

interface GoalServiceLike {
  get(agent: any): GoalViewLike | undefined
  resume(agent: any, ref: { id: string; revision: number }): GoalViewLike
}

export interface GoalRecoveryTicket {
  turn: number
  service: GoalServiceLike
  goal: GoalViewLike
  pausedRevision?: number
  valid: boolean
}

/** 不引入 goal 硬依赖, 无 goal 服务时沿用普通插件续写. */
export class GoalRecovery {
  private tickets = new WeakMap<object, GoalRecoveryTicket>()
  private idleEdges = new WeakSet<object>()

  constructor(private readonly ctx: Context) {}

  install(): void {
    // 自动 pause 在 idle 通知内同步发生. 真人主动 pause 不属于这个边界.
    this.ctx.on('agent/status', ({ agent, status }) => {
      if (status !== 'idle') return
      this.idleEdges.add(agent)
      queueMicrotask(() => { this.idleEdges.delete(agent) })
    }, { global: true, prepend: true })
    const on = this.ctx.on.bind(this.ctx) as (name: string, listener: (payload: any) => void, options: { global: boolean }) => unknown
    on('goal/changed', ({ agent, change }) => {
      const ticket = this.tickets.get(agent)
      if (!ticket) return
      const automaticPause = change.operation === 'pause'
        && this.idleEdges.has(agent)
        && this.ctx.agents.currentInitiator() === agent
        && change.goal?.id === ticket.goal.id
        && change.goal.revision === ticket.goal.revision + 1
        && change.goal.roundsStarted === ticket.goal.roundsStarted
      if (automaticPause && ticket.valid && ticket.pausedRevision === undefined) {
        ticket.pausedRevision = change.goal.revision
      } else {
        ticket.valid = false
      }
    }, { global: true })
    this.ctx.on('agent/disposed', ({ agent }) => { this.tickets.delete(agent) }, { global: true })
    this.ctx.effect(() => () => {
      this.tickets = new WeakMap()
      this.idleEdges = new WeakSet()
    }, 'dsh-llm-retry-settings: goal recovery')
  }

  /** 必须在 cancel 前捕获, turn/end 时宿主可能已经解除 activation. */
  capture(agent: any, turn: number): void {
    this.tickets.delete(agent)
    const service = this.ctx.get('goals') as GoalServiceLike | undefined
    if (!service) return
    const goal = service.get(agent)
    if (!goal || goal.phase !== 'active' || goal.activation !== 'armed') return
    this.tickets.set(agent, { turn, service, goal: { ...goal }, valid: true })
  }

  ticket(agent: any, turn: number): GoalRecoveryTicket | undefined {
    const ticket = this.tickets.get(agent)
    return ticket?.turn === turn ? ticket : undefined
  }

  clear(agent: any): void { this.tickets.delete(agent) }

  /** 恢复时交给正式 goal 驱动发下一轮, 插件只注入恢复提示词, 不另发 followup. */
  recover(agent: any, ticket: GoalRecoveryTicket, message: unknown): boolean {
    if (this.tickets.get(agent) !== ticket || !ticket.valid || agent.status !== 'idle') return false
    if (this.ctx.get('goals') !== ticket.service || typeof agent.inject !== 'function') return false
    const current = ticket.service.get(agent)
    if (!current || current.id !== ticket.goal.id
      || current.roundsStarted !== ticket.goal.roundsStarted
      || current.roundsStarted >= current.maxGoalRounds) return false
    const sameActive = current.phase === 'active' && current.revision === ticket.goal.revision
    const ownPause = current.phase === 'paused' && current.revision === ticket.pausedRevision
    if (!sameActive && !ownPause) return false
    // resume 同步记录正式变更, goal 驱动先 await 持久化再排队. inject 不唤醒 agent,
    // 因而提示词与下一条正式 goal 消息进入同一轮, 保留完成目标的授权及轮次计数.
    const restored = current.activation !== 'armed'
      ? ticket.service.resume(agent, { id: current.id, revision: current.revision }) : current
    this.tickets.delete(agent)
    // goal/changed 的同步观察者可能插入真人消息或再次暂停, 不能把提示词塞给它.
    const latest = ticket.service.get(agent)
    if (!latest || latest.id !== restored.id || latest.revision !== restored.revision
      || latest.phase !== 'active' || latest.activation !== 'armed'
      || agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length) return false
    try {
      agent.inject(message)
    } catch (error) {
      // goal 已恢复, 不再回退普通 followup, 避免同一恢复发送两轮.
      diag(`goal 恢复提示词注入失败 goal=${current.id}: ${String(error)}`)
    }
    diag(`goal 已恢复 goal=${current.id} turn=${ticket.turn}`)
    return true
  }
}
