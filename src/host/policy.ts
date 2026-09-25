/**
 * 重试策略覆盖.
 *
 * 用 `prepend` 抢在官方 `@deepseek-ai/dsh-llm-retry` 的 recover 之前改写
 * `retryPolicy`: 额外 retryableCodes 与 provider 内置列表取并集, 次数/退避/抖动直接
 * 覆盖. `enabled=false` (默认) 时完全旁路, 不改任何东西.
 * @module dsh-llm-retry-settings/host/policy
 */

import type { Context } from '@deepseek-ai/cordis'
// 类型侧导入: 它把 `agent/request-error` 并进 cordis 的 Events 表, 运行时不需要这个包.
import type {} from '@deepseek-ai/dsh-agent'
import type { PolicyOverride } from '../shared.ts'
import { diag } from './diag.ts'
import type { LiveConfig } from './live-config.ts'
import type { Observer } from './observation.ts'
import type { SessionModels } from './session-models.ts'

/** 宿主传给 `agent/request-error` 的载荷 (只声明本插件读的字段). */
export interface RequestErrorPayload {
  retryPolicy?: RetryPolicyLike | undefined
  code?: string | undefined
  failure?: { code?: string } | undefined
  provider?: string | undefined
  turn?: number | undefined
  agent?: { session?: { id?: unknown } } | undefined
}

/** 官方重试策略里本插件读写的字段; 其余字段靠展开原样透传. */
export interface RetryPolicyLike {
  mode?: string | undefined
  maxRetries?: number | undefined
  retryableCodes?: readonly string[] | undefined
  initialDelayMs?: number | undefined
  maxDelayMs?: number | undefined
  jitterRatio?: number | undefined
}

/** 通配匹配的编译缓存. */
const globCache = new Map<string, RegExp>()

/** 通配匹配: 空串与 `*` 都是 "任意", 其余支持 `*` (大小写不敏感). */
export function globMatch(pattern: string, value: string): boolean {
  const normalized = (pattern ?? '').trim().toLowerCase()
  if (normalized === '' || normalized === '*') return true
  const candidate = (value ?? '').toLowerCase()
  if (!normalized.includes('*')) return normalized === candidate
  let pattern$ = globCache.get(normalized)
  if (pattern$ === undefined) {
    const escaped = normalized
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')
    pattern$ = new RegExp(`^${escaped}$`)
    if (globCache.size > 64) globCache.clear()
    globCache.set(normalized, pattern$)
  }
  return pattern$.test(candidate)
}

/**
 * 第一条命中的覆盖行.
 *
 * model 未知 (宿主还没见到请求元数据) 时只匹配 provider——写了具体 model 的行不会
 * "盲中", 宁可回退全局值也不猜.
 */
export function matchOverride(
  rows: PolicyOverride[],
  provider: string,
  model: string,
): PolicyOverride | undefined {
  return rows.find((row) => {
    if (row === null || row === undefined) return false
    const rowModel = (row.model ?? '').trim()
    if (!globMatch(row.provider, provider)) return false
    if (rowModel === '' || rowModel === '*') return true
    return model !== '' && globMatch(rowModel, model)
  })
}

/**
 * 挂上重试策略覆盖.
 * @param ctx - 插件上下文.
 * @param live - 生效配置的读取口.
 * @param models - 会话模型缓存 (overrides 的 model 匹配用).
 * @param observer - 观测计数.
 */
export function installRetryPolicy(
  ctx: Context,
  live: LiveConfig,
  models: SessionModels,
  observer: Observer,
): void {
  ctx.on(
    'agent/request-error',
    (rawPayload, next) => {
      // 载荷形状由内核的 `agent/request-error` 声明; 这里只读其中几个字段, 写回
      // retryPolicy 时按本插件读写的字段面收敛 (见 RetryPolicyLike), 其余字段靠展开
      // 原样透传.
      const payload = rawPayload as unknown as RequestErrorPayload
      // 事件时刻重读: 不依赖 scope.watch 是否回调过.
      const config = live.current()
      // 诊断锚点: agent/* 钩子能不能到达本插件 (核心功能全靠它). 若 host.log 里只见
      // 这条不见 turn/end 那条, 说明 session/event 派发不到这里; 两条都没有则是整个
      // agent/* 链路的问题 (重试覆盖同样失效).
      const code = payload.code ?? payload.failure?.code ?? ''
      const provider = typeof payload.provider === 'string' ? payload.provider : ''
      const sessionId = String(payload.agent?.session?.id ?? '')
      const model = models.modelOf(sessionId)
      const override = matchOverride(config.overrides, provider, model)
      const effective = {
        maxRetries: override && override.maxRetries >= 0 ? override.maxRetries : config.maxRetries,
        initialDelayMs: override && override.initialDelayMs >= 0 ? override.initialDelayMs : config.initialDelayMs,
        maxDelayMs: override && override.maxDelayMs >= 0 ? override.maxDelayMs : config.maxDelayMs,
        jitterRatio: override && override.jitterRatio >= 0 ? override.jitterRatio : config.jitterRatio,
      }
      diag(
        `request-error enabled=${config.enabled} code=${code || '(n/a)'} provider=${provider || '(n/a)'}`
        + ` model=${model || '(n/a)'}${override ? ` override=${override.provider}/${override.model}` : ''}`,
      )
      if (config.enabled) {
        observer.retry({
          code,
          provider,
          model,
          turn: payload.turn,
          delayMs: effective.initialDelayMs,
        })
      }
      if (config.enabled && payload.retryPolicy !== undefined && payload.retryPolicy !== null) {
        const policy = payload.retryPolicy
        // retryableCodes 与 provider 默认值取并集 (补充不覆盖), 让 INVALID_REQUEST
        // 这类自定义码生效.
        const mergedCodes = config.retryableCodes.length > 0
          ? [...new Set([...(policy.retryableCodes ?? []), ...config.retryableCodes])]
          : policy.retryableCodes
        payload.retryPolicy = {
          ...policy,
          ...(policy.mode === 'normal' ? { maxRetries: effective.maxRetries } : {}),
          ...(mergedCodes === undefined ? {} : { retryableCodes: mergedCodes }),
          initialDelayMs: effective.initialDelayMs,
          maxDelayMs: effective.maxDelayMs,
          jitterRatio: effective.jitterRatio,
        }
      }
      return next()
    },
    { prepend: true },
  )
}
