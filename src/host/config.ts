/**
 * 配置 schema 与归一化.
 *
 * schema 只声明形状与边界; 归一化是第二道防线——设置服务传进来的裸值不一定过了
 * schema (volatile 引用对象, 半截 patch, 手写 profile), 所以字段级收敛必须自己再做一次.
 * @module dsh-llm-retry-settings/host/config
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULTS,
  OVERRIDE_INHERIT,
  OVERRIDE_MAX_ROWS,
  // 本模块要导出名为 `Config` 的 schema 值 (内核按运行时模块的 `.Config` 取它),
  // 所以配置形状的类型在这里换个名字.
  type Config as ConfigShape,
  type PolicyOverride,
} from '../shared.ts'

/** 插件日志目录: `DSH_HOME` (默认 `~/.dsh`) 下的 `logs/<包名>`. */
export const LOG_DIR = (() => {
  const home = process.env['DSH_HOME'] && process.env['DSH_HOME'].trim() !== ''
    ? process.env['DSH_HOME'].trim()
    : join(homedir(), '.dsh')
  return join(home, 'logs', 'dsh-llm-retry-settings')
})()

/** `host.log` 绝对路径: 同时作为只读 `logPath` 暴露给卡片, 卡片用它打开日志. */
export const LOG_FILE = join(LOG_DIR, 'host.log')

/**
 * Config schema.
 *
 * 0.1.7 的设置表单只渲染 `.volatile()` 过的字段 (`volatileForm()` 过滤, 一个 volatile
 * 字段都没有就 0 行, 条目等于不可配置), 所以可编辑字段逐个标 volatile.
 *
 * volatile 的粒度: schemastery 要求 volatile 字段是固定对象路径且不能嵌套在另一个
 * volatile 字段内, 而 `volatileForm` 只下钻 `z.object` (数组节点不下钻)——所以顶层标量
 * 逐个标, `overrides` 整块作为**一个** volatile 字段, 不逐项标.
 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULTS.enabled).volatile(),
  maxRetries: z.number().step(1).min(0).default(DEFAULTS.maxRetries).volatile(),
  initialDelayMs: z.number().min(1).default(DEFAULTS.initialDelayMs).volatile(),
  maxDelayMs: z.number().min(1).default(DEFAULTS.maxDelayMs).volatile(),
  jitterRatio: z.number().min(0).max(1).default(DEFAULTS.jitterRatio).volatile(),
  retryableCodes: z.array(z.string()).default([...DEFAULTS.retryableCodes]).volatile(),
  autoContinue: z.boolean().default(DEFAULTS.autoContinue).volatile(),
  maxContinuations: z.number().step(1).min(0).default(DEFAULTS.maxContinuations).volatile(),
  continuationPrompt: z.string().default(DEFAULTS.continuationPrompt).volatile(),
  continueOnError: z.boolean().default(DEFAULTS.continueOnError).volatile(),
  overrides: z
    .array(
      z.object({
        provider: z.string().default('*'),
        model: z.string().default('*'),
        maxRetries: z.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
        initialDelayMs: z.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
        maxDelayMs: z.number().step(1).min(OVERRIDE_INHERIT).default(OVERRIDE_INHERIT),
        jitterRatio: z.number().min(OVERRIDE_INHERIT).max(1).default(OVERRIDE_INHERIT),
      }),
    )
    .default([])
    .volatile(),
  logPath: z.string().default(LOG_FILE).volatile(),
})

/** 0.1.7 的 volatile 字段解析结果是 cosmokit 的引用对象, 取值要 `.get()`. */
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** 解 volatile 引用对象; 普通值原样返回. */
export function unvol<T>(value: T): T {
  if (value !== null && typeof value === 'object' && VOLATILE_WRITE in (value as object)) {
    const get = (value as { get?: () => unknown }).get
    if (typeof get === 'function') return get() as T
  }
  return value
}

/** 只留非空字符串. */
const normCodes = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((code): code is string => typeof code === 'string' && code.length > 0) : []

/** 字段收敛器: 类型不符返回 undefined, 由调用方决定回退到现值还是默认值. */
const asBool = (value: unknown): boolean | undefined => {
  const raw = unvol(value)
  return typeof raw === 'boolean' ? raw : undefined
}

const asInt = (value: unknown, min: number): number | undefined => {
  const raw = unvol(value)
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, Math.floor(raw)) : undefined
}

const asFloat = (value: unknown, min: number, max: number): number | undefined => {
  const raw = unvol(value)
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : undefined
}

/** 覆盖行收敛: 丢掉空行, trim, 哨兵值兜底, 数量封顶. */
export function normOverrides(raw: unknown, fallback: PolicyOverride[]): PolicyOverride[] {
  if (!Array.isArray(raw)) return fallback.map((row) => ({ ...row }))
  const rows: PolicyOverride[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const row = item as Partial<PolicyOverride>
    const provider = typeof row.provider === 'string' ? row.provider.trim() : ''
    const model = typeof row.model === 'string' ? row.model.trim() : ''
    if (provider === '' && model === '') continue
    rows.push({
      provider: provider === '' ? '*' : provider,
      model: model === '' ? '*' : model,
      maxRetries: asInt(row.maxRetries, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      initialDelayMs: asInt(row.initialDelayMs, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      maxDelayMs: asInt(row.maxDelayMs, OVERRIDE_INHERIT) ?? OVERRIDE_INHERIT,
      jitterRatio: asFloat(row.jitterRatio, OVERRIDE_INHERIT, 1) ?? OVERRIDE_INHERIT,
    })
  }
  return rows.slice(0, OVERRIDE_MAX_ROWS)
}

/** `DEFAULTS` 的 Config 视图 (`logPath` 由宿主解析). */
export const DEFAULTS_CONFIG: ConfigShape = { ...DEFAULTS, logPath: LOG_FILE }

/**
 * 字段级收敛的唯一实现: `raw` 中类型合法的字段覆盖 `fallback`, 其余保留 `fallback`.
 *
 * 两个调用点 (激活时的归一化, 事件时刻的重读) 共用这一张字段表, 新增字段只改这里一处.
 * 越界夹紧, 类型不符回退, 非法码过滤, 退避下限封顶都在此统一完成.
 */
export function coerceConfig(raw: Partial<ConfigShape> | undefined | null, fallback: ConfigShape): ConfigShape {
  const codes = unvol(raw?.retryableCodes)
  const prompt = unvol(raw?.continuationPrompt)
  const overrides = unvol(raw?.overrides)
  const logPath = unvol(raw?.logPath)
  const config: ConfigShape = {
    enabled: asBool(raw?.enabled) ?? fallback.enabled,
    maxRetries: asInt(raw?.maxRetries, 0) ?? fallback.maxRetries,
    initialDelayMs: asInt(raw?.initialDelayMs, 1) ?? fallback.initialDelayMs,
    maxDelayMs: asInt(raw?.maxDelayMs, 1) ?? fallback.maxDelayMs,
    jitterRatio: asFloat(raw?.jitterRatio, 0, 1) ?? fallback.jitterRatio,
    retryableCodes: Array.isArray(codes) ? normCodes(codes) : [...fallback.retryableCodes],
    autoContinue: asBool(raw?.autoContinue) ?? fallback.autoContinue,
    maxContinuations: asInt(raw?.maxContinuations, 0) ?? fallback.maxContinuations,
    continuationPrompt: typeof prompt === 'string' ? prompt : fallback.continuationPrompt,
    continueOnError: asBool(raw?.continueOnError) ?? fallback.continueOnError,
    overrides: normOverrides(overrides, fallback.overrides),
    logPath: typeof logPath === 'string' && logPath !== '' ? logPath : fallback.logPath,
  }
  if (config.initialDelayMs > config.maxDelayMs) config.initialDelayMs = config.maxDelayMs
  return config
}

/** 裸值收敛成合法 Config (回退值取内置默认). */
export function normalizeConfig(raw: Partial<ConfigShape> | undefined | null): ConfigShape {
  return coerceConfig(raw, DEFAULTS_CONFIG)
}
