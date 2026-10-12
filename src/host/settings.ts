/**
 * 把本插件挂进最新内核的 SettingsForms.
 *
 * 0.1.7 起设置服务是 `@deepseek-ai/dsh-settings` 的 `SettingsForms`, 设置命名空间 =
 * profile 条目 id (`cordis.patch.yml` 的 `id:`), 表单字段来自 Config 里标了
 * `.volatile()` 的那些. `register` / `installSection` 那套旧接口已经不存在.
 * @module dsh-llm-retry-settings/host/settings
 */

import type { Context } from '@deepseek-ai/cordis'
// 类型侧导入: 它把 `loader/volatile-update` 并进 cordis 的 Events 表, 运行时不需要这个包.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { ENTRY_ID, type Config } from '../shared.ts'
import { diag, summaryOf } from './diag.ts'
import type { LiveConfig } from './live-config.ts'

/** settings 服务 (SettingsForms) 的最小结构类型. */
interface SettingsFormsLike {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void
}

/**
 * 声明本插件的表单呈现方式并接上实时同步.
 *
 * volatile 字段的写入不重挂插件, 更新事件只发送给配置所属的 fiber.
 * 在所属 ctx 上同步配置, settings 的注入子上下文只负责表单呈现.
 * @param ctx - 插件上下文.
 * @param live - 生效配置的读取口.
 * @param config - 插件激活时 Loader 解析出的 Config (volatile 写入会原地改它).
 */
export function installSettings(ctx: Context, live: LiveConfig, config: Partial<Config> | undefined): void {
  live.bindScope({ get: () => config as Partial<Config> })
  live.sync(config)
  // Loader 按所属 fiber 过滤事件, inject 创建的子 fiber 不会收到本配置的更新.
  ctx.on('loader/volatile-update', () => {
    live.sync(config)
    diag(`settings sync(volatile): ${summaryOf(live.value)}`)
  })
  ctx.inject(['settings'], (sctx: Context) => {
    try {
      const settings = (sctx as unknown as { settings?: SettingsFormsLike }).settings
      if (settings === undefined || typeof settings.configure !== 'function') {
        diag('settings 服务缺少 configure，跳过表单声明')
        return
      }
      // auto: false ⇒ 不为本条目自动生成设置页; 配置页由插件自己在插件管理页的
      // `plugins.bundle.config` 槽位上渲染 (见 src/client).
      try {
        sctx.effect(
          () => settings.configure({ auto: false }, ctx.fiber),
          'dsh-llm-retry-settings: settings presentation',
        )
      } catch (error) {
        diag(`settings.configure 失败（可能已配置过同一 fiber）：${String(error)}`)
      }
      diag(`settings presentation configured (ns=${ENTRY_ID}) ${summaryOf(live.value)}`)
    } catch (error) {
      diag(`settings 注册失败：${String(error)}`)
      ctx.logger.warn('[dsh-llm-retry-settings] settings 注册失败', error)
    }
  })
}
