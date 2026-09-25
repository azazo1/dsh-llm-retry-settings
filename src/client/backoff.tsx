/**
 * 退避曲线与等待预算.
 *
 * 横轴是第几次重试, 纵轴是这一档的等待时长. 口径与宿主/官方重试链一致: delay 从
 * `initialDelayMs` 起每次 ×2, 到 `maxDelayMs` 封顶; 抖动不改变曲线点, 只在预算里给出
 * ±jitter 的区间. 官方组件库没有图表原子, 所以这里自绘 SVG (只用 `--dsw-*` token 上色).
 * @module dsh-llm-retry-settings/client/backoff
 */

import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReactNode } from 'react'
import type { RetryLocaleKey } from './locales.ts'

/** 曲线最多画几档 (再多也看不出形状). */
const MAX_STEPS = 12

/** 把毫秒渲染成人类可读的时长. */
function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`
  return `${Math.round(ms)}ms`
}

/**
 * 渲染退避曲线, 序列与预算.
 * @param props - 四档策略值与本插件字典.
 * @returns 曲线区块.
 */
export function BackoffViz(props: {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
  t: Translate<RetryLocaleKey>
}): ReactNode {
  const { t } = props
  const rounds = Math.max(0, Math.min(Math.floor(Number(props.maxRetries) || 0), MAX_STEPS))
  const capMs = Math.max(1, Number(props.maxDelayMs) || 1)
  const steps: number[] = []
  let delay = Math.max(1, Number(props.initialDelayMs) || 1)
  for (let i = 0; i < rounds; i += 1) {
    const wait = Math.min(delay, capMs)
    steps.push(wait)
    delay = Math.min(wait * 2, capMs)
  }
  const total = steps.reduce((sum, value) => sum + value, 0)
  const jitter = Math.max(0, Math.min(1, Number(props.jitterRatio) || 0))

  if (steps.length === 0) {
    return (
      <div className="dsh-lrs-viz">
        <span className="dsh-lrs-hint">{t('backoffEmpty')}</span>
      </div>
    )
  }

  // 曲线含原点 (第 0 次 = 不等待), 形状才是 "指数爬升到封顶" 而不是一串柱子.
  const series = [0, ...steps]
  const maxValue = Math.max(capMs, ...steps, 1)
  const width = 640
  const height = 112
  const padLeft = 34
  const padRight = 10
  const padTop = 10
  const padBottom = 18
  const plotWidth = width - padLeft - padRight
  const plotHeight = height - padTop - padBottom
  const px = (index: number): number =>
    padLeft + (series.length <= 1 ? 0 : (index / (series.length - 1)) * plotWidth)
  const py = (value: number): number => padTop + plotHeight - (value / maxValue) * plotHeight
  const line = series.map((value, index) => `${px(index).toFixed(1)},${py(value).toFixed(1)}`).join(' ')
  const baseY = (padTop + plotHeight).toFixed(1)
  const area = `${padLeft},${baseY} ${line} ${(padLeft + plotWidth).toFixed(1)},${baseY}`
  const capY = py(capMs).toFixed(1)

  return (
    <div className="dsh-lrs-viz">
      <svg className="dsh-lrs-curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('groupBackoff')}>
        <line className="dsh-lrs-curveCap" x1={padLeft} y1={capY} x2={padLeft + plotWidth} y2={capY} />
        <text className="dsh-lrs-curveAxis" x={2} y={Number(capY) + 3}>{formatMs(capMs)}</text>
        <line className="dsh-lrs-curveCap" x1={padLeft} y1={padTop + plotHeight} x2={padLeft + plotWidth} y2={padTop + plotHeight} />
        <text className="dsh-lrs-curveAxis" x={2} y={padTop + plotHeight + 3}>0</text>
        <polygon className="dsh-lrs-curveArea" points={area} />
        <polyline className="dsh-lrs-curveLine" points={line} />
        {series.map((value, index) => (
          <circle className="dsh-lrs-curveDot" key={index} cx={px(index)} cy={py(value)} r={index === 0 ? 1.6 : 2.6} />
        ))}
        {steps.map((_value, index) => (
          <text className="dsh-lrs-curveAxis" key={`x${String(index)}`} x={px(index + 1)} y={height - 5} textAnchor="middle">
            {index + 1}
          </text>
        ))}
      </svg>
      <span className="dsh-lrs-hint">
        {t('backoffSeq', { seq: steps.map((value) => formatMs(value)).join(' → '), n: String(steps.length) })}
      </span>
      <span className="dsh-lrs-hint">
        {t('backoffBudget', {
          best: formatMs(total * (1 - jitter)),
          worst: formatMs(total * (1 + jitter)),
          n: String(steps.length),
        })}
      </span>
      <span className="dsh-lrs-hint">{t('backoffHint', { p: String(Math.round(jitter * 100)) })}</span>
    </div>
  )
}
