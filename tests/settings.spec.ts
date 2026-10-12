/** 配置草稿映射和发布产物的关键回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { RetrySettingsForm } from '../src/client/settings-form.ts'
import { DEFAULTS } from '../src/shared.ts'
import { migrateConfig } from '../src/config-migration.ts'
import { Config, normalizeConfig, unvol } from '../src/host/config.ts'

function form(initial = {}, legacy = false) {
  const submitted: any[] = []
  const scope: any = {
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 1,
      value: legacy ? initial : { ...DEFAULTS, ...initial }, base: { ...DEFAULTS }, user: initial }),
    subscribe: () => () => {},
    mutate: async (ops: any[]) => { submitted.push(ops); return true },
  }
  const draft = new RetrySettingsForm(scope)
  const face = draft.inject()
  return { draft, face, submitted, state: () => face.hooks.retryCard.getSnapshot() }
}

test('旧配置和 Schema 稳定引用迁移为独立组, 新模式优先且迁移幂等', () => {
  const old = { repeatDetection: true, autoContinue: false, continueOnError: true, maxContinuations: 0 }
  const migrated = migrateConfig(old)
  assert.equal(migrated.repeatMode, 'continue')
  assert.equal(migrated.repeatMaxContinuations, 2)
  assert.equal(migrated.errorContinue, false)
  assert.equal(migrated.errorMaxContinuations, 2)
  assert.equal(migrated.maxContinuations, 0)
  assert.deepEqual(migrateConfig(migrated), migrated)
  assert.equal(old.repeatDetection, true)
  const parsed = Config(old) as any
  assert.equal(normalizeConfig(parsed).repeatMode, 'continue')
  assert.equal(unvol(parsed.configVersion), 1)
  assert.equal(normalizeConfig({ configVersion: 2, repeatMode: 'stop', repeatDetection: true }).repeatMode, 'stop')
  assert.equal(normalizeConfig({ autoContinue: true, continueOnError: true }).errorContinue, true)
})

test('新字段保存为原始配置键和正确类型, 一次原子提交', async () => {
  const h = form()
  assert.equal(h.state().repeatMinRepeatsText, '8')
  assert.equal(h.state().repeatMinCharsText, '256')
  h.face.setRepeatMode('continue')
  h.face.editText('repeatMinRepeatsText', '6')
  h.face.edit('repeatMinCharsText', '512')
  h.face.editText('repeatContinuationPrompt', 'custom')
  h.face.editText('repeatMaxContinuationsText', '3')
  h.face.setErrorContinue(true)
  h.face.editText('errorMaxContinuationsText', '4')
  h.face.editText('errorContinuationPrompt', 'error-custom')
  assert.equal(h.state().invalid, false)
  await h.draft.save()
  assert.deepEqual(h.submitted, [[
    { op: 'set', path: ['repeatMode'], value: 'continue' },
    { op: 'set', path: ['repeatMinRepeats'], value: 6 },
    { op: 'set', path: ['repeatMinChars'], value: 512 },
    { op: 'set', path: ['repeatContinuationPrompt'], value: 'custom' },
    { op: 'set', path: ['repeatMaxContinuations'], value: 3 },
    { op: 'set', path: ['errorContinue'], value: true },
    { op: 'set', path: ['errorMaxContinuations'], value: 4 },
    { op: 'set', path: ['errorContinuationPrompt'], value: 'error-custom' },
  ]])
  h.draft.dispose()
})

test('旧表单预览与宿主迁移一致, 编辑新模式时一并原子写入版本且不覆盖草稿', async () => {
  const h = form({ repeatDetection: true, autoContinue: false }, true)
  assert.equal(h.state().repeatMode, 'continue')
  assert.equal(h.state().repeatMaxContinuationsText, '2')
  h.face.setRepeatMode('stop')
  h.face.editText('errorContinuationPrompt', 'custom-error')
  await h.draft.save()
  const ops = h.submitted[0]
  assert.equal(ops.filter((op: any) => op.path[0] === 'repeatMode').length, 1)
  assert.deepEqual(ops.find((op: any) => op.path[0] === 'repeatMode'), { op: 'set', path: ['repeatMode'], value: 'stop' })
  assert.deepEqual(ops.find((op: any) => op.path[0] === 'configVersion'), { op: 'set', path: ['configVersion'], value: 2 })
  assert.deepEqual(ops.find((op: any) => op.path[0] === 'repeatDetection'), { op: 'unset', path: ['repeatDetection'] })
  assert.deepEqual(ops.find((op: any) => op.path[0] === 'errorContinuationPrompt'), { op: 'set', path: ['errorContinuationPrompt'], value: 'custom-error' })
  h.draft.dispose()
})

test('越界和空白阈值禁止保存, 恢复默认逐字段 unset', async () => {
  for (const [field, value] of [
    ['repeatMinRepeatsText', '2'], ['repeatMinRepeatsText', '21'],
    ['repeatMinCharsText', '63'], ['repeatMinCharsText', '8193'], ['repeatMinCharsText', ''],
  ] as const) {
    const h = form()
    h.face.editText(field, value)
    assert.equal(h.state().invalid, true)
    await h.draft.save()
    assert.equal(h.submitted.length, 0)
    h.draft.dispose()
  }
  const h = form({ repeatMode: 'continue', repeatMinRepeats: 7, repeatMinChars: 512, repeatContinuationPrompt: 'custom' })
  for (const field of ['repeatMode', 'repeatMinRepeats', 'repeatMinChars', 'repeatContinuationPrompt']) h.face.resetField(field)
  assert.equal(h.state().repeatMode, 'off')
  assert.equal(h.state().repeatMinRepeatsText, '8')
  assert.equal(h.state().repeatMinCharsText, '256')
  assert.equal(h.state().repeatContinuationPrompt, '')
  await h.draft.save()
  assert.deepEqual(h.submitted[0], [
    { op: 'unset', path: ['repeatMode'] },
    { op: 'unset', path: ['repeatMinRepeats'] },
    { op: 'unset', path: ['repeatMinChars'] },
    { op: 'unset', path: ['repeatContinuationPrompt'] },
  ])
  h.draft.dispose()
})
