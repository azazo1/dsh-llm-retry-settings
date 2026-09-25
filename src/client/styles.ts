/**
 * 卡片样式.
 *
 * 只用 `--dsw-alias-*` 语义 token, 行节奏对齐官方设置表单 (标签 13px/500, 说明
 * 12px tertiary, 每行 12px 内边距, 行间 0.5px hairline). 外部插件的构建里没有
 * CSS Modules 预设, 所以这里注入一次 `data-plugin-css` 标记的 `<style>`.
 * @module dsh-llm-retry-settings/client/styles
 */

import { PACKAGE_NAME } from '../shared.ts'

const STYLE_ID = `${PACKAGE_NAME}/client.css`

const CSS_TEXT = `
/* 行节奏与官方设置表单一致: 每行 12px 内边距, 行间 0.5px hairline, 标签 13px/500,
   说明 12px tertiary. 官方没有"卡片内区块大标题", 分组一律用 fieldset + legend. */
.dsh-lrs-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.dsh-lrs-field + .dsh-lrs-field { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-lrs-head { display: flex; align-items: center; gap: 8px; }
.dsh-lrs-label { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.dsh-lrs-badges { display: inline-flex; align-items: center; gap: 8px; }
.dsh-lrs-reset { padding: 0; border: none; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; }
.dsh-lrs-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsh-lrs-reset:disabled { cursor: default; }
.dsh-lrs-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.dsh-lrs-invalid { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-state-error-primary); }
.dsh-lrs-notice { margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-state-warn-primary); }

/* 布尔偏好行: 标签与说明在左, 开关在右 (官方 SubagentModelSelectionFields / DeveloperToolsRow). */
.dsh-lrs-toggle { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 12px 0; }
.dsh-lrs-toggle + .dsh-lrs-toggle { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-lrs-toggleText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dsh-lrs-toggleLabel { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.dsh-lrs-toggleBadges { display: inline-flex; align-items: center; gap: 8px; }
.dsh-lrs-toggleNote { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }

/* 分组容器: 官方 SubagentModelSelectionFields 的 .models (fieldset + legend).
   官方 SettingsForm 的容器没有 gap, 字段之间靠各自的 12px 上下内边距形成 24px 节奏;
   这里补 12px 外边距, 让区块与相邻内容也凑成同样的 24px, 否则两个 fieldset 会边框贴边框. */
.dsh-lrs-group { display: grid; gap: 10px; min-width: 0; margin: 12px 0; padding: 12px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-lg); }
.dsh-lrs-group > legend { padding: 0 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }

/* 数字字段网格: 官方 SubagentLimitsFields 的 .limits; 每个字段各包一层容器, 这样
   "相邻字段加分隔线"的规则在网格内不会生效 (官方也是这么做的). */
.dsh-lrs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 0 16px; }
.dsh-lrs-cell { min-width: 0; }

.dsh-lrs-textarea { width: 100%; box-sizing: border-box; min-height: 68px; resize: vertical; padding: 8px 12px; border-radius: var(--dsw-radius-md); border: 0.5px solid var(--dsw-alias-border-l4); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 1.6; }
.dsh-lrs-textarea:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.dsh-lrs-textarea:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-lrs-select { height: 34px; padding: 0 10px; border-radius: var(--dsw-radius-md); border: 0.5px solid var(--dsw-alias-border-l4); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.dsh-lrs-select:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.dsh-lrs-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-lrs-chipGroups { display: flex; flex-direction: column; gap: 10px; }
.dsh-lrs-chipGroup { display: flex; flex-direction: column; gap: 6px; }
.dsh-lrs-chipGroupLabel { display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
/* 说明文字不参与收缩: 它一旦换行, 标题行高就会跟着变, 点 chip 时下面的内容会跳. */
.dsh-lrs-chipGroupLabel em { flex: 0 0 auto; font-style: normal; font-weight: 400; color: var(--dsw-alias-label-tertiary); }
.dsh-lrs-chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; }
/* 空分组占位: 与一个 Pill 等高, 加/删第一个自定义码时下方内容不位移. */
.dsh-lrs-chipEmpty { display: inline-flex; align-items: center; height: 24px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-lrs-chipWarn { color: var(--dsw-alias-state-warn-primary); }
.dsh-lrs-chipCustom { color: var(--dsw-alias-state-warn-primary); }
.dsh-lrs-chipMeta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.dsh-lrs-addRow { display: flex; align-items: center; gap: 8px; }
.dsh-lrs-addInput { width: 240px; }
.dsh-lrs-ovRow { display: grid; grid-template-columns: minmax(96px, 1fr) minmax(96px, 1fr) 72px 72px 72px 72px auto; gap: 6px; align-items: center; }
.dsh-lrs-ovRow > * { min-width: 0; }
.dsh-lrs-viz { display: flex; flex-direction: column; gap: 6px; }
.dsh-lrs-curve { display: block; width: 100%; height: auto; }
.dsh-lrs-curveArea { fill: var(--dsw-alias-state-business-primary); opacity: .14; stroke: none; }
.dsh-lrs-curveLine { fill: none; stroke: var(--dsw-alias-state-business-primary); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
.dsh-lrs-curveDot { fill: var(--dsw-alias-state-business-primary); }
.dsh-lrs-curveCap { stroke: var(--dsw-alias-label-tertiary); stroke-width: 1; stroke-dasharray: 3 3; }
.dsh-lrs-curveAxis { fill: var(--dsw-alias-label-tertiary); font-size: 9px; }
.dsh-lrs-statHead { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.dsh-lrs-statGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; }
.dsh-lrs-statCell { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-interactive-bg-hover); }
.dsh-lrs-statVal { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.dsh-lrs-statLabel { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-lrs-statCols { display: flex; gap: 16px; flex-wrap: wrap; }
.dsh-lrs-statCol { display: flex; flex-direction: column; gap: 2px; min-width: 150px; flex: 1 1 160px; }
.dsh-lrs-statRow { display: flex; align-items: baseline; gap: 8px; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.dsh-lrs-statKey { color: var(--dsw-alias-label-secondary); }
.dsh-lrs-logTail { max-height: 220px; overflow: auto; overscroll-behavior: contain; margin: 0; padding: 8px 10px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-interactive-bg-hover); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--dsw-alias-label-secondary); }
`

/** 注入卡片样式一次; 重复调用是空操作. */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset['plugin'] = PACKAGE_NAME
  style.dataset['pluginCss'] = STYLE_ID
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}
