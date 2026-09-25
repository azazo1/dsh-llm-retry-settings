/**
 * dsh-llm-retry-settings 宿主半区的对外类型面.
 *
 * 手写维护: 构建脚本只产 lib/index.js 与 lib/client.js, 不发声明文件; 这里与
 * src/shared.ts 的 Config / PolicyOverride 保持一致, 改动时同步.
 */
import type { Context } from '@deepseek-ai/cordis'

/** 单条 provider/model 覆盖; 数值字段为 -1 时继承全局值. */
export interface PolicyOverride {
  provider: string
  model: string
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
}

/** 生效配置的形状. */
export interface Config {
  enabled: boolean
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
  retryableCodes: string[]
  autoContinue: boolean
  maxContinuations: number
  continuationPrompt: string
  continueOnError: boolean
  overrides: PolicyOverride[]
  logPath: string
}

/** 卡片渲染用的配置视图: `logPath` 缺席时由卡片自行兜底. */
export type ConfigView = Omit<Config, 'logPath'> & { logPath?: string }

export declare const name = "dsh-llm-retry-settings"
export declare const inject: string[]
export declare const DEFAULTS: {
    readonly enabled: boolean
    readonly maxRetries: number
    readonly initialDelayMs: number
    readonly maxDelayMs: number
    readonly jitterRatio: number
    readonly retryableCodes: string[]
    readonly autoContinue: boolean
    readonly maxContinuations: number
    readonly continuationPrompt: string
    readonly continueOnError: boolean
    readonly overrides: PolicyOverride[]
}
/** schemastery schema; 每个可编辑字段都标了 `.volatile()`. */
export declare const Config: unknown
export declare function apply(ctx: Context, config: Partial<Config> | undefined): void
