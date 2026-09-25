/**
 * 会话 → 最近一次请求的 provider / model.
 *
 * 宿主侧 `agent/request-error` 的 payload 里只有 provider, 没有 model, 而 overrides
 * 的 model 匹配需要它; 模型名只出现在会话事件的请求元数据里, 所以这里做一份有界缓存.
 * @module dsh-llm-retry-settings/host/session-models
 */

/** 缓存上限 (防长跑进程无界增长). */
const STATE_MAX = 200

/** 有界的会话模型缓存. */
export class SessionModels {
  private readonly entries = new Map<string, { provider: string; model: string }>()

  /** 记住一个会话最近一次请求的 provider / model. */
  remember(sessionId: string, provider: string, model: string): void {
    this.entries.set(sessionId, { provider, model })
    while (this.entries.size > STATE_MAX) {
      const oldest = this.entries.keys().next().value
      if (typeof oldest !== 'string') break
      this.entries.delete(oldest)
    }
  }

  /** 该会话最近一次请求的模型名; 不知道时是空串. */
  modelOf(sessionId: string): string {
    return this.entries.get(sessionId)?.model ?? ''
  }

  /** 该会话最近一次请求的 provider / model. */
  of(sessionId: string): { provider: string; model: string } | undefined {
    return this.entries.get(sessionId)
  }

  /** 会话离场即清, 避免长跑进程里无界增长. */
  forget(sessionId: string): void {
    this.entries.delete(sessionId)
  }

  /** 只读快照 (观测路由用). */
  snapshot(): Record<string, { provider: string; model: string }> {
    return Object.fromEntries(this.entries)
  }
}
