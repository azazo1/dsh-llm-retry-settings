/**
 * 生效配置的唯一读取口.
 *
 * volatile 写入保留配置对象和字段引用, 每次操作必须比较字段的实际值.
 * 值没变时复用归一化快照, 值变化时重新收敛, 不依赖更新事件一定到达.
 * @module dsh-llm-retry-settings/host/live-config
 */

import type { Config } from '../shared.ts'
import { coerceConfig, normalizeConfig, unvol } from './config.ts'
import { diag, setDiagActive } from './diag.ts'

/** 插件解析后的配置读取口. */
export interface ConfigScope {
  get(): Partial<Config>
}

/** 当前生效的配置, 带 settings 重读与字段级叠加. */
export class LiveConfig {
  private live: Config
  /** settings scope 句柄; 服务未就绪时为 undefined. */
  private scope: ConfigScope | undefined
  /** 上一次收敛的配置对象及其字段值, volatile 的 get() 返回稳定的不可变快照. */
  private lastRaw: Partial<Config> | null = null
  private readonly lastValues = new Map<string, unknown>()

  /**
   * @param config - 插件激活时 Loader 解析出的 Config.
   */
  constructor(config: Partial<Config> | undefined) {
    this.live = normalizeConfig(config)
    setDiagActive(this.live.enabled || this.live.autoContinue || this.live.errorContinue || this.live.repeatMode !== 'off')
  }

  /** 最近一次同步后的值 (不触发重读). */
  get value(): Config {
    return this.live
  }

  /** 每次操作读取配置字段的最新值, 失败时沿用上次的有效快照. */
  current(): Config {
    const scope = this.scope
    if (scope !== undefined) {
      try {
        const raw = scope.get()
        if (raw !== this.lastRaw || this.fieldsChanged(raw)) this.sync(raw)
      } catch (error) {
        diag(`scope.get 失败，沿用 live：${String(error)}`)
      }
    }
    return this.live
  }

  /** 绑定 settings 作用域句柄. */
  bindScope(scope: ConfigScope): void {
    this.scope = scope
  }

  /** 逐字段解引用比较, 热路径不复制配置或数组. */
  private fieldsChanged(raw: Partial<Config>): boolean {
    let count = 0
    for (const key in raw) {
      if (!Object.hasOwn(raw, key)) continue
      count += 1
      if (!this.lastValues.has(key)
        || !Object.is(unvol(raw[key as keyof Config]), this.lastValues.get(key))) return true
    }
    return count !== this.lastValues.size
  }

  /** 字段级叠加: 给出且类型合法的字段才覆盖, 其余保留现值. */
  sync(next: Partial<Config> | undefined | null): void {
    if (next === null || next === undefined || typeof next !== 'object') return
    Object.assign(this.live, coerceConfig(next, this.live))
    this.lastRaw = next
    this.lastValues.clear()
    for (const key in next) {
      if (Object.hasOwn(next, key)) this.lastValues.set(key, unvol(next[key as keyof Config]))
    }
    // 任一功能开启时记录诊断, 全部关闭时不写盘.
    setDiagActive(this.live.enabled || this.live.autoContinue || this.live.errorContinue || this.live.repeatMode !== 'off')
  }
}
