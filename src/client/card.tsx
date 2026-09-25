/**
 * 插件管理页里本 bundle 的配置页.
 *
 * 结构对齐官方设置界面 (见 `ui-settings-agent-loop` / `ui-settings-subagent` /
 * `ui-settings-shell` 的卡片):
 *  - 骨架是官方 `SettingsForm`, 草稿只在页面里, 离开即丢弃, 只有保存才写 profile 的
 *    patch 层;
 *  - 单行数字与文本用官方 `SettingsValueField` (标签行右侧带"已覆盖/恢复默认");
 *  - 布尔字段是两端对齐的行: 标签与说明在左, 开关在右;
 *  - 官方没有对应物的部分 (错误码多选, provider/model 覆盖表, 退避曲线, 观测面板) 自绘,
 *    但用官方那种 `fieldset` + `legend` 分组, 并沿用同一套行距与 `--dsw-*` token;
 *  - 卡片里不重复插件名与描述 —— 插件页上方已经显示了.
 * @module dsh-llm-retry-settings/client/card
 */

import {
  Button,
  IconCopyOutlineRegular,
  SettingsForm,
  SettingsValueField,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useState, type ReactNode } from 'react'
import { LOG_FILE_DISPLAY } from '../shared.ts'
import { BackoffViz } from './backoff.tsx'
import { CodeChips, FieldGroup, OverridesEditor, SwitchRow, TextAreaField } from './fields.tsx'
import type { RetryLocaleKey } from './locales.ts'
import type { RetryCardFace } from './settings-form.ts'
import { StatsPanel } from './stats-panel.tsx'

/** 打开日志的结果: 已在桌面定位 / 已复制路径 / 只能手动打开. */
export type OpenLogResult = 'revealed' | 'copied' | 'manual'

/** 卡片组件从注册侧额外拿到的能力 (不属于配置表单本身). */
export interface RetryCardExtras {
  /** 在宿主桌面里定位日志文件, 拿不到就退回复制路径. */
  openLog: () => Promise<OpenLogResult>
}

/** 卡片组件拿到的全部 props. */
export type RetrySettingsCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'llm-retry-settings'>
  & InjectFace<RetryCardFace>
  & RetryCardExtras

/** 一个续写提示词模板. */
interface PromptTemplate {
  id: string
  label: string
  text: string
}

/**
 * 渲染卡片的简介或配置表单.
 * @param props - 页面要的视图, 字典, 表单快照与动作.
 * @returns 简介文本或配置表单.
 */
export function RetrySettingsCard(props: RetrySettingsCardProps): ReactNode {
  const { t } = props
  const state = props.useRetryCard((snapshot) => snapshot)
  const [logMsg, setLogMsg] = useState<'copied' | 'manual' | null>(null)
  // bundle 配置槽只会要 `page`, 简介分支是为了稳妥.
  if (props.view === 'summary') return t('description')

  // 只有"配置文档本身不可写"才禁用控件; 开关关着只是暂时不生效, 仍然允许先配置.
  const locked = !state.writable

  const templates: PromptTemplate[] = [
    { id: 'default', label: t('promptTplDefault'), text: '' },
    { id: 'keep', label: t('promptTplKeep'), text: t('promptTplKeepText') },
    { id: 'answer', label: t('promptTplAnswer'), text: t('promptTplAnswerText') },
    { id: 'think', label: t('promptTplThink'), text: t('promptTplThinkText') },
  ]
  const hitTemplate = templates.find((template) => template.text !== '' && template.text === state.continuationPrompt)
  const promptState = state.continuationPrompt.trim() === ''
    ? t('fieldPromptDefault')
    : hitTemplate === undefined ? t('fieldPromptCustom') : t('promptTemplateState', { name: hitTemplate.label })

  const retryStatus = state.enabled
    ? t('statusOn', {
      n: state.maxRetriesText,
      init: state.initialDelayMsText,
      max: state.maxDelayMsText,
      j: `${state.jitterPercentText}%`,
      c: String(state.retryableCodes.length),
    })
    : t('statusOff')
  const status = `${retryStatus} · ${state.autoContinue ? t('continueOn', { n: state.maxContinuationsText }) : t('continueOff')}`

  const logAbsolute = state.logPath
  const openLog = (): void => {
    void props.openLog().then((result) => { setLogMsg(result === 'revealed' ? null : result) })
  }

  const numberField = (
    id: string,
    label: string,
    hint: string,
    text: string,
    overridden: boolean,
    invalid: boolean,
    field: 'maxRetriesText' | 'initialDelayMsText' | 'maxDelayMsText' | 'jitterPercentText' | 'maxContinuationsText',
    resetPath: string,
  ): ReactNode => (
    <div className="dsh-lrs-cell" key={id}>
      <SettingsValueField
        id={id}
        label={label}
        hint={hint}
        numeric
        text={text}
        overridden={overridden}
        invalid={invalid}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={locked}
        onEdit={(next) => { props.editText(field, next) }}
        onReset={() => { props.resetField(resetPath) }}
      />
    </div>
  )

  return (
    <SettingsForm
      labels={{
        unavailable: t('formUnavailable'),
        readOnly: t('formReadOnly'),
        saveFailed: t('formSaveFailed'),
        save: t('save'),
        saving: t('saving'),
      }}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      {state.hostFresh ? null : <p className="dsh-lrs-notice">{t('hostStale')}</p>}

      <SwitchRow
        label={t('enabled')}
        notes={[t('enabledHint'), status]}
        checked={state.enabled}
        overridden={state.overridden.enabled}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={locked}
        onToggle={props.setEnabled}
        onReset={() => { props.resetField('enabled') }}
      />

      <div className="dsh-lrs-grid">
        {numberField(
          'plugin-config-llm-retry-max-retries',
          t('fieldRetries'),
          t('fieldRetriesHint'),
          state.maxRetriesText,
          state.overridden.maxRetries,
          !/^\d+$/.test(state.maxRetriesText.trim()),
          'maxRetriesText',
          'maxRetries',
        )}
        {numberField(
          'plugin-config-llm-retry-initial-delay',
          t('fieldInitial'),
          t('fieldInitialHint'),
          state.initialDelayMsText,
          state.overridden.initialDelayMs,
          !/^\d+$/.test(state.initialDelayMsText.trim()),
          'initialDelayMsText',
          'initialDelayMs',
        )}
        {numberField(
          'plugin-config-llm-retry-max-delay',
          t('fieldMax'),
          t('fieldMaxHint'),
          state.maxDelayMsText,
          state.overridden.maxDelayMs,
          !/^\d+$/.test(state.maxDelayMsText.trim()),
          'maxDelayMsText',
          'maxDelayMs',
        )}
        {numberField(
          'plugin-config-llm-retry-jitter',
          t('fieldJitter'),
          t('fieldJitterHint'),
          state.jitterPercentText,
          state.overridden.jitterRatio,
          !/^\d+(\.\d+)?$/.test(state.jitterPercentText.trim()) || Number(state.jitterPercentText) > 100,
          'jitterPercentText',
          'jitterRatio',
        )}
      </div>

      <FieldGroup legend={t('groupBackoff')}>
        <BackoffViz
          maxRetries={Number(state.maxRetriesText) || 0}
          initialDelayMs={Number(state.initialDelayMsText) || 1}
          maxDelayMs={Number(state.maxDelayMsText) || 1}
          jitterRatio={(Number(state.jitterPercentText) || 0) / 100}
          t={t}
        />
      </FieldGroup>

      <FieldGroup legend={t('groupCodes')}>
        <CodeChips
          selected={state.retryableCodes}
          disabled={locked}
          t={t}
          onToggle={props.toggleCode}
          onClear={props.clearCodes}
          onAdd={props.addCode}
        />
      </FieldGroup>

      <FieldGroup legend={t('groupOverrides')}>
        <OverridesEditor
          rows={state.overrides}
          disabled={locked}
          labels={{
            providerPlaceholder: t('overrideProviderPlaceholder'),
            modelPlaceholder: t('overrideModelPlaceholder'),
            add: t('overrideAdd'),
            remove: t('overrideRemove'),
            shortRetries: t('overrideShortRetries'),
            shortInitial: t('overrideShortInitial'),
            shortMax: t('overrideShortMax'),
            shortJitter: t('overrideShortJitter'),
            empty: t('overridesNone'),
            hint: t('overridesHint'),
          }}
          onAdd={props.addOverride}
          onRemove={props.removeOverride}
          onChange={props.editOverride}
        />
      </FieldGroup>

      {/* 自动续写与重试是两条独立通路: max-tokens 不是错误, 重试策略永远碰不到它. */}
      <SwitchRow
        label={t('groupContinue')}
        notes={[t('continueHint')]}
        checked={state.autoContinue}
        overridden={state.overridden.autoContinue}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={locked}
        onToggle={props.setAutoContinue}
        onReset={() => { props.resetField('autoContinue') }}
      />

      <div className="dsh-lrs-grid">
        {numberField(
          'plugin-config-llm-retry-max-continuations',
          t('fieldMaxContinue'),
          t('fieldMaxContinueHint'),
          state.maxContinuationsText,
          state.overridden.maxContinuations,
          !/^\d+$/.test(state.maxContinuationsText.trim()),
          'maxContinuationsText',
          'maxContinuations',
        )}
      </div>

      {/* 只在次数为 0 时提示, 不跟着上面的开关出现/消失——那样点开关会让下面整块跳位. */}
      {state.maxContinuationsText.trim() === '0' ? <p className="dsh-lrs-hint">{t('continueZero')}</p> : null}

      <SwitchRow
        label={t('continueOnError')}
        notes={[t('continueOnErrorHint')]}
        checked={state.continueOnError}
        overridden={state.overridden.continueOnError}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={locked}
        onToggle={props.setContinueOnError}
        onReset={() => { props.resetField('continueOnError') }}
      />

      <TextAreaField
        id="plugin-config-llm-retry-continuation-prompt"
        label={t('fieldPrompt')}
        hint={`${t('fieldPromptHint')} ${promptState}`}
        note={t('promptTemplateHint')}
        placeholder={t('fieldPromptPlaceholder')}
        text={state.continuationPrompt}
        overridden={state.overridden.continuationPrompt}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        disabled={locked}
        onEdit={(text) => { props.editText('continuationPrompt', text) }}
        onReset={() => { props.resetField('continuationPrompt') }}
        extra={(
          <select
            className="dsh-lrs-select"
            aria-label={t('fieldPromptTemplate')}
            disabled={locked}
            value="__pick"
            onChange={(event) => {
              const picked = templates.find((template) => template.id === event.target.value)
              if (picked !== undefined) props.editText('continuationPrompt', picked.text)
              // 受控值恒为占位项: 选同一个模板两次也要弹回去.
              event.target.value = '__pick'
            }}
          >
            <option value="__pick">{t('promptTemplatePick')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.label}</option>
            ))}
          </select>
        )}
      />

      <FieldGroup legend={t('groupStats')}>
        <StatsPanel logPath={logAbsolute} t={t} />
      </FieldGroup>

      <div className="dsh-lrs-field">
        <div className="dsh-lrs-head">
          <span className="dsh-lrs-label">{t('logTitle')}</span>
          <span className="dsh-lrs-badges">
            {logMsg === 'copied' ? <span className="dsh-lrs-hint">{t('logCopied')}</span> : null}
            {logMsg === 'manual' ? <span className="dsh-lrs-invalid">{t('logManual')}</span> : null}
            <Button
              variant="outline"
              size="sm"
              icon={<IconCopyOutlineRegular size={13} aria-hidden="true" />}
              onClick={openLog}
            >
              {t('logOpen')}
            </Button>
          </span>
        </div>
        <code className="dsh-lrs-hint">{logAbsolute === '' ? LOG_FILE_DISPLAY : logAbsolute}</code>
      </div>
    </SettingsForm>
  )
}

/** 本卡片的文案键 (供注册侧做类型约束). */
export type { RetryLocaleKey }
