/**
 * dsh-llm-retry-settings — 宿主半区入口.
 *
 * 本插件做四件事:
 *  1. 把配置挂进内核的设置表单 (`settings.configure`), 命名空间 = profile 条目 id.
 *  2. `agent/request-error` 上以 prepend 改写 retryPolicy: 次数/退避/抖动覆盖,
 *     额外 retryableCodes 与 provider 内置列表取并集. `enabled=false` 时完全旁路.
 *  3. `autoContinue=true` 时监听 `turn/end`, 输出被 token 上限截断就补一轮续写.
 *  4. 两条只读观测路由, 经 `/api` 通道暴露内存计数与 host.log 尾部.
 *
 * 配置页在浏览器半区 (src/client), 注册到插件管理页本 bundle 的详情页上.
 * @module dsh-llm-retry-settings
 */

import type { Context } from '@deepseek-ai/cordis'
import { DEFAULTS, type Config as RetryConfig } from './shared.ts'
import { AutoContinue } from './host/auto-continue.ts'
import { Config as ConfigSchema } from './host/config.ts'
import { DIAG_TAG, diag, summaryOf } from './host/diag.ts'
import { LiveConfig } from './host/live-config.ts'
import { installObservationRoutes, Observer } from './host/observation.ts'
import { installRetryPolicy } from './host/policy.ts'
import { SessionModels } from './host/session-models.ts'
import { installSettings } from './host/settings.ts'

export const name = 'dsh-llm-retry-settings'

/** 硬依赖: 设置表单, agent 注册表与 session 事件流. */
export const inject = ['settings', 'agents', 'sessions']

export { ConfigSchema as Config, DEFAULTS }
// 配置形状的类型只能换个名字导出: 同一个模块里 `Config` 这个名字已经被 schema 值占了
// (内核按运行时模块的 `.Config` 取 schema).
export type { RetryConfig }
export type { ConfigView, PolicyOverride } from './shared.ts'

/**
 * 装配插件.
 * @param ctx - 插件上下文.
 * @param config - Loader 解析出的 Config (volatile 字段写入会原地改这个对象).
 */
export function apply(ctx: Context, config: Partial<RetryConfig> | undefined): void {
  const live = new LiveConfig(config)
  const models = new SessionModels()
  const observer = new Observer()
  diag(`activate ${DIAG_TAG} pid=${process.pid} inject=[${inject.join(',')}] ${summaryOf(live.value)}`)

  installSettings(ctx, live, config)
  installRetryPolicy(ctx, live, models, observer)
  new AutoContinue(ctx, live, models, observer).install()
  installObservationRoutes(ctx, observer, {
    config: () => live.current(),
    models: () => models.snapshot(),
  })
}
