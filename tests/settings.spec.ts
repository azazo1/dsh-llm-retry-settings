/** 配置草稿映射和发布产物的关键回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { RetrySettingsForm } from '../src/client/settings-form.ts'
import { DEFAULTS } from '../src/shared.ts'

function form(initial = {}) {
  const submitted: any[] = []
  const scope: any = {
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 1,
      value: { ...DEFAULTS, ...initial }, base: { ...DEFAULTS }, user: initial }),
    subscribe: () => () => {},
    mutate: async (ops: any[]) => { submitted.push(ops); return true },
  }
  const draft = new RetrySettingsForm(scope)
  const face = draft.inject()
  return { draft, face, submitted, state: () => face.hooks.retryCard.getSnapshot() }
}

test('新字段保存为原始配置键和正确类型, 一次原子提交', async () => {
  const h = form()
  assert.equal(h.state().repeatMinRepeatsText, '8')
  assert.equal(h.state().repeatMinCharsText, '256')
  h.face.setRepeatDetection(true)
  h.face.editText('repeatMinRepeatsText', '6')
  h.face.edit('repeatMinCharsText', '512')
  h.face.editText('repeatContinuationPrompt', 'custom')
  assert.equal(h.state().invalid, false)
  await h.draft.save()
  assert.deepEqual(h.submitted, [[
    { op: 'set', path: ['repeatDetection'], value: true },
    { op: 'set', path: ['repeatMinRepeats'], value: 6 },
    { op: 'set', path: ['repeatMinChars'], value: 512 },
    { op: 'set', path: ['repeatContinuationPrompt'], value: 'custom' },
  ]])
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
  const h = form({ repeatDetection: true, repeatMinRepeats: 7, repeatMinChars: 512, repeatContinuationPrompt: 'custom' })
  for (const field of ['repeatDetection', 'repeatMinRepeats', 'repeatMinChars', 'repeatContinuationPrompt']) h.face.resetField(field)
  assert.equal(h.state().repeatDetection, false)
  assert.equal(h.state().repeatMinRepeatsText, '8')
  assert.equal(h.state().repeatMinCharsText, '256')
  assert.equal(h.state().repeatContinuationPrompt, '')
  await h.draft.save()
  assert.deepEqual(h.submitted[0], [
    { op: 'unset', path: ['repeatDetection'] },
    { op: 'unset', path: ['repeatMinRepeats'] },
    { op: 'unset', path: ['repeatMinChars'] },
    { op: 'unset', path: ['repeatContinuationPrompt'] },
  ])
  h.draft.dispose()
})
