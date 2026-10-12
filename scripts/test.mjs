/** 复用现有 esbuild 和 Node 测试框架, 不新增测试依赖. */
import { build } from 'esbuild'
import { mkdirSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const outdir = path.join(root, '.tmp/tests')
mkdirSync(outdir, { recursive: true })
const tests = readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.spec.ts'))
console.log(`编译 ${tests.length} 个测试文件`)
const outputs = await Promise.all(tests.map(async name => {
  const outfile = path.join(outdir, name.replace(/\.ts$/, '.mjs'))
  await build({ entryPoints: [path.join(root, 'tests', name)], outfile,
    bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning',
    external: ['@deepseek-ai/cordis', '@deepseek-ai/cordis-plugin-loader', '@deepseek-ai/dsh-agent'],
    // 浏览器平台模块由宿主提供, 草稿测试仅替换 store, 不安装其整套前端依赖.
    plugins: [{ name: 'test-platform-store', setup(build) {
      build.onResolve({ filter: /^@deepseek-ai\/dsh-client-store$/ }, () => ({
        path: path.join(root, 'tests/helpers/snapshot-store.ts'),
      }))
    } }],
  })
  return outfile
}))
// 诊断日志限制在测试目录内, 不写入 user 正在使用的 DSH home.
const result = spawnSync(process.execPath, ['--test', ...outputs], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DSH_HOME: path.join(outdir, 'dsh-home') },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
