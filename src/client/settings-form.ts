/**
 * 配置卡片的暂存层.
 *
 * 官方 `SettingsFormModel` 的字段名只映射顶层一段路径且值域是文本, 而这里既有布尔,
 * 也有数组 (错误码, 覆盖表), 还有 "留空 = 继承" 的语义, 所以这一份自己管草稿: 保存时
 * 用一次原子写入 (`mutate([...])`) 把全部改动落成 profile patch.
 *
 * 草稿分两种意图: `sets` 是显式写入的值, `unsets` 是显式要求从用户层删掉 (恢复默认的
 * 语义, 让它重新继承组合层). 草稿只活在这张卡片所在的页面里: 离开页面就丢弃, 只有
 * 保存才写入.
 * @module dsh-llm-retry-settings/client/settings-form
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SettingsFormActions,
  SettingsFormPathOp,
  SettingsFormScope,
  SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { OVERRIDE_INHERIT, OVERRIDE_MAX_ROWS, type PolicyOverride } from '../shared.ts'
import { CODE_RE } from './codes.ts'

/** 卡片读到的配置形状 (就是 profile patch 里的那几个字段). */
export interface RetrySettings {
  enabled?: boolean
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  jitterRatio?: number
  retryableCodes?: string[]
  autoContinue?: boolean
  maxContinuations?: number
  continuationPrompt?: string
  continueOnError?: boolean
  overrides?: PolicyOverride[]
  /** 宿主注入的只读日志路径. */
  logPath?: string
}

/** 覆盖表里的一行 (数值留空 = 继承全局, 渲染时用空串表示). */
export interface EditableOverride {
  /** 渲染用的稳定 key (增删行时不丢焦点). */
  key: string
  provider: string
  model: string
  maxRetriesText: string
  initialDelayMsText: string
  maxDelayMsText: string
  jitterPercentText: string
}

/** 各字段的覆盖情况, 用于 "已覆盖" 标记. */
export interface RetryOverrides {
  enabled: boolean
  maxRetries: boolean
  initialDelayMs: boolean
  maxDelayMs: boolean
  jitterRatio: boolean
  retryableCodes: boolean
  autoContinue: boolean
  maxContinuations: boolean
  continuationPrompt: boolean
  continueOnError: boolean
  overrides: boolean
}

/** 卡片读到的整块状态. */
export interface RetryCardState extends SettingsFormShell {
  enabled: boolean
  maxRetriesText: string
  initialDelayMsText: string
  maxDelayMsText: string
  /** 抖动比例以百分数呈现 (0~100). */
  jitterPercentText: string
  retryableCodes: string[]
  autoContinue: boolean
  maxContinuationsText: string
  continuationPrompt: string
  continueOnError: boolean
  overrides: EditableOverride[]
  /** 哪些字段在 profile 的用户层里被覆盖过. */
  overridden: RetryOverrides
  /** 宿主半边是否已是最新构建 (只读 logPath 有没有到位). */
  hostFresh: boolean
  /** 宿主日志绝对路径 (宿主未到位时为空串). */
  logPath: string
}

/** 卡片注册时注入给组件的面. */
export interface RetryCardFace extends SettingsFormActions {
  hooks: {
    /** 组件通过它读快照 (useRetryCard). */
    retryCard: SnapshotStore<RetryCardState>
  }
  /** 总开关 (重试覆盖). */
  setEnabled(next: boolean): void
  /** 输出截断自动续写开关. */
  setAutoContinue(next: boolean): void
  /** 重试耗尽后也续写开关. */
  setContinueOnError(next: boolean): void
  /** 改一个文本草稿字段. */
  editText(field: TextFieldName, text: string): void
  /** 勾选 / 取消一个补充错误码. */
  toggleCode(code: string): void
  /** 清空全部补充错误码. */
  clearCodes(): void
  /** 加一个自定义码; 非法或重复时返回 false. */
  addCode(code: string): boolean
  /** 覆盖表末尾加一行. */
  addOverride(): void
  /** 按 key 删掉一行. */
  removeOverride(key: string): void
  /** 改一行覆盖的部分字段. */
  editOverride(key: string, patch: Partial<Omit<EditableOverride, 'key'>>): void
}

/** 文本类草稿字段名. */
export type TextFieldName =
  | 'maxRetriesText'
  | 'initialDelayMsText'
  | 'maxDelayMsText'
  | 'jitterPercentText'
  | 'maxContinuationsText'
  | 'continuationPrompt'

/** 草稿里可以显式写入的字段. */
interface FieldValues {
  enabled: boolean
  maxRetriesText: string
  initialDelayMsText: string
  maxDelayMsText: string
  jitterPercentText: string
  retryableCodes: string[]
  autoContinue: boolean
  maxContinuationsText: string
  continuationPrompt: string
  continueOnError: boolean
  overrides: EditableOverride[]
}

/** 草稿字段名. */
type FieldName = keyof FieldValues

/** 非负整数草稿; 非法时返回 undefined. */
function nonNegativeInt(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

/** 正整数草稿; 非法时返回 undefined. */
function positiveInt(text: string): number | undefined {
  const parsed = nonNegativeInt(text)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

/** 百分比草稿 (0~100) 转成比例; 非法时返回 undefined. */
function percentToRatio(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined
  return parsed / 100
}

/** 数值草稿是否是空 (空 = 继承全局值). */
function isBlank(text: string): boolean {
  return text.trim() === ''
}

/** 生成覆盖行的稳定 key. */
let overrideSeq = 0
function nextOverrideKey(): string {
  overrideSeq += 1
  return `ov-${String(overrideSeq)}`
}

/** `PolicyOverride` 转成可编辑行 (负值 = 继承, 渲染成空串). */
function toEditable(row: PolicyOverride): EditableOverride {
  const num = (value: number, scale?: number): string => {
    if (typeof value !== 'number' || value < 0) return ''
    return String(scale === undefined ? value : Math.round(value * scale))
  }
  return {
    key: nextOverrideKey(),
    provider: row.provider ?? '',
    model: row.model ?? '',
    maxRetriesText: num(row.maxRetries),
    initialDelayMsText: num(row.initialDelayMs),
    maxDelayMsText: num(row.maxDelayMs),
    jitterPercentText: num(row.jitterRatio, 100),
  }
}

/** 可编辑行转回 `PolicyOverride` (空串 = 继承哨兵). */
function toOverride(row: EditableOverride): PolicyOverride {
  return {
    provider: row.provider.trim() === '' ? '*' : row.provider.trim(),
    model: row.model.trim() === '' ? '*' : row.model.trim(),
    maxRetries: nonNegativeInt(row.maxRetriesText) ?? OVERRIDE_INHERIT,
    initialDelayMs: nonNegativeInt(row.initialDelayMsText) ?? OVERRIDE_INHERIT,
    maxDelayMs: nonNegativeInt(row.maxDelayMsText) ?? OVERRIDE_INHERIT,
    jitterRatio: percentToRatio(row.jitterPercentText) ?? OVERRIDE_INHERIT,
  }
}

/** 一行覆盖是否是空行 (provider 与 model 都没填). */
function isBlankOverride(row: EditableOverride): boolean {
  return row.provider.trim() === '' && row.model.trim() === ''
}

/**
 * 把配置表单桥接成卡片需要的快照与动作.
 */
export class RetrySettingsForm {
  private readonly store: SnapshotStore<RetryCardState>
  private readonly unsubscribe: () => void
  private sets: Partial<FieldValues> = {}
  private readonly unsets = new Set<FieldName>()
  private baseline: number | undefined
  private saving = false
  private failed = false
  private disposed = false

  /**
   * @param scope - `ctx.configForms.get(ENTRY_ID)` 拿到的共享配置表单.
   */
  constructor(private readonly scope: SettingsFormScope<RetrySettings>) {
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = scope.subscribe(() => { this.publish() })
  }

  /** 释放订阅. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
  }

  /** 组装 slot 注册要注入的面. */
  inject(): RetryCardFace {
    return {
      hooks: { retryCard: this.store },
      setEnabled: (next) => { this.setField('enabled', next) },
      setAutoContinue: (next) => { this.setField('autoContinue', next) },
      setContinueOnError: (next) => { this.setField('continueOnError', next) },
      editText: (field, text) => { this.setField(field, text) },
      toggleCode: (code) => {
        const codes = this.field('retryableCodes')
        this.setField('retryableCodes', codes.includes(code) ? codes.filter((entry) => entry !== code) : [...codes, code])
      },
      clearCodes: () => { this.setField('retryableCodes', []) },
      addCode: (code) => {
        const normalized = code.trim().toUpperCase()
        if (!CODE_RE.test(normalized)) return false
        const codes = this.field('retryableCodes')
        if (codes.includes(normalized)) return false
        this.setField('retryableCodes', [...codes, normalized])
        return true
      },
      addOverride: () => {
        const rows = this.field('overrides')
        if (rows.length >= OVERRIDE_MAX_ROWS) return
        this.setField('overrides', [...rows, {
          key: nextOverrideKey(),
          provider: '',
          model: '',
          maxRetriesText: '',
          initialDelayMsText: '',
          maxDelayMsText: '',
          jitterPercentText: '',
        }])
      },
      removeOverride: (key) => {
        this.setField('overrides', this.field('overrides').filter((row) => row.key !== key))
      },
      editOverride: (key, patch) => {
        this.setField('overrides', this.field('overrides').map((row) => (row.key === key ? { ...row, ...patch } : row)))
      },
      edit: (field, text) => {
        if (isTextFieldName(field)) this.setField(field, text)
      },
      resetField: (field) => {
        const draft = draftFieldOf(field)
        if (draft !== undefined) this.unsetField(draft)
      },
      save: () => { void this.save() },
      discard: () => { this.discard() },
    }
  }

  /** 丢掉全部草稿. */
  discard(): void {
    if (Object.keys(this.sets).length === 0 && this.unsets.size === 0 && !this.failed) return
    this.sets = {}
    this.unsets.clear()
    this.baseline = undefined
    this.failed = false
    this.publish()
  }

  /**
   * 把草稿写成一次原子写入.
   *
   * 只写真正改过的字段; 被拒绝时保留草稿, 让 user 接着改而不是重打一遍.
   */
  async save(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const state = this.store.getSnapshot()
    if (this.saving || !snapshot.writable || !state.dirty || state.invalid) return
    const ops = this.pendingOps()
    if (ops.length === 0) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const landed = await this.scope.mutate(ops, this.baseline ?? snapshot.revision)
      if (landed) {
        this.sets = {}
        this.unsets.clear()
        this.baseline = undefined
      }
      this.failed = !landed
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
    }
  }

  /** 显式写入一个字段的草稿. */
  private setField<K extends FieldName>(field: K, value: FieldValues[K]): void {
    this.unsets.delete(field)
    this.sets = { ...this.sets, [field]: value }
    this.touch()
  }

  /** 让一个字段回到组合层 (保存时 unset). */
  private unsetField(field: FieldName): void {
    const next = { ...this.sets }
    delete next[field]
    this.sets = next
    if (this.userLayerHas(field)) this.unsets.add(field)
    else this.unsets.delete(field)
    this.touch()
  }

  /** 记录一次草稿改动. */
  private touch(): void {
    this.baseline ??= this.scope.getSnapshot().revision
    this.failed = false
    this.publish()
  }

  /** 当前要显示的值: 草稿 > 恢复默认时回落到组合层 > 生效值. */
  private field<K extends FieldName>(name: K): FieldValues[K] {
    const staged = this.sets[name]
    if (staged !== undefined) return staged
    if (this.unsets.has(name)) return this.baseValue(name)
    return this.effectiveValue(name)
  }

  /** 当前生效值 (schema 默认已由 Host 解析进去). */
  private effectiveValue<K extends FieldName>(name: K): FieldValues[K] {
    const value = this.scope.getSnapshot().value
    return this.project(name, value)
  }

  /** 组合层 (清掉用户层之后回落到的那一层) 的值. */
  private baseValue<K extends FieldName>(name: K): FieldValues[K] {
    return this.project(name, this.scope.getSnapshot().base as RetrySettings | undefined)
  }

  /** 从一个配置层里取某个草稿字段的值. */
  private project<K extends FieldName>(name: K, layer: RetrySettings | undefined): FieldValues[K] {
    switch (name) {
      case 'enabled': return (layer?.enabled === true) as FieldValues[K]
      case 'maxRetriesText': return String(layer?.maxRetries ?? 0) as FieldValues[K]
      case 'initialDelayMsText': return String(layer?.initialDelayMs ?? 0) as FieldValues[K]
      case 'maxDelayMsText': return String(layer?.maxDelayMs ?? 0) as FieldValues[K]
      case 'jitterPercentText': return String(Math.round((layer?.jitterRatio ?? 0) * 100)) as FieldValues[K]
      case 'retryableCodes': return [...(layer?.retryableCodes ?? [])] as FieldValues[K]
      case 'autoContinue': return (layer?.autoContinue === true) as FieldValues[K]
      case 'maxContinuationsText': return String(layer?.maxContinuations ?? 0) as FieldValues[K]
      case 'continuationPrompt': return (layer?.continuationPrompt ?? '') as FieldValues[K]
      case 'continueOnError': return (layer?.continueOnError === true) as FieldValues[K]
      case 'overrides': return (layer?.overrides ?? []).map(toEditable) as FieldValues[K]
    }
    /* v8 ignore next -- 上面的 case 覆盖了 FieldName 的全部取值 */
    throw new Error(`unknown field ${String(name)}`)
  }

  /** 用户层里是否有这个字段 (决定 "已覆盖" 与 unset 是否必要). */
  private userLayerHas(name: FieldName): boolean {
    const user = this.scope.getSnapshot().user
    if (user === null || typeof user !== 'object') return false
    return Object.hasOwn(user, configPathOf(name))
  }

  /**
   * 这个字段是否算"已覆盖"——判据与官方 `SettingsFormModel.field()` 一致:
   * 有草稿时预览保存后的结果 (显式写入算覆盖, 清空不算), 没有草稿时看用户层里有没有
   * 这条记录. 注意判据是"有没有记录", 不是"值等不等于默认值".
   */
  private overriddenOf(name: FieldName): boolean {
    if (Object.hasOwn(this.sets, name)) return true
    if (this.unsets.has(name)) return false
    return this.userLayerHas(name)
  }

  /** 组装卡片读到的整块状态. */
  private projection(): RetryCardState {
    const snapshot = this.scope.getSnapshot()
    const value = snapshot.value
    const overrides = this.field('overrides')
    const retryableCodes = this.field('retryableCodes')
    const maxRetriesText = this.field('maxRetriesText')
    const initialDelayMsText = this.field('initialDelayMsText')
    const maxDelayMsText = this.field('maxDelayMsText')
    const jitterPercentText = this.field('jitterPercentText')
    const maxContinuationsText = this.field('maxContinuationsText')
    const numbersInvalid = nonNegativeInt(maxRetriesText) === undefined
      || positiveInt(initialDelayMsText) === undefined
      || positiveInt(maxDelayMsText) === undefined
      || percentToRatio(jitterPercentText) === undefined
      || nonNegativeInt(maxContinuationsText) === undefined
      || overrides.some((row) => (
        (!isBlank(row.maxRetriesText) && nonNegativeInt(row.maxRetriesText) === undefined)
        || (!isBlank(row.initialDelayMsText) && nonNegativeInt(row.initialDelayMsText) === undefined)
        || (!isBlank(row.maxDelayMsText) && nonNegativeInt(row.maxDelayMsText) === undefined)
        || (!isBlank(row.jitterPercentText) && percentToRatio(row.jitterPercentText) === undefined)
      ))
    const pending = this.pendingOps()
    const logPath = typeof value?.logPath === 'string' ? value.logPath : ''
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: pending.length > 0,
      invalid: numbersInvalid,
      saving: this.saving,
      failed: this.failed,
      enabled: this.field('enabled'),
      maxRetriesText,
      initialDelayMsText,
      maxDelayMsText,
      jitterPercentText,
      retryableCodes,
      autoContinue: this.field('autoContinue'),
      maxContinuationsText,
      continuationPrompt: this.field('continuationPrompt'),
      continueOnError: this.field('continueOnError'),
      overrides,
      overridden: {
        enabled: this.overriddenOf('enabled'),
        maxRetries: this.overriddenOf('maxRetriesText'),
        initialDelayMs: this.overriddenOf('initialDelayMsText'),
        maxDelayMs: this.overriddenOf('maxDelayMsText'),
        jitterRatio: this.overriddenOf('jitterPercentText'),
        retryableCodes: this.overriddenOf('retryableCodes'),
        autoContinue: this.overriddenOf('autoContinue'),
        maxContinuations: this.overriddenOf('maxContinuationsText'),
        continuationPrompt: this.overriddenOf('continuationPrompt'),
        continueOnError: this.overriddenOf('continueOnError'),
        overrides: this.overriddenOf('overrides'),
      },
      hostFresh: logPath !== '',
      logPath,
    }
  }

  /** 当前草稿相对生效值需要写入的那些操作. */
  private pendingOps(): SettingsFormPathOp[] {
    const ops: SettingsFormPathOp[] = []
    for (const [name, value] of Object.entries(this.sets) as [FieldName, FieldValues[FieldName]][]) {
      const op = this.setOp(name, value)
      if (op !== undefined) ops.push(op)
    }
    for (const name of this.unsets) {
      if (!this.userLayerHas(name)) continue
      ops.push({ op: 'unset', path: [configPathOf(name)] })
    }
    return ops
  }

  /** 一个显式写入的字段落成什么操作; 没有实际变化时是 undefined. */
  private setOp(name: FieldName, value: FieldValues[FieldName]): SettingsFormPathOp | undefined {
    const path = configPathOf(name)
    switch (name) {
      case 'maxRetriesText':
      case 'maxContinuationsText': {
        const parsed = nonNegativeInt(String(value))
        return parsed === undefined || parsed === Number(this.effectiveValue(name))
          ? undefined
          : { op: 'set', path: [path], value: parsed }
      }
      case 'initialDelayMsText':
      case 'maxDelayMsText': {
        const parsed = positiveInt(String(value))
        return parsed === undefined || parsed === Number(this.effectiveValue(name))
          ? undefined
          : { op: 'set', path: [path], value: parsed }
      }
      case 'jitterPercentText': {
        const parsed = percentToRatio(String(value))
        return parsed === undefined || parsed === percentToRatio(this.effectiveValue(name))
          ? undefined
          : { op: 'set', path: [path], value: parsed }
      }
      case 'retryableCodes': {
        const codes = value as string[]
        return JSON.stringify(codes) === JSON.stringify(this.effectiveValue(name)) ? undefined : { op: 'set', path: [path], value: codes }
      }
      case 'overrides': {
        // 空行直接丢掉, 不写进配置.
        const rows = (value as EditableOverride[]).filter((row) => !isBlankOverride(row)).map(toOverride)
        return JSON.stringify(rows) === JSON.stringify(this.effectiveValue(name)) ? undefined : { op: 'set', path: [path], value: rows }
      }
      case 'continuationPrompt': {
        const text = String(value)
        return text === this.effectiveValue(name) ? undefined : { op: 'set', path: [path], value: text }
      }
      default: {
        const scalar = value as boolean
        return scalar === this.effectiveValue(name) ? undefined : { op: 'set', path: [path], value: scalar }
      }
    }
  }

  /** 通知组件状态变了. */
  private publish(): void {
    if (this.disposed) return
    this.store.set(this.projection())
  }
}

/** 是否是文本类草稿字段名. */
function isTextFieldName(field: string): field is TextFieldName {
  return field === 'maxRetriesText' || field === 'initialDelayMsText' || field === 'maxDelayMsText'
    || field === 'jitterPercentText' || field === 'maxContinuationsText' || field === 'continuationPrompt'
}

/** 草稿字段名对应的 profile patch 路径. */
function configPathOf(name: FieldName): string {
  switch (name) {
    case 'maxRetriesText': return 'maxRetries'
    case 'initialDelayMsText': return 'initialDelayMs'
    case 'maxDelayMsText': return 'maxDelayMs'
    case 'jitterPercentText': return 'jitterRatio'
    case 'maxContinuationsText': return 'maxContinuations'
    default: return name
  }
}

/** 配置路径反查草稿字段名 (卡片按配置路径调 `resetField`). */
function draftFieldOf(path: string): FieldName | undefined {
  switch (path) {
    case 'maxRetries': return 'maxRetriesText'
    case 'initialDelayMs': return 'initialDelayMsText'
    case 'maxDelayMs': return 'maxDelayMsText'
    case 'jitterRatio': return 'jitterPercentText'
    case 'maxContinuations': return 'maxContinuationsText'
    case 'enabled': return 'enabled'
    case 'retryableCodes': return 'retryableCodes'
    case 'autoContinue': return 'autoContinue'
    case 'continuationPrompt': return 'continuationPrompt'
    case 'continueOnError': return 'continueOnError'
    case 'overrides': return 'overrides'
    default: return undefined
  }
}
