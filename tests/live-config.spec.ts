/** 真实 Loader 的 volatile 配置更新和重复检测回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import { Config as ConfigSchema } from '../src/host/config.ts'
import { LiveConfig } from '../src/host/live-config.ts'
import { Observer } from '../src/host/observation.ts'
import { RepetitionGuard, REPEAT_CANCEL_REASON } from '../src/host/repetition/guard.ts'
import { SessionModels } from '../src/host/session-models.ts'
import { installSettings } from '../src/host/settings.ts'
import type { Config } from '../src/shared.ts'

async function mount(withSettings: boolean, initial: Partial<Config> = { repeatMode: 'off' }, persistMigration = false) {
  const root = new Context()
  try {
    await root.plugin(Loader)
    const presentations: unknown[] = []
    await root.plugin({ apply(ctx: Context) {
      ctx.provide('settings', {
        configure(_presentation: unknown, owner: unknown) {
          presentations.push(owner)
          return () => {}
        },
        ...(persistMigration ? {
          describe: () => {
            const fiber = presentations[0] as any
            return [{ ns: fiber.entry.options.id, revision: 1, value: fiber.entry.options.config }]
          },
          mutate: async (ns: string, ops: any[], revision: number) => {
            assert.equal(revision, 1)
            const entry = root.loader.resolve(ns)
            const config = { ...entry.options.config }
            for (const op of ops) {
              if (op.op === 'set') config[op.path[0]] = op.value
              else delete config[op.path[0]]
            }
            await entry.update({ config })
            await root.loader.await()
          },
        } : {}),
      })
    } })
    let live!: LiveConfig
    root.loader.builtins['retry-test'] = {
      Config: ConfigSchema,
      inject: ['settings'],
      apply(ctx: Context, config: Partial<Config>) {
        live = new LiveConfig(config)
        if (withSettings) installSettings(ctx, live, config)
        else live.bindScope({ get: () => config })
        new RepetitionGuard(ctx, live, new SessionModels(), new Observer()).install()
      },
    }
    const id = await root.loader.create({ name: 'cordis:retry-test', config: initial })
    await root.loader.await()
    const entry = root.loader.resolve(id)
    const fiber = entry.fiber!
    return {
      root, entry, fiber, live, presentations,
      update: async (config: Partial<Config>) => {
        await entry.update({ config })
        await root.loader.await()
      },
    }
  } catch (error) {
    await root.fiber.dispose()
    throw error
  }
}

test('旧配置通过设置服务写回版本化迁移, 新字段 unset 恢复默认', async t => {
  const h = await mount(true, { repeatDetection: true, autoContinue: false, maxContinuations: 0 }, true)
  t.after(() => h.root.fiber.dispose())
  await setImmediate()
  assert.equal(h.entry.options.config?.configVersion, 2)
  assert.equal(h.entry.options.config?.repeatDetection, undefined)
  assert.equal(h.live.value.repeatMode, 'continue')
  assert.equal(h.live.value.repeatMaxContinuations, 2)
  assert.equal(h.live.value.autoContinue, false)
  assert.equal(h.live.value.maxContinuations, 0)
  await h.update({ configVersion: 2, repeatMode: 'stop', repeatMaxContinuations: 5,
    errorContinue: true, errorMaxContinuations: 7, errorContinuationPrompt: 'custom' })
  assert.equal(h.live.value.repeatMode, 'stop')
  assert.equal(h.live.value.errorContinue, true)
  await h.update({ configVersion: 2 })
  assert.equal(h.live.value.repeatMode, 'off')
  assert.equal(h.live.value.repeatMaxContinuations, 2)
  assert.equal(h.live.value.errorContinue, false)
  assert.equal(h.live.value.errorMaxContinuations, 2)
  assert.equal(h.live.value.errorContinuationPrompt, '')
})

for (const channel of ['text-delta', 'reasoning-delta'] as const) {
  test(`真实 Loader 更新同步到所属插件并控制 ${channel} 中止`, async t => {
    const h = await mount(true)
    t.after(() => h.root.fiber.dispose())
    assert.deepEqual(h.presentations, [h.fiber])
    const raw = h.fiber.config as any
    const repeatReference = raw.repeatMode
    assert.equal(h.live.current().repeatMode, 'off')
    const cancellations: unknown[] = []
    const agent: any = {
      session: { id: `test-${channel}` },
      cancel: (cause: unknown) => { cancellations.push(cause) },
    }
    h.root.emit(agentCarrier(agent), 'agent/assistant-stream', {
      agent, frame: { type: 'start', attemptId: '1', revision: 1, turn: 1, step: 1 },
    })
    const chunk = (text: string) => h.root.emit(agentCarrier(agent), 'agent/assistant-stream', {
      agent, frame: { type: 'chunk', attemptId: '1', revision: 1, index: 0, time: 0,
        chunk: { type: channel, index: 0, text } },
    })
    chunk('x'.repeat(300))
    assert.equal(cancellations.length, 0)

    await h.update({ repeatMode: 'continue', repeatMinChars: 512 })
    // 不调用 current(), 直接检查所属实例的更新监听器是否已刷新快照.
    assert.equal(h.live.value.repeatMode, 'continue')
    assert.equal(h.live.value.repeatMinChars, 512)
    assert.equal(h.fiber.config, raw)
    assert.equal(raw.repeatMode, repeatReference)
    chunk('x'.repeat(256))
    assert.equal(cancellations.length, 0)

    await h.update({ repeatMode: 'off', repeatMinChars: 512 })
    assert.equal(h.live.value.repeatMode, 'off')
    chunk('x'.repeat(1024))
    assert.equal(cancellations.length, 0)

    await h.update({ repeatMode: 'continue', repeatMinChars: 512 })
    chunk('x'.repeat(256))
    assert.equal(cancellations.length, 0)
    chunk('x'.repeat(256))
    assert.deepEqual(cancellations, [{ kind: 'hook', reason: REPEAT_CANCEL_REASON }])
  })
}

test('稳定配置引用即使没有更新监听器也读取最新字段, 未变化时复用归一化快照', async t => {
  const h = await mount(false)
  t.after(() => h.root.fiber.dispose())
  const raw = h.fiber.config
  assert.equal(h.live.current().repeatMode, 'off')
  await h.update({ repeatMode: 'continue', repeatMinRepeats: 6, repeatMinChars: 512,
    retryableCodes: ['SERVER'], overrides: [{ provider: '*', model: '*', maxRetries: 7,
      initialDelayMs: -1, maxDelayMs: -1, jitterRatio: -1 }] })
  assert.equal(h.fiber.config, raw)
  const live = h.live.current()
  assert.equal(live.repeatMode, 'continue')
  assert.equal(live.repeatMinRepeats, 6)
  assert.equal(live.repeatMinChars, 512)
  assert.deepEqual(live.retryableCodes, ['SERVER'])
  assert.equal(live.overrides[0]!.maxRetries, 7)
  const codes = live.retryableCodes
  const overrides = live.overrides
  assert.equal(h.live.current().retryableCodes, codes)
  assert.equal(h.live.current().overrides, overrides)
  await h.update({})
  assert.equal(h.live.current().repeatMode, 'off')
  assert.equal(h.live.current().repeatMinChars, 256)
})
