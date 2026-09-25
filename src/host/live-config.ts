/**
 * 生效配置的唯一读取口.
 *
 * 事件热路径上不信任 "配置已经在激活时读过一次": volatile 写入不重挂插件, 只在原地
 * 换引用, 任何一次漏同步都会让整条链路静默用旧值跑. 所以每个事件/请求时刻都问一次
 * settings, 引用没变才跳过整表收敛 (零分配).
 * @module dsh-llm-retry-settings/host/live-config
 */

import type { Config } from '../shared.ts'
import { coerceConfig, normalizeConfig } from './config.ts'
import { diag, setDiagActive } from './diag.ts'

/** settings 作用域的最小结构类型 (本包独立发布, 不 import 内核包的内部类型). */
export interface ConfigScope {
  get(): Partial<Config>
}

/** 当前生效的配置, 带 settings 重读与字段级叠加. */
export class LiveConfig {
  private live: Config
  /** settings scope 句柄; 服务未就绪时为 undefined. */
  private scope: ConfigScope | undefined
  /** 上一次收敛过的原始引用: 引用没变就跳过整表收敛. */
  private lastRaw: Partial<Config> | null = null

  /**
   * @param config - 插件激活时 Loader 解析出的 Config.
   */
  constructor(config: Partial<Config> | undefined) {
    this.live = normalizeConfig(config)
    setDiagActive(this.live.enabled || this.live.autoContinue)
  }

  /** 最近一次同步后的值 (不触发重读). */
  get value(): Config {
    return this.live
  }

  /** 事件/请求时刻的有效配置: 优先直接问 settings, 失败退回 live 快照. */
  current(): Config {
    const scope = this.scope
    if (scope !== undefined) {
      try {
        const raw = scope.get()
        if (raw !== this.lastRaw) this.sync(raw)
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

  /** 作废引用缓存, 让下一次 `current()` 强制重读. */
  invalidate(): void {
    this.lastRaw = null
  }

  /** 字段级叠加: 给出且类型合法的字段才覆盖, 其余保留现值. */
  sync(next: Partial<Config> | undefined | null): void {
    if (next === null || next === undefined || typeof next !== 'object') return
    this.lastRaw = next
    Object.assign(this.live, coerceConfig(next, this.live))
    // 两个功能都关着 → 诊断日志静默 (热路径零 I/O); 任一开启 → 正常记录.
    setDiagActive(this.live.enabled || this.live.autoContinue)
  }
}
