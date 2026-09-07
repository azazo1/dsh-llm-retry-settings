/**
 * dsh-llm-retry-settings host half.
 */
import type { Context } from '@deepseek-ai/cordis'
export declare const name = "dsh-llm-retry-settings"
export declare const inject: string[]
export declare const DEFAULTS: {
    readonly enabled: false
    readonly maxRetries: 5
    readonly initialDelayMs: 500
    readonly maxDelayMs: 10000
    readonly jitterRatio: 0.1
    readonly retryableCodes: readonly string[]
    readonly autoContinue: false
    readonly maxContinuations: 2
}
export interface Config {
    enabled: boolean
    maxRetries: number
    initialDelayMs: number
    maxDelayMs: number
    jitterRatio: number
    retryableCodes: string[]
    autoContinue: boolean
    maxContinuations: number
}
export declare const Config: any
export declare function apply(ctx: Context, config: Partial<Config> | undefined): void
