/** 真实 Cordis 事件分发 + 重复中止到既有续写状态机的组合回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import { AutoContinue } from '../src/host/auto-continue.ts'
import { normalizeConfig } from '../src/host/config.ts'
import { setDiagActive } from '../src/host/diag.ts'
import { Observer } from '../src/host/observation.ts'
import { SessionModels } from '../src/host/session-models.ts'
import { RepetitionGuard, REPEAT_CANCEL_REASON } from '../src/host/repetition/guard.ts'

setDiagActive(false)

function harness(options = {}) {
  const ctx = new Context()
  const config = normalizeConfig({ repeatDetection: true, autoContinue: true, ...options })
  const live = { current: () => config }
  const journal: any[] = []
  const session = { id: 'test-session', get seq() { return journal.length }, eventAt: (i: number) => journal[i] }
  const delivered: any[] = []
  const cancellations: any[] = []
  let idle = Promise.resolve()
  let controller = new AbortController()
  const agent: any = {
    session, status: 'running', inbox: { nextTurn: [], nextStep: [] },
    cancel(cause: any, options: any) {
      cancellations.push({ cause, options })
      controller.abort(cause)
      if (!options?.keepInbox) this.inbox.nextTurn = []
    },
    whenIdle: () => idle,
    followup: (message: any) => { delivered.push(message) },
  }
  Object.assign(ctx, { agents: { get: (id: string) => id === session.id ? agent : undefined } })
  const observer = new Observer()
  const models = new SessionModels()
  const guard = new RepetitionGuard(ctx, live as any, models, observer)
  guard.install()
  new AutoContinue(ctx, live as any, models, observer, guard).install()
  let attempt = 0
  const emitFrame = (frame: any) => ctx.emit(agentCarrier(agent), 'agent/assistant-stream', { agent, frame })
  const start = (turn: number) => {
    controller = new AbortController()
    attempt += 1
    emitFrame({ type: 'start', attemptId: String(attempt), revision: attempt, turn, step: 1 })
  }
  const chunk = (type: string, text: string, index = 0) => emitFrame({
    type: 'chunk', attemptId: String(attempt), revision: attempt, index: 0, time: Date.now(),
    chunk: { type, index, text },
  })
  const append = (type: string, data: any) => {
    const event = { type, data }
    journal.push(event)
    ctx.emit('session/event', session as any, event as any)
  }
  const end = (turn: number, reason?: any, fallbackOnly = false) => {
    emitFrame({ type: 'end', attemptId: String(attempt), outcome: { kind: 'abandoned' } })
    const event = { type: 'turn/end', data: { turn, reason: reason ?? { kind: 'aborted', reason: controller.signal.reason } } }
    journal.push(event)
    if (!fallbackOnly) ctx.emit('session/event', session as any, event as any)
    ctx.emit(agentCarrier(agent), 'agent/status', { agent, status: 'idle' })
  }
  return {
    ctx, config, agent, guard, observer, delivered, cancellations, start, chunk, end, append,
    signal: () => controller.signal,
    wait: () => {
      let release!: () => void
      idle = new Promise<void>(resolve => { release = resolve })
      return release
    },
  }
}

test('思维链和正文均中止生成, 保留 inbox, 双路径只投递一次', async () => {
  for (const channel of ['text-delta', 'reasoning-delta']) {
    const h = harness()
    h.start(1)
    h.chunk(channel, '循环内容'.repeat(100))
    assert.equal(h.signal().aborted, true)
    assert.equal(h.signal().reason.reason, REPEAT_CANCEL_REASON)
    assert.deepEqual(h.cancellations[0].options, { keepInbox: true })
    h.chunk(channel, '循环内容'.repeat(100))
    assert.equal(h.cancellations.length, 1)
    h.end(1)
    await setImmediate()
    assert.equal(h.delivered.length, 1)
    assert.equal(h.delivered[0].source.kind, 'plugin:dsh-llm-retry')
    assert.equal((h.observer.snapshot() as any).repetitions, 1)
    assert.equal((h.observer.snapshot() as any).continues, 1)
    await h.ctx.fiber.dispose()
  }
})

test('idle 兜底也能识别重复中止, 历史原因不能冒充新检测', async () => {
  const h = harness()
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(300))
  h.end(1, undefined, true)
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  h.end(2, { kind: 'aborted', reason: { kind: 'hook', reason: REPEAT_CANCEL_REASON } })
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  await h.ctx.fiber.dispose()
})

test('真人停止和其他 hook 不续写, 首个取消原因优先', async () => {
  for (const cause of [{ kind: 'user' }, { kind: 'hook', reason: 'other-plugin' }]) {
    const h = harness()
    h.start(1)
    h.agent.cancel(cause, { keepInbox: true })
    h.chunk('reasoning-delta', 'x'.repeat(300))
    h.end(1)
    await setImmediate()
    assert.equal(h.delivered.length, 0)
    await h.ctx.fiber.dispose()
  }
})

test('重复和 max-tokens 共用续写上限, 真人消息重置', async () => {
  const h = harness({ maxContinuations: 2, repeatContinuationPrompt: 'repeat-prompt', continuationPrompt: 'token-prompt' })
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(300))
  h.end(1)
  await setImmediate()
  h.start(2)
  h.end(2, { kind: 'max-tokens' })
  await setImmediate()
  h.start(3)
  h.chunk('reasoning-delta', 'x'.repeat(300))
  h.end(3)
  await setImmediate()
  assert.equal(h.delivered.length, 2)
  assert.equal(h.delivered[0].content[0].text, 'repeat-prompt')
  assert.equal(h.delivered[1].content[0].text, 'token-prompt')
  assert.equal((h.observer.snapshot() as any).capped, 1)
  h.append('user/message', { source: { kind: 'user' } })
  h.start(4)
  h.chunk('text-delta', 'x'.repeat(300))
  h.end(4)
  await setImmediate()
  assert.equal(h.delivered.length, 3)
  await h.ctx.fiber.dispose()
})

test('检测与续写独立开关, 次数为零仍截断但不发送继续', async () => {
  for (const options of [{ repeatDetection: false }, { autoContinue: false }, { maxContinuations: 0 }]) {
    const h = harness(options)
    h.start(1)
    h.chunk('text-delta', 'x'.repeat(300))
    assert.equal(h.cancellations.length, options.repeatDetection === false ? 0 : 1)
    h.end(1)
    await setImmediate()
    assert.equal(h.delivered.length, 0)
    await h.ctx.fiber.dispose()
  }
})

test('正文与思维链, 不同块和不同 attempt 不串扰, 工具参数及辅助流不检测', async () => {
  const h = harness()
  // 没有 agent start frame 的辅助输出不会被检测.
  h.chunk('text-delta', 'x'.repeat(1000))
  h.start(1)
  h.chunk('reasoning-delta', 'x'.repeat(128))
  h.chunk('text-delta', 'x'.repeat(128))
  h.chunk('text-delta', 'x'.repeat(128), 1)
  h.chunk('tool-call-delta', 'x'.repeat(1000))
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 0)
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 1)
  await h.ctx.fiber.dispose()
})

test('重复卡流中打开开关立即生效, 关闭时清空旧检测窗口', async () => {
  const h = harness({ repeatDetection: false })
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(300))
  assert.equal(h.cancellations.length, 0)
  h.config.repeatDetection = true
  h.chunk('text-delta', 'x'.repeat(128))
  h.config.repeatDetection = false
  h.chunk('text-delta', 'x'.repeat(128))
  h.config.repeatDetection = true
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 0)
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 1)
  h.end(1)
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  await h.ctx.fiber.dispose()
})

test('用户排队消息保留并优先于续写', async () => {
  const h = harness()
  const userMessage = { id: 'queued-user' }
  h.agent.inbox.nextTurn.push(userMessage)
  h.start(1)
  h.chunk('reasoning-delta', 'x'.repeat(300))
  h.end(1)
  await setImmediate()
  assert.equal(h.delivered.length, 0)
  assert.deepEqual(h.agent.inbox.nextTurn, [userMessage])
  assert.equal((h.observer.snapshot() as any).skipped, 1)
  await h.ctx.fiber.dispose()
})

test('等待 idle 时配置关闭, 排队输入和 dispose 均使待发续写失效', async () => {
  for (const mutate of [
    (h: any) => { h.config.autoContinue = false },
    (h: any) => { h.config.repeatDetection = false },
    (h: any) => { h.config.maxContinuations = 0 },
    (h: any) => { h.agent.inbox.nextTurn.push({ id: 'user' }) },
    (h: any) => { h.ctx.emit('session/disposed', h.agent.session) },
    (h: any) => { h.ctx.emit(agentCarrier(h.agent), 'agent/disposed', { agent: h.agent }) },
    (h: any) => { h.ctx.fiber.dispose() },
    (h: any) => { h.append('user/message', { source: { kind: 'user' } }) },
  ]) {
    const h = harness()
    const release = h.wait()
    h.start(1)
    h.chunk('text-delta', 'x'.repeat(300))
    h.end(1)
    mutate(h)
    release()
    await setImmediate()
    assert.equal(h.delivered.length, 0)
    await h.ctx.fiber.dispose()
  }
})

test('插件 dispose 后不再检测或保留 pending, 观测不保存原始模型内容', async () => {
  const h = harness()
  h.start(1)
  h.chunk('text-delta', '敏感内容'.repeat(100))
  assert.equal(JSON.stringify(h.observer.snapshot()).includes('敏感内容'), false)
  await h.ctx.fiber.dispose()
  assert.equal(h.guard.take('test-session', 1, { kind: 'aborted', reason: { kind: 'hook', reason: REPEAT_CANCEL_REASON } }), false)
  h.start(2)
  h.chunk('text-delta', 'x'.repeat(300))
  assert.equal(h.cancellations.length, 1)
})
