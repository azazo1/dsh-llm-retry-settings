/** 配置格式迁移, 供宿主与设置草稿共同使用. */
import { CONFIG_VERSION, DEFAULTS, type Config } from './shared.ts'

const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')

/** 解 volatile 稳定引用, 普通配置值原样返回. */
export function unvol<T>(value: T): T {
  if (value !== null && typeof value === 'object' && VOLATILE_WRITE in value) {
    const get = (value as { get?: () => unknown }).get
    if (typeof get === 'function') return get() as T
  }
  return value
}

/** 不修改输入. 先解引用再迁移, 避免 Schema 默认值遮住旧字段. */
export function migrateConfig(raw: Partial<Config> | undefined | null): Partial<Config> {
  if (!raw) return {}
  const next = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, unvol(value)])) as Partial<Config>
  if (typeof next.configVersion === 'number' && next.configVersion >= CONFIG_VERSION) {
    // 新字段从 profile unset 后, Schema 的空值代表恢复默认, 不能沿用缓存旧值.
    for (const key of ['repeatMode', 'repeatMaxContinuations', 'errorContinue', 'errorMaxContinuations', 'errorContinuationPrompt'] as const) {
      if (Object.hasOwn(next, key) && next[key] === undefined) Object.assign(next, { [key]: DEFAULTS[key] })
    }
    return next
  }
  next.repeatMode ??= next.repeatDetection === true ? 'continue' : DEFAULTS.repeatMode
  next.repeatMaxContinuations ??= DEFAULTS.repeatMaxContinuations
  // 错误恢复迁移保持原实际开关状态, 此后与 token 续写完全独立.
  next.errorContinue ??= next.autoContinue === true && next.continueOnError === true
  next.errorMaxContinuations ??= DEFAULTS.errorMaxContinuations
  next.errorContinuationPrompt ??= next.continuationPrompt ?? ''
  next.configVersion = CONFIG_VERSION
  delete next.repeatDetection
  delete next.continueOnError
  return next
}

/** 首次写入的新版字段, 不将旧的共用上限带入独立恢复组. */
export function migrationPatch(raw: Partial<Config>): Partial<Config> {
  const next = migrateConfig(raw)
  return {
    configVersion: CONFIG_VERSION,
    repeatMode: next.repeatMode,
    repeatMaxContinuations: next.repeatMaxContinuations,
    errorContinue: next.errorContinue,
    errorMaxContinuations: next.errorMaxContinuations,
    errorContinuationPrompt: next.errorContinuationPrompt,
  }
}
