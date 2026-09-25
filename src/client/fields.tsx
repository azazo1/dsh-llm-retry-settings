/**
 * 卡片里的自绘控件.
 *
 * 官方字段控件只覆盖单行文本, 数字与密文三类, 布尔, 多行文本, 多选码与表格需要自己画;
 * 这里复刻官方字段行的节奏 (标签 13px/500, 说明 12px tertiary, 每行 12px 内边距, 行间
 * 0.5px hairline), 并把 `已覆盖` 与 `恢复默认` 放在右侧. 控件本身一律用官方原子组件
 * (`Switch` / `Pill` / `Input` / `Button` / `Tag`), 只在外层排版上自绘.
 * @module dsh-llm-retry-settings/client/fields
 */

import { Button, Input, Pill, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { useState, type ReactNode } from 'react'
import { CODE_CATEGORIES, CODE_RE, KNOWN_CODES, KNOWN_CODE_SET } from './codes.ts'
import type { RetryLocaleKey } from './locales.ts'
import type { EditableOverride } from './settings-form.ts'

/** 一行字段的公共外壳. */
interface FieldRowProps {
  id?: string | undefined
  label: string
  hint?: string | undefined
  /** 说明之后的第二行补充说明 (与 hint 同属这一行, 不单独成块). */
  note?: string | undefined
  trailing?: ReactNode
  children: ReactNode
}

/** 一行字段的外壳. 没有可关联控件 (`id` 缺席) 时标签退化成 span, 不留下悬空的 htmlFor. */
function FieldRow(props: FieldRowProps): ReactNode {
  return (
    <div className="dsh-lrs-field">
      <div className="dsh-lrs-head">
        {props.id === undefined
          ? <span className="dsh-lrs-label">{props.label}</span>
          : <label className="dsh-lrs-label" htmlFor={props.id}>{props.label}</label>}
        {props.trailing === undefined ? null : <span className="dsh-lrs-badges">{props.trailing}</span>}
      </div>
      {props.children}
      {props.hint === undefined ? null : <p className="dsh-lrs-hint">{props.hint}</p>}
      {props.note === undefined ? null : <p className="dsh-lrs-hint">{props.note}</p>}
    </div>
  )
}

/** `已覆盖` 标记与 `恢复默认` 按钮 (自绘字段行用). */
function OverrideTrailing(props: {
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onReset: () => void
}): ReactNode {
  if (!props.overridden) return null
  return (
    <>
      <Tag tone="neutral">{props.overriddenLabel}</Tag>
      <button type="button" className="dsh-lrs-reset" disabled={props.disabled} onClick={props.onReset}>
        {props.resetLabel}
      </button>
    </>
  )
}

/**
 * 布尔偏好行: 标签与说明在左, 开关在右.
 *
 * 对应官方 `SubagentModelSelectionFields` 的 `.toggleRow` 与 `DeveloperToolsRow` 的
 * `.row` —— 官方设置界面里的布尔开关一律是两端对齐的行, 而不是"标签一行, 开关另起
 * 一行". `Switch` 自带 `label` 作为可访问名, 所以行内标签不带 `htmlFor`.
 * @param props - 标签, 若干行说明, 开关状态与覆盖/恢复动作.
 * @returns 一行布尔偏好.
 */
export function SwitchRow(props: {
  label: string
  /** 说明文字, 可多行 (第一行讲这个开关做什么, 后面可放实时状态). */
  notes: readonly string[]
  checked: boolean
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onToggle: (next: boolean) => void
  onReset: () => void
}): ReactNode {
  return (
    <div className="dsh-lrs-toggle">
      <div className="dsh-lrs-toggleText">
        <span className="dsh-lrs-toggleLabel">
          {props.label}
          {props.overridden
            ? (
              <span className="dsh-lrs-toggleBadges">
                <Tag tone="neutral">{props.overriddenLabel}</Tag>
                <button type="button" className="dsh-lrs-reset" disabled={props.disabled} onClick={props.onReset}>
                  {props.resetLabel}
                </button>
              </span>
            )
            : null}
        </span>
        {props.notes.map((note, index) => (
          <span className="dsh-lrs-toggleNote" key={`${String(index)}:${note}`}>{note}</span>
        ))}
      </div>
      <Switch checked={props.checked} onChange={props.onToggle} label={props.label} disabled={props.disabled} />
    </div>
  )
}

/**
 * 一组相关控件.
 *
 * 官方没有"卡片内区块大标题"这种做法, 需要分组时用 `fieldset` + `legend`
 * (见 `SubagentModelSelectionFields` 的"允许的模型"): 细边框圆角容器, legend 用小字.
 * @param props - 组标题与组内内容.
 * @returns 分组的控件容器.
 */
export function FieldGroup(props: { legend: string; children: ReactNode }): ReactNode {
  return (
    <fieldset className="dsh-lrs-group">
      <legend>{props.legend}</legend>
      {props.children}
    </fieldset>
  )
}

/** 多行文本字段 (续写提示词): 官方没有多行控件, 自绘但沿用官方输入框配色. */
export function TextAreaField(props: {
  id: string
  label: string
  hint?: string | undefined
  placeholder?: string | undefined
  text: string
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
  /** 标签右侧额外内容 (提示词模板选择器). */
  extra?: ReactNode
  /** 说明之后的第二行补充说明. */
  note?: string | undefined
}): ReactNode {
  return (
    <FieldRow
      id={props.id}
      label={props.label}
      hint={props.hint}
      note={props.note}
      trailing={(
        <>
          {props.extra}
          <OverrideTrailing
            overridden={props.overridden}
            overriddenLabel={props.overriddenLabel}
            resetLabel={props.resetLabel}
            disabled={props.disabled}
            onReset={props.onReset}
          />
        </>
      )}
    >
      <textarea
        id={props.id}
        className="dsh-lrs-textarea"
        value={props.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        spellCheck={false}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
    </FieldRow>
  )
}

/** 补充错误码: 按恢复价值分组的可选 chip + 自定义码输入. */
export function CodeChips(props: {
  selected: string[]
  disabled: boolean
  /** 本插件字典的读取函数 (带参数的文案在这里插值). */
  t: Translate<RetryLocaleKey>
  onToggle: (code: string) => void
  onClear: () => void
  onAdd: (code: string) => boolean
}): ReactNode {
  const [input, setInput] = useState('')
  const [message, setMessage] = useState<{ kind: 'dup' | 'bad'; code: string } | null>(null)
  const selectedSet = new Set(props.selected)
  const custom = props.selected.filter((code) => !KNOWN_CODE_SET.has(code))

  const chip = (code: string, warn: boolean, unknown: boolean, title: string): ReactNode => (
    <Pill
      key={code}
      active={selectedSet.has(code)}
      disabled={props.disabled}
      title={title}
      className={unknown ? 'dsh-lrs-chipCustom' : warn ? 'dsh-lrs-chipWarn' : undefined}
      onClick={() => { props.onToggle(code) }}
    >
      {code}
    </Pill>
  )

  const commit = (): void => {
    const text = input.trim().toUpperCase()
    if (text === '') return
    if (selectedSet.has(text)) {
      setMessage({ kind: 'dup', code: text })
      return
    }
    if (!CODE_RE.test(text)) {
      setMessage({ kind: 'bad', code: text })
      return
    }
    if (props.onAdd(text)) {
      setInput('')
      setMessage(null)
    } else {
      setMessage({ kind: 'dup', code: text })
    }
  }

  return (
    <div className="dsh-lrs-chipGroups">
      {CODE_CATEGORIES.map((category) => {
        const members = KNOWN_CODES.filter((entry) => entry.cat === category.id)
        // 组内顺序恒为清单顺序: 点击只改变填充色与计数, 任何 chip 都不挪位.
        // (此前把已选的码排到组首, 点一下 chip 它自己就会跳到组首或组尾, 同组其它
        // chip 也跟着挪.)
        const picked = members.filter((entry) => selectedSet.has(entry.code))
        return (
          <div className="dsh-lrs-chipGroup" key={category.id}>
            <span className="dsh-lrs-chipGroupLabel">
              {props.t(category.labelKey)}
              {/* 计数常显 (含 0): 徽标出现/消失会让标题行高变化几个像素. */}
              <Tag tone={picked.length > 0 ? 'info' : 'quiet'}>{String(picked.length)}</Tag>
              <em>{props.t(category.noteKey)}</em>
            </span>
            <div className="dsh-lrs-chips">
              {members.map((entry) => chip(entry.code, entry.warn === true, false, props.t(entry.descKey)))}
            </div>
          </div>
        )
      })}
      {/* 自定义组常显: 它此前只在有自定义码时出现, 加第一个/删最后一个会让下面整块位移. */}
      <div className="dsh-lrs-chipGroup">
        <span className="dsh-lrs-chipGroupLabel">
          {props.t('codesCustom')}
          <Tag tone={custom.length > 0 ? 'warning' : 'quiet'}>{String(custom.length)}</Tag>
          <em>{props.t('codesCustomHint')}</em>
        </span>
        <div className="dsh-lrs-chips">
          {custom.length === 0
            ? <span className="dsh-lrs-chipEmpty">{props.t('codesCustomNone')}</span>
            : custom.map((code) => chip(code, false, true, props.t('codesCustomChip')))}
        </div>
      </div>
      <div className="dsh-lrs-chipMeta">
        {props.selected.length === 0
          ? <span>{props.t('codesNone')}</span>
          : <span>{props.t('codesCount', { n: String(props.selected.length) })}</span>}
        <button type="button" className="dsh-lrs-reset" disabled={props.disabled || props.selected.length === 0} onClick={props.onClear}>
          {props.t('codesClear')}
        </button>
      </div>
      <div className="dsh-lrs-addRow">
        <Input
          className="dsh-lrs-addInput"
          value={input}
          placeholder={props.t('codesAddPlaceholder')}
          disabled={props.disabled}
          spellCheck={false}
          onChange={(event) => { setInput(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') commit() }}
        />
        <Button variant="outline" size="sm" disabled={props.disabled} onClick={commit}>
          {props.t('codesAddBtn')}
        </Button>
        {message === null ? null : (
          <span className="dsh-lrs-invalid">
            {message.kind === 'dup'
              ? props.t('codesAddDup', { code: message.code })
              : props.t('codesAddBad', { code: message.code })}
          </span>
        )}
      </div>
      <p className="dsh-lrs-hint">{props.t('fieldCodesHint')}</p>
    </div>
  )
}

/** provider / model 覆盖表: 两列通配 + 四档数值 (留空 = 继承全局). */
export function OverridesEditor(props: {
  rows: EditableOverride[]
  disabled: boolean
  labels: {
    providerPlaceholder: string
    modelPlaceholder: string
    add: string
    remove: string
    shortRetries: string
    shortInitial: string
    shortMax: string
    shortJitter: string
    empty: string
    hint: string
  }
  onChange: (key: string, patch: Partial<Omit<EditableOverride, 'key'>>) => void
  onAdd: () => void
  onRemove: (key: string) => void
}): ReactNode {
  const numberInput = (
    key: string,
    field: 'maxRetriesText' | 'initialDelayMsText' | 'maxDelayMsText' | 'jitterPercentText',
    row: EditableOverride,
    placeholder: string,
  ): ReactNode => (
    <Input
      value={row[field]}
      placeholder={placeholder}
      inputMode="numeric"
      spellCheck={false}
      disabled={props.disabled}
      aria-label={placeholder}
      onChange={(event) => { props.onChange(key, { [field]: event.target.value }) }}
    />
  )

  return (
    <div className="dsh-lrs-chipGroups">
      {props.rows.length === 0 ? <p className="dsh-lrs-hint">{props.labels.empty}</p> : null}
      {props.rows.map((row) => (
        <div className="dsh-lrs-ovRow" key={row.key}>
          <Input
            value={row.provider}
            placeholder={props.labels.providerPlaceholder}
            spellCheck={false}
            disabled={props.disabled}
            aria-label={props.labels.providerPlaceholder}
            onChange={(event) => { props.onChange(row.key, { provider: event.target.value }) }}
          />
          <Input
            value={row.model}
            placeholder={props.labels.modelPlaceholder}
            spellCheck={false}
            disabled={props.disabled}
            aria-label={props.labels.modelPlaceholder}
            onChange={(event) => { props.onChange(row.key, { model: event.target.value }) }}
          />
          {numberInput(row.key, 'maxRetriesText', row, props.labels.shortRetries)}
          {numberInput(row.key, 'initialDelayMsText', row, props.labels.shortInitial)}
          {numberInput(row.key, 'maxDelayMsText', row, props.labels.shortMax)}
          {numberInput(row.key, 'jitterPercentText', row, props.labels.shortJitter)}
          <Button
            variant="ghost"
            size="sm"
            disabled={props.disabled}
            aria-label={props.labels.remove}
            title={props.labels.remove}
            onClick={() => { props.onRemove(row.key) }}
          >
            {props.labels.remove}
          </Button>
        </div>
      ))}
      <div className="dsh-lrs-row">
        <Button variant="outline" size="sm" disabled={props.disabled} onClick={props.onAdd}>
          {props.labels.add}
        </Button>
      </div>
      <p className="dsh-lrs-hint">{props.labels.hint}</p>
    </div>
  )
}
