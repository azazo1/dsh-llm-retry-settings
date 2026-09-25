/**
 * 文件诊断日志: `~/.dsh/logs/dsh-llm-retry-settings/host.log`.
 *
 * 为什么不用 `ctx.logger`: 本机 desktop.log 只捕获 agent 进程的 `console.*` 输出,
 * `ctx.logger` 的 info/warn 不落任何可读文件, 排查时等于黑盒——自动续写不生效时既
 * 看不出监听器有没有收到事件, 也看不出在哪一步 bail.
 *
 * 只记低频事件 (激活, 配置同步, turn/end, 续写投递, 各类 bail, 异常). 超过
 * {@link DIAG_MAX_BYTES} 重写一次; 任何写盘失败都被吞掉——诊断日志不能拖垮插件本体.
 * @module dsh-llm-retry-settings/host/diag
 */

import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import type { Config } from '../shared.ts'
import { LOG_DIR, LOG_FILE } from './config.ts'

/**
 * 诊断构建标记: 写进 host.log, 用来确认运行中的到底是哪一版 `lib/index.js`.
 * 发版时跟着 package.json 的 version 一起改.
 */
export const DIAG_TAG = 'v0.2.0'

/** 超过这个字节数就整文件重写, 不留历史. */
const DIAG_MAX_BYTES = 256 * 1024

/** 同一条消息在这个窗口内重复只记一次 (限流风暴里 request-error 会刷屏). */
const DIAG_DEDUPE_MS = 5000

/** 已知的日志字节数; -1 = 还没 stat 过. */
let diagBytes = -1
let diagLastMessage = ''
let diagLastAt = 0
let diagSuppressed = 0
/** 最近一次已知 "有没有功能开着"; false 时热路径完全不写盘. */
let diagActive = true
/** 关闭态下被丢掉的诊断行数, 重新开启时补一行说明. */
let diagDropped = 0

/** 由配置同步在变化时调用 (两个功能都关着 → 热路径零 I/O). */
export function setDiagActive(active: boolean): void {
  if (active === diagActive) return
  diagActive = active
  if (active && diagDropped > 0) {
    const dropped = diagDropped
    diagDropped = 0
    diagLastMessage = ''
    diag(`（功能重新开启：此前关闭期间省略了 ${dropped} 行诊断）`)
  }
}

/** 记一行诊断; 关闭态下只计数不写盘. */
export function diag(message: string): void {
  if (!diagActive) {
    diagDropped += 1
    return
  }
  const now = Date.now()
  if (message === diagLastMessage && now - diagLastAt < DIAG_DEDUPE_MS) {
    diagSuppressed += 1
    return
  }
  const note = diagSuppressed > 0 ? `（${diagSuppressed} 次重复已省略）` : ''
  diagSuppressed = 0
  diagLastMessage = message
  diagLastAt = now
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    const line = `${new Date().toISOString()} ${note}${message}\n`
    const bytes = Buffer.byteLength(line)
    if (diagBytes < 0) {
      try {
        diagBytes = statSync(LOG_FILE).size
      } catch {
        diagBytes = 0
      }
    }
    if (diagBytes > DIAG_MAX_BYTES) {
      writeFileSync(LOG_FILE, line)
      diagBytes = bytes
      return
    }
    appendFileSync(LOG_FILE, line)
    diagBytes += bytes
  } catch {
    /* 诊断失败静默 */
  }
}

/** 配置摘要: host.log 要能看出配置对不对, 但不必塞进整段 JSON. */
export function summaryOf(config: Config): string {
  return `enabled=${config.enabled} codes=${config.retryableCodes.length} maxRetries=${config.maxRetries}`
    + ` backoff=${config.initialDelayMs}~${config.maxDelayMs}ms jitter=${config.jitterRatio}`
    + ` autoContinue=${config.autoContinue} maxContinuations=${config.maxContinuations}`
    + ` continueOnError=${config.continueOnError} overrides=${config.overrides.length}`
}
