/**
 * 只读观测面板.
 *
 * 数据来自宿主半边经 `/api` 通道暴露的两条只读路由 (同源 fetch 自带会话 cookie,
 * 认证由该前缀的 admission 负责). 打开卡片与手动刷新各拉一次, 不轮询不推送.
 * 面板本身只用官方原子组件 (`Button` / `Tag` / `DisclosureRow`) 与语义 token 排版.
 * @module dsh-llm-retry-settings/client/stats-panel
 */

import {
  Button,
  DisclosureRow,
  IconClockOutlineRegular,
  IconRefreshOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LOG_PATH, STATS_PATH } from '../shared.ts'
import type { RetryLocaleKey } from './locales.ts'

/** 宿主返回的一条记录. */
interface StatEntry {
  t: number
  kind: 'retry' | 'continue' | 'cap' | 'skip'
  code?: string
  provider?: string
  model?: string
  turn?: number
  delayMs?: number
}

/** 宿主返回的观测快照. */
interface StatsResponse {
  diagTag?: string
  pid?: number
  now?: number
  stats?: {
    startedAt?: number
    retries?: number
    continues?: number
    capped?: number
    skipped?: number
    byCode?: Record<string, number>
    byProvider?: Record<string, number>
    recent?: StatEntry[]
  }
  models?: Record<string, { provider?: string; model?: string }>
}

/** 最近记录最多列几条. */
const RECENT_SHOWN = 8
/** 分类榜最多列几条. */
const TOP_SHOWN = 6

/** 时间格式化器只建一次. */
const CLOCK_FMT = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
  ? new Intl.DateTimeFormat()
  : null

/** 把时间戳渲染成本地时钟. */
function formatClock(t: number): string {
  try {
    const date = new Date(t)
    return CLOCK_FMT === null ? date.toLocaleTimeString() : CLOCK_FMT.format(date)
  } catch {
    return '-'
  }
}

/**
 * 「按 provider」的显示名: 某 provider 在最近记录里只出现过唯一 model 时显示
 * `provider/model` (否则只显示 provider, 避免歧义).
 */
function providerLabels(recent: readonly StatEntry[]): Map<string, string> {
  const models = new Map<string, Set<string>>()
  for (const entry of recent) {
    if (typeof entry.provider !== 'string' || entry.provider === '') continue
    const bucket = models.get(entry.provider) ?? new Set<string>()
    if (typeof entry.model === 'string' && entry.model !== '') bucket.add(entry.model)
    models.set(entry.provider, bucket)
  }
  const labels = new Map<string, string>()
  for (const [provider, bucket] of models) {
    labels.set(provider, bucket.size === 1 ? `${provider}/${[...bucket][0] ?? ''}` : provider)
  }
  return labels
}

/** 一条记录的 provider/model 标签. */
function entryTarget(entry: StatEntry): string {
  if (typeof entry.provider !== 'string' || entry.provider === '') return ''
  return typeof entry.model === 'string' && entry.model !== '' ? `${entry.provider}/${entry.model}` : entry.provider
}

/** 计数袋取前几名. */
function topEntries(bag: Record<string, number> | undefined, limit: number): Array<[string, number]> {
  return Object.entries(bag ?? {}).sort((left, right) => right[1] - left[1]).slice(0, limit)
}

/**
 * 渲染观测面板.
 * @param props - 只读日志路径 (宿主未到位时为空串) 与本插件字典.
 * @returns 观测面板.
 */
export function StatsPanel(props: { logPath: string; t: Translate<RetryLocaleKey> }): ReactNode {
  const { t } = props
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: StatsResponse | null; error: string }>({
    status: 'idle',
    data: null,
    error: '',
  })
  const [tail, setTail] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    try {
      const response = await fetch(STATS_PATH, { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const data = await response.json() as StatsResponse
      setState({ status: 'ready', data, error: '' })
    } catch (error) {
      setState({ status: 'error', data: null, error: error instanceof Error ? error.message : String(error) })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleTail = (): void => {
    if (tail !== null) {
      setTail(null)
      return
    }
    void (async () => {
      try {
        const response = await fetch(`${LOG_PATH}?tail=60`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        const body = await response.json() as { lines?: string[] }
        setTail(Array.isArray(body.lines) ? body.lines : [])
      } catch {
        setTail([])
      }
    })()
  }

  const stats = state.data?.stats
  const recent = stats?.recent ?? []
  const providerNames = providerLabels(recent)
  const codes = topEntries(stats?.byCode, TOP_SHOWN)
  const providers = topEntries(stats?.byProvider, TOP_SHOWN)
  const liveModels = Object.entries(state.data?.models ?? {})
  const uptime = stats?.startedAt === undefined
    ? ''
    : t('statsUptime', { mins: String(Math.max(0, Math.round((Date.now() - stats.startedAt) / 60000))) })

  const cell = (label: string, value: number | undefined): ReactNode => (
    <div className="dsh-lrs-statCell" key={label}>
      <span className="dsh-lrs-statVal">{String(value ?? 0)}</span>
      <span className="dsh-lrs-statLabel">{label}</span>
    </div>
  )

  const list = (title: string, rows: Array<[string, number]>, decorate?: (key: string) => string): ReactNode => (
    <div className="dsh-lrs-statCol">
      <span className="dsh-lrs-statLabel">{title}</span>
      {rows.length === 0 ? <span className="dsh-lrs-hint">{t('statsEmpty')}</span> : null}
      {rows.map(([key, count]) => (
        <span className="dsh-lrs-statRow" key={key}>
          <span className="dsh-lrs-statKey">{decorate === undefined ? key : decorate(key)}</span>
          <span>{String(count)}</span>
        </span>
      ))}
    </div>
  )

  return (
    <>
      {/* 组标题由外层的 fieldset legend 提供, 这里只放状态徽标与刷新. */}
      <div className="dsh-lrs-statHead">
        {state.data?.diagTag === undefined ? null : <Tag tone="quiet">{t('statsDiag', { tag: state.data.diagTag })}</Tag>}
        {uptime === '' ? null : <Tag tone="quiet">{uptime}</Tag>}
        <Button
          variant="ghost"
          size="sm"
          icon={<IconRefreshOutlineRegular size={13} aria-hidden="true" />}
          disabled={state.status === 'loading'}
          onClick={() => { void load() }}
        >
          {t('statsRefresh')}
        </Button>
      </div>

      {state.status === 'loading' && state.data === null ? <p className="dsh-lrs-hint">{t('statsLoading')}</p> : null}
      {state.status === 'error'
        ? <p className="dsh-lrs-invalid">{t('statsUnavailable', { msg: state.error })}</p>
        : null}

      {stats === undefined ? null : (
        <>
          <div className="dsh-lrs-statGrid">
            {cell(t('statsRetries'), stats.retries)}
            {cell(t('statsContinues'), stats.continues)}
            {cell(t('statsCapped'), stats.capped)}
            {cell(t('statsSkipped'), stats.skipped)}
          </div>
          <div className="dsh-lrs-statCols">
            {list(t('statsByCode'), codes)}
            {list(t('statsByProvider'), providers, (key) => providerNames.get(key) ?? key)}
          </div>
          <div className="dsh-lrs-statCol">
            <span className="dsh-lrs-statLabel">{t('statsRecent')}</span>
            {recent.length === 0 ? <span className="dsh-lrs-hint">{t('statsEmpty')}</span> : null}
            {recent.slice(-RECENT_SHOWN).reverse().map((entry, index) => (
              <span className="dsh-lrs-statRow" key={`${String(entry.t)}-${String(index)}`}>
                <span className="dsh-lrs-statKey">{formatClock(entry.t)}</span>
                <span>{kindLabel(t, entry.kind)}</span>
                {entry.code === undefined || entry.code === '' ? null : <Tag tone="neutral">{entry.code}</Tag>}
                {entryTarget(entry) === '' ? null : <span className="dsh-lrs-statKey">{entryTarget(entry)}</span>}
              </span>
            ))}
          </div>
          {liveModels.length === 0 ? null : (
            <div className="dsh-lrs-statCol">
              <span className="dsh-lrs-statLabel">{t('statsModels')}</span>
              {liveModels.map(([sessionId, info]) => (
                <span className="dsh-lrs-statRow" key={sessionId}>
                  <span className="dsh-lrs-statKey">{sessionId}</span>
                  <span>{`${info.provider ?? ''}/${info.model ?? ''}`}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <DisclosureRow
        icon={<IconClockOutlineRegular size={13} aria-hidden="true" />}
        title={tail === null ? t('statsLogTail') : t('statsLogHide')}
        open={tail !== null}
        expandable
        expandOnRowClick
        onToggle={toggleTail}
      >
        <pre className="dsh-lrs-logTail">{tail === null || tail.length === 0 ? t('statsLogEmpty') : tail.join('\n')}</pre>
      </DisclosureRow>
    </>
  )
}

/** 记录类别标签. */
function kindLabel(t: Translate<RetryLocaleKey>, kind: StatEntry['kind']): string {
  switch (kind) {
    case 'retry': return t('statsKindRetry')
    case 'continue': return t('statsKindContinue')
    case 'cap': return t('statsKindCap')
    case 'skip': return t('statsKindSkip')
  }
}
