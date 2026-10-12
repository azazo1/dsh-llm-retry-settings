/** 真实 Cordis 事件分发 + 重复中止到既有续写状态机的组合回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import { AutoContinue } from '../src/host/auto-continue.ts'
import { normalizeConfig } from '../src/host/config.ts'
import { setDiagActive } from '../src/host/diag.ts'
import { GoalRecovery } from '../src/host/goal-recovery.ts'
import { Observer } from '../src/host/observation.ts'
import { SessionModels } from '../src/host/session-models.ts'
import { RepetitionGuard, REPEAT_CANCEL_REASON } from '../src/host/repetition/guard.ts'

setDiagActive(false)

function harness(options = {}) {
  const ctx = new Context()
  const config = normalizeConfig({ configVersion: 2, repeatMode: 'continue', autoContinue: true, ...options })
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
  const injected: any[] = []
  let initiator: any = agent
  agent.inject = (message: any) => { injected.push(message) }
  Object.assign(ctx, { agents: {
    get: (id: string) => id === session.id ? agent : undefined,
    currentInitiator: () => initiator,
  } })
  const observer = new Observer()
  const models = new SessionModels()
  const goals = new GoalRecovery(ctx)
  goals.install()
  const guard = new RepetitionGuard(ctx, live as any, models, observer, goals)
  guard.install()
  new AutoContinue(ctx, live as any, models, observer, guard, goals).install()
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
    agent.status = 'idle'
    ctx.emit(agentCarrier(agent), 'agent/status', { agent, status: 'idle' })
  }
  return {
    ctx, config, agent, guard, observer, delivered, injected, cancellations, start, chunk, end, append,
    setInitiator: (value: any) => { initiator = value },
    signal: () => controller.signal,
    wait: () => {
      let release!: () => void
      idle = new Promise<void>(resolve => { release = resolve })
      return release
    },
  }
}

test('goal 自动暂停后恢复同一目标, 正式驱动负责继续且不重复 followup', async () => {
  const h = harness({ autoContinue: false, repeatContinuationPrompt: 'goal-repeat-prompt' })
  const service = mountGoal(h)
  const revision = service.value.revision
  const rounds = service.value.roundsStarted
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(300))
  h.end(1, undefined, true)
  await setImmediate()
  assert.equal(service.resumes, 1)
  assert.equal(service.value.phase, 'active')
  assert.equal(service.value.activation, 'armed')
  assert.equal(service.value.revision, revision + 2)
  assert.equal(service.value.roundsStarted, rounds)
  assert.equal(h.delivered.length, 0)
  assert.equal(h.injected.length, 1)
  assert.equal(h.injected[0].content[0].text, 'goal-repeat-prompt')
  assert.equal(h.injected[0].source.kind, 'plugin:dsh-llm-retry')
  h.end(1)
  await setImmediate()
  assert.equal(service.resumes, 1)
  await h.ctx.fiber.dispose()
})

test('普通轮次重复中止解除 activation 后恢复 goal, 原本暂停或未激活的目标不恢复', async () => {
  for (const initial of [
    { phase: 'active', activation: 'armed' },
    { phase: 'paused', activation: 'disarmed' },
    { phase: 'active', activation: 'disarmed' },
  ]) {
    const h = harness()
    const service = mountGoal(h, initial, false)
    h.start(1)
    h.chunk('reasoning-delta', 'x'.repeat(300))
    h.end(1)
    await setImmediate()
    const restore = initial.activation === 'armed'
    assert.equal(service.resumes, restore ? 1 : 0)
    assert.equal(h.delivered.length, restore ? 0 : 1)
    await h.ctx.fiber.dispose()
  }
})

test('真人主动暂停, 目标修改, 轮次耗尽及恢复关闭均不重新激活 goal', async () => {
  for (const change of ['pause', 'edit', 'complete', 'replace', 'exhausted', 'stop', 'cap', 'queued', 'dispose']) {
    const h = harness()
    const service = mountGoal(h, {}, true)
    const release = h.wait()
    h.start(1)
    h.chunk('text-delta', 'x'.repeat(300))
    if (change === 'pause') {
      h.setInitiator(undefined)
      service.change('pause')
      h.setInitiator(h.agent)
    }
    h.end(1)
    if (change === 'edit' || change === 'complete') service.change(change)
    if (change === 'replace') service.value.id = 'another-goal'
    if (change === 'exhausted') service.value.maxGoalRounds = service.value.roundsStarted
    if (change === 'stop') h.config.repeatMode = 'stop'
    if (change === 'cap') h.config.repeatMaxContinuations = 0
    if (change === 'queued') h.agent.inbox.nextTurn.push({ source: { kind: 'user' } })
    if (change === 'dispose') await h.ctx.fiber.dispose()
    release()
    await setImmediate()
    assert.equal(service.resumes, 0, change)
    assert.equal(h.delivered.length, 0, change)
    assert.equal(h.injected.length, 0, change)
    await h.ctx.fiber.dispose()
  }
})

test('goal 恢复仍消耗独立重复预算, 恢复失败不回退普通续写', async () => {
  for (const failure of [false, true]) {
    const h = harness({ repeatMaxContinuations: 1 })
    const service = mountGoal(h)
    if (failure) service.failResume = true
    for (const turn of failure ? [1] : [1, 2]) {
      h.start(turn)
      h.chunk('text-delta', 'x'.repeat(300))
      h.end(turn)
      await setImmediate()
    }
    assert.equal(service.resumes, failure ? 0 : 1)
    assert.equal(h.delivered.length, 0)
    assert.equal(h.injected.length, failure ? 0 : 1)
    await h.ctx.fiber.dispose()
  }
})

/** 模拟已核对的宿主取消边界, 其正式 goal 服务使用 CAS 版本. */
function mountGoal(h: ReturnType<typeof harness>, initial = {}, goalRound = true) {
  const service = {
    value: { id: 'goal-test', revision: 1, phase: 'active', activation: 'armed', roundsStarted: 1, maxGoalRounds: 8, ...initial },
    resumes: 0,
    failResume: false,
    get: (_agent: any) => ({ ...service.value }),
    resume: (_agent: any, ref: any) => {
      if (service.failResume) throw new Error('resume failed')
      assert.deepEqual(ref, { id: service.value.id, revision: service.value.revision })
      service.resumes += 1
      service.change('resume')
      return { ...service.value }
    },
    change: (operation: string) => {
      service.value.revision += 1
      if (operation === 'pause') service.value.phase = 'paused'
      if (operation === 'complete') service.value.phase = 'complete'
      if (operation === 'resume') service.value.phase = 'active'
      service.value.activation = operation === 'resume' ? 'armed' : 'disarmed'
      h.ctx.emit(agentCarrier(h.agent), 'goal/changed' as any, {
        agent: h.agent, change: { operation, goal: { ...service.value } },
      })
    },
  }
  h.ctx.provide('goals', service)
  h.ctx.on('agent/status', ({ status }) => {
    if (status !== 'idle' || service.value.activation !== 'armed') return
    if (goalRound) service.change('pause')
    else service.value.activation = 'disarmed'
  })
  return service
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

test('重复和 token 上限分别累计, 切换原因不重置, 真人消息重置', async () => {
  const h = harness({ maxContinuations: 1, repeatMaxContinuations: 1,
    repeatContinuationPrompt: 'repeat-prompt', continuationPrompt: 'token-prompt' })
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

test('重复三种模式和独立上限为零控制中止及发送', async () => {
  for (const options of [{ repeatMode: 'off' }, { repeatMode: 'stop' }, { repeatMaxContinuations: 0 }]) {
    const h = harness(options)
    h.start(1)
    h.chunk('text-delta', 'x'.repeat(300))
    assert.equal(h.cancellations.length, options.repeatMode === 'off' ? 0 : 1)
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
  const h = harness({ repeatMode: 'off' })
  h.start(1)
  h.chunk('text-delta', 'x'.repeat(300))
  assert.equal(h.cancellations.length, 0)
  h.config.repeatMode = 'continue'
  h.chunk('text-delta', 'x'.repeat(128))
  h.config.repeatMode = 'off'
  h.chunk('text-delta', 'x'.repeat(128))
  h.config.repeatMode = 'continue'
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 0)
  h.chunk('text-delta', 'x'.repeat(128))
  assert.equal(h.cancellations.length, 1)
  h.end(1)
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  await h.ctx.fiber.dispose()
})

test('恢复开关互不依赖, 专用提示词和独立预算在交替原因中生效', async () => {
  const h = harness({ autoContinue: false, maxContinuations: 0, errorContinue: true,
    errorMaxContinuations: 1, repeatMaxContinuations: 1, errorContinuationPrompt: 'error-prompt' })
  h.start(1)
  h.chunk('reasoning-delta', 'x'.repeat(300))
  h.end(1)
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  h.start(2)
  h.end(2, { kind: 'max-tokens' })
  await setImmediate()
  assert.equal(h.delivered.length, 1)
  h.start(3)
  h.end(3, { kind: 'error', error: { code: 'SERVER' } })
  await setImmediate()
  assert.equal(h.delivered.length, 2)
  assert.equal(h.delivered[1].content[0].text, 'error-prompt')
  h.start(4)
  h.chunk('text-delta', 'x'.repeat(300))
  h.end(4)
  h.start(5)
  h.end(5, { kind: 'error', error: { code: 'SERVER' } })
  await setImmediate()
  assert.equal(h.delivered.length, 2)
  h.start(6)
  h.end(6, { kind: 'completed' })
  h.start(7)
  h.end(7, { kind: 'error', error: { code: 'SERVER' } })
  await setImmediate()
  assert.equal(h.delivered.length, 3)
  h.start(8)
  h.end(8, { kind: 'error', error: { code: 'INVALID_REQUEST' } })
  await setImmediate()
  assert.equal(h.delivered.length, 3)
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
    (h: any) => { h.config.repeatMode = 'stop' },
    (h: any) => { h.config.repeatMode = 'off' },
    (h: any) => { h.config.repeatMaxContinuations = 0 },
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
