/** 检查实际构建产物的宿主入口与客户端模块注册. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const allowed = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
])

test('原生 Node 可加载宿主 bundle, 新配置字段进入发布 Schema', async () => {
  const host = await import(pathToFileURL(resolve('lib/index.js')).href)
  assert.equal(typeof host.apply, 'function')
  assert.equal(host.name, 'dsh-llm-retry-settings')
  assert.equal(host.DEFAULTS.repeatDetection, false)
  const config = host.Config({ repeatDetection: true, repeatMinRepeats: 6, repeatMinChars: 512 })
  assert.ok(Object.hasOwn(config, 'repeatDetection'))
  assert.ok(Object.hasOwn(config, 'repeatContinuationPrompt'))
})

test('客户端 bundle 注册正确模块且只请求宿主平台表中的模块', () => {
  const registrations: any[] = []
  runInNewContext(readFileSync(resolve('lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load: (registration: any) => registrations.push(registration) } },
  })
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].id, 'dsh-llm-retry-settings')
  const plugin = registrations[0].factory((id: string) => {
    assert.ok(allowed.has(id), `不允许的运行时模块: ${id}`)
    return {}
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(plugin.inject.includes('configForms'))
})
