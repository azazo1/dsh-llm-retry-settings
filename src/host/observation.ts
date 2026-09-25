/**
 * 观测计数与两条只读路由.
 *
 * 路由经 `connection.fetch.register` 挂在 dsh 的 `/api` 通道下: 该前缀由 connection
 * 插件自己注册, 请求先过它的 Host/Origin 栅栏 (挡 DNS rebinding) 与浏览器会话
 * cookie 认证, 过了才分发到这里. 插件不自己实现认证, 因此也不可能忘记认证.
 * @module dsh-llm-retry-settings/host/observation
 */

import { readFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { LOG_PATH, PACKAGE_NAME, STATS_PATH, type Config } from '../shared.ts'
import { LOG_FILE } from './config.ts'
import { DIAG_TAG, diag } from './diag.ts'

/** 最近记录环形缓冲上限. */
const RECENT_MAX = 50

/** 日志尾部一次最多回多少行. */
const LOG_TAIL_MAX = 500

/** 一条观测记录. */
export interface StatEntry {
  /** 事件时刻 (ms). */
  t: number
  /** retry=请求失败被重试链路接管; continue=自动续写已投递; cap=续写触顶; skip=因 inbox 忙跳过. */
  kind: 'retry' | 'continue' | 'cap' | 'skip'
  code?: string
  provider?: string
  model?: string
  turn?: number
  delayMs?: number
}

/** 观测路由要读的两份外部事实. */
export interface ObservationSources {
  /** 当前生效配置 (每次请求重读). */
  config(): Config
  /** 会话 → 最近一次请求的 provider / model. */
  models(): Record<string, { provider: string; model: string }>
}

/** 内存里的观测计数; 只读暴露给卡片, 绝不写回设置文件. */
export class Observer {
  private readonly startedAt = Date.now()
  private retries = 0
  private continues = 0
  private capped = 0
  private skipped = 0
  private readonly byCode: Record<string, number> = {}
  private readonly byProvider: Record<string, number> = {}
  private readonly recent: StatEntry[] = []

  /** 一次请求失败被重试链路接管. */
  retry(entry: { code: string; provider: string; model: string; turn?: number | undefined; delayMs: number }): void {
    this.retries += 1
    bump(this.byCode, entry.code)
    bump(this.byProvider, entry.provider)
    this.push({
      t: Date.now(),
      kind: 'retry',
      code: entry.code,
      provider: entry.provider,
      model: entry.model,
      ...entry.turn === undefined ? {} : { turn: entry.turn },
      delayMs: entry.delayMs,
    })
  }

  /** 一轮自动续写已投递. */
  continued(entry: { turn: number; provider?: string | undefined; model?: string | undefined }): void {
    this.continues += 1
    this.push({
      t: Date.now(),
      kind: 'continue',
      turn: entry.turn,
      ...entry.provider === undefined ? {} : { provider: entry.provider },
      ...entry.model === undefined ? {} : { model: entry.model },
    })
  }

  /** 连续续写触顶. */
  hitCap(turn: number): void {
    this.capped += 1
    this.push({ t: Date.now(), kind: 'cap', turn })
  }

  /** 让位给用户自己排的消息. */
  skippedByUser(turn: number): void {
    this.skipped += 1
    this.push({ t: Date.now(), kind: 'skip', turn })
  }

  /** 只读快照. */
  snapshot(): unknown {
    return {
      startedAt: this.startedAt,
      retries: this.retries,
      continues: this.continues,
      capped: this.capped,
      skipped: this.skipped,
      byCode: { ...this.byCode },
      byProvider: { ...this.byProvider },
      recent: [...this.recent],
    }
  }

  private push(entry: StatEntry): void {
    this.recent.push(entry)
    while (this.recent.length > RECENT_MAX) this.recent.shift()
  }
}

/** 计数袋 +1 (空键不记). */
function bump(bag: Record<string, number>, key: string): void {
  if (key !== '') bag[key] = (bag[key] ?? 0) + 1
}

/** JSON 响应 (no-store: 观测数据是活的). */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** connection 服务的 fetch 路由登记面 (最小结构类型). */
interface ConnectionFetchRegistry {
  register(route: {
    path: string
    methods: readonly ('GET' | 'HEAD' | 'POST')[]
    requestBody: 'buffered' | 'streaming'
    fetch: (request: Request) => Promise<Response>
  }): () => Promise<void>
}

/**
 * 注册两条只读观测路由.
 *
 * `connection` 走软注入: 没有 Web 载体的 profile 里插件本体 (重试覆盖与自动续写)
 * 照常工作, 只是没有观测面板可拉.
 * @param ctx - 插件上下文.
 * @param observer - 观测计数.
 * @param sources - 路由要读的配置与模型缓存.
 */
export function installObservationRoutes(ctx: Context, observer: Observer, sources: ObservationSources): void {
  ctx.inject(['connection'], (connectionCtx: Context) => {
    try {
      const connection = (connectionCtx as unknown as { connection?: { fetch?: ConnectionFetchRegistry } }).connection
      const registry = connection?.fetch
      if (registry === undefined || typeof registry.register !== 'function') {
        diag('connection.fetch 不可用：观测路由未注册（观测面板将显示占位）')
        return
      }
      registry.register({
        path: STATS_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
          const config = sources.config()
          return jsonResponse({
            plugin: PACKAGE_NAME,
            diagTag: DIAG_TAG,
            pid: process.pid,
            now: Date.now(),
            config: {
              ...config,
              continuationPrompt: config.continuationPrompt.trim() === '' ? '(内置默认)' : '(自定义)',
            },
            stats: observer.snapshot(),
            models: sources.models(),
          })
        },
      })
      registry.register({
        path: LOG_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request: Request) => {
          const url = new URL(request.url)
          const asked = Number(url.searchParams.get('tail') ?? '80')
          const tail = Math.min(Math.max(Number.isFinite(asked) ? asked : 80, 1), LOG_TAIL_MAX)
          try {
            const lines = readFileSync(LOG_FILE, 'utf8').split('\n')
            return jsonResponse({
              path: LOG_FILE,
              tail,
              lines: lines.slice(Math.max(0, lines.length - 1 - tail), lines.length - 1),
            })
          } catch (error) {
            return jsonResponse({ path: LOG_FILE, tail: 0, lines: [], error: String(error) })
          }
        },
      })
      diag(`观测路由已注册：${STATS_PATH} / ${LOG_PATH}`)
    } catch (error) {
      diag(`观测路由注册失败：${String(error)}`)
    }
  })
}
