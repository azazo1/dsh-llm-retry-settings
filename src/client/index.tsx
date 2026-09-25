/**
 * Client 半区入口: 在插件管理页本 bundle 的详情页上注册配置卡片.
 *
 * 表单绑定 Host 的 profile 条目 (`ENTRY_ID`), 保存的值写进 profile 的 patch 层并由
 * `loader/volatile-update` 实时生效 (不重挂载插件). 观测面板的数据来自宿主经 `/api`
 * 通道注册的两条只读路由.
 *
 * 构建产物是 CJS 形态的 loader 模块: 构建脚本以 banner/footer 包裹为
 * `window.__ModuleLoader__.load({ id, factory: (require) => ... })`, react 与
 * ui-primitives 等平台模块经 factory 注入的 require 解析, 其余全部内联.
 * @module dsh-llm-retry-settings/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 以下都是类型侧导入: 它们把 ctx.locale / ctx.configForms / ctx.slots 与
// `plugins.bundle.config` 槽位的类型并进 Context, 运行时不需要这些包.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { ENTRY_ID, LOG_FILE_DISPLAY, PACKAGE_NAME } from '../shared.ts'
import { RetrySettingsCard, type OpenLogResult } from './card.tsx'
import { en, zh } from './locales.ts'
import { RetrySettingsForm, type RetrySettings } from './settings-form.ts'
import { installStyles } from './styles.ts'

export type { OpenLogResult, RetrySettingsCardProps } from './card.tsx'
export type { RetryCardFace, RetryCardState, RetrySettings } from './settings-form.ts'

/** 文案命名空间: 与 profile 条目 id 同名, 便于对照. */
const LOCALE_NS = ENTRY_ID

/** 页面依赖的服务: configForms 提供配置通道, slots 提供注册面, locale 提供文案. */
export const inject = ['configForms', 'slots', 'locale']

/** 会话 Remote 里本插件用到的路径手势 (最小结构类型). */
interface PathRemote {
  session?: {
    openWorkspacePath?: (request: { path: string; action: 'reveal' }) => Promise<{ ok: boolean }>
  }
}

/**
 * 注册插件页的配置卡片.
 * @param ctx - 浏览器插件上下文.
 */
export function apply(ctx: ClientContext): void {
  installStyles()
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-llm-retry-settings: dictionaries')

  const scope = ctx.configForms.get<RetrySettings>(ENTRY_ID)
  const form = new RetrySettingsForm(scope)
  ctx.effect(() => () => { form.dispose() }, 'dsh-llm-retry-settings: settings form')

  // 先在宿主桌面里定位日志文件 (会话 Remote 会校验路径确实映射到宿主文件系统),
  // 拿不到宿主路径或宿主打不开时退回复制路径.
  const openLog = async (): Promise<OpenLogResult> => {
    const value = scope.getSnapshot().value
    const path = typeof value?.logPath === 'string' && value.logPath !== '' ? value.logPath : ''
    if (path !== '') {
      try {
        const remote = ctx.get('remote') as PathRemote | undefined
        const result = await remote?.session?.openWorkspacePath?.({ path, action: 'reveal' })
        if (result?.ok === true) return 'revealed'
      } catch {
        /* 落到复制路径 */
      }
    }
    return (await writeClipboard(path === '' ? LOG_FILE_DISPLAY : path)) ? 'copied' : 'manual'
  }

  // Host 没有组合这一条目时 (profile 里没启用本 bundle) 卡片不出现.
  ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(
    'plugins.bundle.config',
    () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: PACKAGE_NAME,
      locale: LOCALE_NS,
      inject: () => ({ ...form.inject(), openLog }),
    }, RetrySettingsCard),
  )), 'dsh-llm-retry-settings: plugins page card')
}
