/**
 * 构建脚本 (跨平台 node 版):
 *   1. 宿主: src/index.ts → lib/index.js (ESM 自包含 bundle, node20)
 *   2. 客户端: src/client/index.tsx → CJS bundle → 包 window.__ModuleLoader__.load 壳 → lib/client.js
 *
 * esbuild 经 JS API 调用 (0.28.x, pnpm 布局下 createRequire 可解析; .bin shim 在
 * Windows/pnpm 下不可靠, 勿用). 客户端中间产物只在内存, 不落盘.
 *
 * 客户端只外置宿主页面已经共享的平台模块 (`PLATFORM_MODULES`, 见
 * `packages/client/web/src/platform.ts`); 其余 (含 schemastery 与各 client 包的
 * 类型声明) 一律内联或被类型擦除.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require = createRequire(path.join(root, 'package.json'))
const esbuild = require('esbuild')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

/** 注册 id = 包名: loader 按插件 id 找模块表里的同名工厂. */
const CLIENT_ID = manifest.name

/** 页面冻结模块表里的平台模块; 不在这里的一律打进 bundle. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

// 1) 宿主半边: ESM 自包含——运行环境是链接进 profile 的插件包, 没有完整依赖树
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: path.join(root, 'lib/index.js'),
  logLevel: 'info',
})

// 2) 客户端半边: 浏览器 CJS, 平台模块由页面 runtime 经 factory 注入的 require 提供
const raw = esbuild
  .buildSync({
    entryPoints: [path.join(root, 'src/client/index.tsx')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: PLATFORM_MODULES,
    // 浏览器产物走压缩: 这张卡片的文案/字典/清单让它长得快, 但首屏只加载这一份
    // (宿主 bundle 不压缩——出问题时 lib/index.js 还得能直接读).
    minify: true,
    write: false,
    logLevel: 'info',
  })
  .outputFiles[0].text

// 包上 __ModuleLoader__ 壳 (web 端插件加载约定): factory 内自建 module/exports,
// 返回 module.exports
const wrapped =
  `window.__ModuleLoader__.load({id: ${JSON.stringify(CLIENT_ID)},factory: (require) => {` +
  `var module = { exports: {} };var exports = module.exports;` +
  '\n' +
  raw.trimEnd() +
  '\nreturn module.exports;}\n});\n'
fs.writeFileSync(path.join(root, 'lib/client.js'), wrapped)

console.log('build done: lib/index.js + lib/client.js')
