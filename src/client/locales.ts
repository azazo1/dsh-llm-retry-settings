/**
 * 配置页的文案字典.
 *
 * 所有 user 可见字符串都走内核的 typed locale 字典: `zh` 是键的来源, `en` 必须与之
 * 同键. 带参数的文案用 `{名字}` 占位符, 由 `t(key, { ... })` 在读取时替换.
 * @module dsh-llm-retry-settings/client/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本插件的文案键. */
export type RetryLocaleKey =
  | 'description'
  | 'enabled'
  | 'enabledHint'
  | 'statusOff'
  | 'statusOn'
  | 'continueOn'
  | 'continueOff'
  | 'fieldRetries'
  | 'fieldRetriesHint'
  | 'fieldInitial'
  | 'fieldInitialHint'
  | 'fieldMax'
  | 'fieldMaxHint'
  | 'fieldJitter'
  | 'fieldJitterHint'
  | 'groupCodes'
  | 'fieldCodesHint'
  | 'codesNone'
  | 'codesCount'
  | 'codesClear'
  | 'codesCustom'
  | 'codesCustomHint'
  | 'codesCustomChip'
  | 'codesCustomNone'
  | 'codesAddPlaceholder'
  | 'codesAddBtn'
  | 'codesAddDup'
  | 'codesAddBad'
  // —— 错误码分组名与组说明 (与 codes.ts 的 CODE_CATEGORIES 一一对应) ——
  | 'catTransient'
  | 'catTransientNote'
  | 'catQuota'
  | 'catQuotaNote'
  | 'catRequest'
  | 'catRequestNote'
  | 'catContent'
  | 'catContentNote'
  | 'catAuth'
  | 'catAuthNote'
  | 'catMisc'
  | 'catMiscNote'
  // —— 每个错误码的悬停说明 (与 codes.ts 的 KNOWN_CODES 一一对应) ——
  | 'codeServer'
  | 'codeTimeout'
  | 'codeTransport'
  | 'codeEmptyResponse'
  | 'codeStreamClosed'
  | 'codeMalformedResponse'
  | 'codeInvalidResponse'
  | 'codePiAiError'
  | 'codePiAiNotWarmed'
  | 'codeRateLimit'
  | 'codeQuota'
  | 'codeInvalidRequest'
  | 'codeContextWindowExceeded'
  | 'codeUnsupportedOption'
  | 'codeUnknownModel'
  | 'codeRequestExtension'
  | 'codeInvalidReplayState'
  | 'codeUnsupportedContent'
  | 'codeUnsupportedReasoningEffort'
  | 'codeFilesApi'
  | 'codeAuth'
  | 'codeInvalidCredential'
  | 'codeMissingCredential'
  | 'codeAborted'
  | 'codeUnknown'
  | 'groupContinue'
  | 'continueHint'
  | 'logTitle'
  | 'logOpen'
  | 'logCopied'
  | 'logManual'
  | 'continueZero'
  | 'fieldMaxContinue'
  | 'fieldMaxContinueHint'
  | 'fieldPrompt'
  | 'fieldPromptHint'
  | 'fieldPromptPlaceholder'
  | 'fieldPromptDefault'
  | 'fieldPromptCustom'
  | 'fieldPromptTemplate'
  | 'promptTemplateHint'
  | 'promptTemplatePick'
  | 'promptTemplateState'
  | 'promptTplDefault'
  | 'promptTplKeep'
  | 'promptTplKeepText'
  | 'promptTplAnswer'
  | 'promptTplAnswerText'
  | 'promptTplThink'
  | 'promptTplThinkText'
  | 'continueOnError'
  | 'continueOnErrorHint'
  | 'groupBackoff'
  | 'backoffEmpty'
  | 'backoffBudget'
  | 'backoffSeq'
  | 'backoffHint'
  | 'groupOverrides'
  | 'overridesHint'
  | 'overridesNone'
  | 'overrideProviderPlaceholder'
  | 'overrideModelPlaceholder'
  | 'overrideAdd'
  | 'overrideRemove'
  | 'overrideShortRetries'
  | 'overrideShortInitial'
  | 'overrideShortMax'
  | 'overrideShortJitter'
  | 'groupStats'
  | 'statsRefresh'
  | 'statsLoading'
  | 'statsUnavailable'
  | 'statsRetries'
  | 'statsContinues'
  | 'statsCapped'
  | 'statsSkipped'
  | 'statsByCode'
  | 'statsByProvider'
  | 'statsRecent'
  | 'statsEmpty'
  | 'statsStale'
  | 'statsKindRetry'
  | 'statsKindContinue'
  | 'statsKindCap'
  | 'statsKindSkip'
  | 'statsUptime'
  | 'statsModels'
  | 'statsDiag'
  | 'statsLogTail'
  | 'statsLogHide'
  | 'statsLogEmpty'
  | 'hostStale'
  | 'formUnavailable'
  | 'formReadOnly'
  | 'formSaveFailed'
  | 'save'
  | 'saving'
  | 'overridden'
  | 'reset'
  | 'invalidNumber'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-llm-retry-settings 配置页的文案. */
    'llm-retry-settings': RetryLocaleKey
  }
}

/** 中文文案. */
export const zh: Record<RetryLocaleKey, string> = {
  description: '模型请求失败时的自动恢复策略，以及输出被 token 上限截断时的自动续写。开启重试后以本页值为准覆盖各 provider 的重试次数与退避时间。',
  enabled: '覆盖重试策略',
  enabledHint: '打开并保存后，本插件才覆盖各 provider 的重试次数与退避时间；关闭时完全旁路，不改任何东西。',
  statusOff: '沿用各 provider 自带的重试策略',
  statusOn: '最多重试 {n} 次 · 退避 {init}ms→{max}ms · 抖动 {j} · 补充 {c} 个错误码',
  continueOn: '截断自动续写 ≤{n} 次',
  continueOff: '截断不自动续写',
  fieldRetries: '最大重试次数',
  fieldRetriesHint: '失败后最多重试几次；0 = 不重试',
  fieldInitial: '初始退避',
  fieldInitialHint: '第一次重试前等待的毫秒数，此后按指数增长',
  fieldMax: '最大退避',
  fieldMaxHint: '退避时间封顶的毫秒数',
  fieldJitter: '抖动比例',
  fieldJitterHint: '0~1，给退避加随机抖动避免同时重试',
  groupCodes: '补充可重试的错误码',
  fieldCodesHint: '按“重试有没有恢复价值”分六组列出；组标题上标出本组已选数量。勾选的码与 provider 内置列表取并集（不覆盖已有码）。琥珀色 = 重试通常无意义，慎选；STREAM_ERROR 流式失败归入 PI_AI_ERROR，SSE 卡流归入 TIMEOUT。provider 配置里手工加入、不在清单内的码会出现在“自定义”组里。',
  codesNone: '未勾选任何补充码——仅按 provider 内置码重试',
  codesCount: '将补充 {n} 个错误码',
  codesClear: '清空',
  codesCustom: '自定义',
  codesCustomHint: '不在已知清单内（provider 配置手工加的，或在此输入后保存）',
  codesCustomChip: '自定义错误码，点击取消勾选',
  codesCustomNone: '暂无自定义码',
  codesAddPlaceholder: '输入自定义错误码，如 MY_PROVIDER_BUSY',
  codesAddBtn: '添加',
  codesAddDup: '已勾选或已存在：{code}',
  codesAddBad: '{code} 含空白或非法字符（仅限 A-Z 0-9 _ - .）',
  catTransient: '瞬时故障',
  catTransientNote: '重试通常能恢复',
  catQuota: '限流与配额',
  catQuotaNote: '退避后可能恢复',
  catRequest: '请求与参数',
  catRequestNote: '多为确定性错误',
  catContent: '内容与能力',
  catContentNote: '模型不支持，重试无意义',
  catAuth: '凭证与鉴权',
  catAuthNote: '先修配置',
  catMisc: '取消与兜底',
  catMiscNote: '慎选',
  codeServer: 'HTTP 5xx 服务端错误',
  codeTimeout: '请求超时：整次请求未在时限内返回；SSE 卡流（stream idle 看门狗）也以此码上报',
  codeTransport: '网络中断、连接重置、流提前结束',
  codeEmptyResponse: '流正常结束但零内容块；重试安全',
  codeStreamClosed: 'deepseek SSE 流未收到 [DONE] 就断开',
  codeMalformedResponse: 'SSE 数据帧格式损坏',
  codeInvalidResponse: '响应结构不符合预期（偶发可试）',
  codePiAiError: 'pi-ai 兜底未知错误；STREAM_ERROR 流式失败归此类',
  codePiAiNotWarmed: 'pi-ai 适配器尚未预热完成就被调用（启动竞态）；退避后重试通常能成',
  codeRateLimit: '429 限流',
  codeQuota: '配额/余额耗尽（规范字面值就是 QUOTA）；重试无意义',
  codeInvalidRequest: '400 类请求被拒（如 thinking 模式 reasoning_text 冲突、payload 超限）',
  codeContextWindowExceeded: '上下文超窗；重试同样失败，应压缩上下文',
  codeUnsupportedOption: '适配器不支持该生成参数（如 stop）；改参数而非重试',
  codeUnknownModel: '请求的模型不在目录；重试同样失败，应改模型选择',
  codeRequestExtension: 'deepseek 请求扩展（图片/搜索等）准备或受理失败（extension field 冲突等）；多为确定性错误',
  codeInvalidReplayState: 'pi-ai 重放状态损坏（内部管线错误）',
  codeUnsupportedContent: '该模型不支持此类内容（如图片）',
  codeUnsupportedReasoningEffort: '该模型不支持所选推理档位',
  codeFilesApi: 'deepseek 文件服务 HTTP 失败',
  codeAuth: '401/403 认证被拒；修密钥而非重试',
  codeInvalidCredential: '凭证格式非法；修正存储值',
  codeMissingCredential: '缺少 API Key；先去模型页配置',
  codeAborted: '调用方主动取消；绝不应重试',
  codeUnknown: '非 LlmError 的通用兜底；勾选=广撒网',
  groupContinue: '输出截断自动续写',
  continueHint: '回答被输出 token 上限截断时（宿主会显示「已达到输出 token 上限」），自动替你发一条「继续」，模型接着上文往下写。这不是请求失败，上面的重试策略管不到它；两者互不影响。',
  logTitle: '排错日志',
  logOpen: '打开日志',
  logCopied: '已复制日志路径，粘贴到资源管理器地址栏即可。',
  logManual: '当前环境拿不到日志路径也复制不了，请手动访问上面的路径。',
  continueZero: '次数为 0：不会补写任何一轮。',
  fieldMaxContinue: '最多连续续写',
  fieldMaxContinueHint: '同一次截断后连续补写的次数上限；模型正常说完或你重新发言即重新计数',
  fieldPrompt: '续写提示词',
  fieldPromptHint: '截断后自动发给模型的文案。留空用内置默认文案（「请从中断处直接继续输出…」）。',
  fieldPromptPlaceholder: '留空 = 使用内置默认文案',
  fieldPromptDefault: '当前使用内置默认文案',
  fieldPromptCustom: '当前使用自定义文案',
  fieldPromptTemplate: '提示词模板',
  promptTemplateHint: '选模板只是把文案填进下面的输入框，仍可自由修改；选「内置默认」等于清空输入框。',
  promptTemplatePick: '插入模板…',
  promptTemplateState: '当前使用模板：{name}',
  promptTplDefault: '内置默认',
  promptTplKeep: '直接续写',
  promptTplKeepText: '继续。从中断处往下写，不要重复已经输出的内容，也不要重新开头。',
  promptTplAnswer: '先给结论',
  promptTplAnswerText: '上一条回复被输出长度上限截断。请先直接给出最终答案，再补最关键的论证；不要重复已经输出的内容。',
  promptTplThink: '压缩思考',
  promptTplThinkText: '上一条回复在思考阶段就达到输出上限。请压缩推理：直接给出最终答案，只在必要处给一行理由，不要展开长篇思考。',
  continueOnError: '重试彻底失败后也续写',
  continueOnErrorHint: '请求把重试次数用尽后，若结束原因是瞬时错误（超时 / 传输 / 服务端 / 流中断 / 空响应），也补一轮续写；确定性错误（参数、内容、凭证）不补。',
  groupBackoff: '退避与预算',
  backoffEmpty: '重试次数为 0：不会产生任何等待。',
  backoffBudget: '预算：{n} 次重试累计等待 {best}~{worst}（含抖动区间）',
  backoffSeq: '序列：{seq}（共 {n} 档）',
  backoffHint: '每次 ×2 递增并在「最大退避」处封顶；抖动给每一档 ±{p}% 的随机偏移。',
  groupOverrides: '按 provider / model 的策略',
  overridesHint: '按顺序取第一条命中的规则：provider / model 支持 * 通配，留空或 * = 任意。数值留空即继承上面的全局值。model 匹配依赖宿主看到的最近一次请求元数据。',
  overridesNone: '没有覆盖规则：所有 provider 都用上面的全局值。',
  overrideProviderPlaceholder: '如 jyld2 或 *',
  overrideModelPlaceholder: '如 qwen3.8-flash 或 *',
  overrideAdd: '添加一条',
  overrideRemove: '删除',
  overrideShortRetries: '次数',
  overrideShortInitial: '初始',
  overrideShortMax: '封顶',
  overrideShortJitter: '抖动%',
  groupStats: '重试观测（本进程累计）',
  statsRefresh: '刷新',
  statsLoading: '读取中…',
  statsUnavailable: '拿不到宿主数据：{msg}。宿主半边的观测路由需要重启内核后才注册。',
  statsRetries: '请求失败重试',
  statsContinues: '自动续写',
  statsCapped: '续写触顶',
  statsSkipped: '让位用户',
  statsByCode: '按错误码',
  statsByProvider: '按 provider',
  statsRecent: '最近记录',
  statsEmpty: '暂无记录',
  statsStale: '宿主半边未重载（内核未重启）：观测路由还没注册，重启后这里就有数据了。',
  statsKindRetry: '重试',
  statsKindContinue: '续写',
  statsKindCap: '触顶',
  statsKindSkip: '跳过',
  statsUptime: '已运行 {mins} 分钟',
  statsModels: '当前会话模型（覆盖规则按它匹配）',
  statsDiag: '宿主构建 {tag}',
  statsLogTail: '查看日志尾部',
  statsLogHide: '收起日志',
  statsLogEmpty: '（暂无日志）',
  hostStale: '宿主半边还是旧版（内核未重启）：覆盖规则 / 续写增强 / 观测面板可以看，但保存不生效、观测路由会 404。',
  formUnavailable: '宿主没有把本插件的配置暴露给这个客户端（条目未激活或未组合）。',
  formReadOnly: '当前配置为只读，改动不会落盘。',
  formSaveFailed: '保存失败 ✗（重试或刷新页面；宿主日志见 settings-rejected）',
  save: '保存',
  saving: '保存中…',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalidNumber: '请填一个数字',
}

/** 英文文案. */
export const en: Record<RetryLocaleKey, string> = {
  description: 'Automatic recovery for failed model requests, plus auto-continue when a reply is cut off by the output token limit. While enabled, this page overrides each provider\'s retry count and backoff.',
  enabled: 'Override retry policy',
  enabledHint: 'Once on and saved, this plugin overrides every provider\'s retry count and backoff; while off it changes nothing at all.',
  statusOff: 'Using each provider\'s built-in retry policy',
  statusOn: 'up to {n} retries · backoff {init}ms→{max}ms · jitter {j} · {c} extra codes',
  continueOn: 'auto-continue ≤{n}',
  continueOff: 'no auto-continue',
  fieldRetries: 'Max retries',
  fieldRetriesHint: 'How many times to retry after a failure; 0 = no retry',
  fieldInitial: 'Initial backoff',
  fieldInitialHint: 'Wait before the first retry, then grows exponentially',
  fieldMax: 'Max backoff',
  fieldMaxHint: 'Upper bound for the backoff wait',
  fieldJitter: 'Jitter ratio',
  fieldJitterHint: '0~1, randomizes each backoff to avoid synchronized retries',
  groupCodes: 'Extra retryable error codes',
  fieldCodesHint: 'Grouped into six buckets by "is retrying worth it"; each group title shows how many of its codes are picked. Your picks are unioned with the provider\'s built-in list (never replacing it). Amber = retrying usually does not help. STREAM_ERROR folds into PI_AI_ERROR, SSE stalls into TIMEOUT. Codes added by hand in a provider config appear in the "Custom" group.',
  codesNone: 'No extra codes — retry only the provider built-ins',
  codesCount: 'Adding {n} error codes',
  codesClear: 'Clear',
  codesCustom: 'Custom',
  codesCustomHint: 'Not in the known list (added by hand in a provider config, or typed here and saved)',
  codesCustomChip: 'Custom code — click to unselect',
  codesCustomNone: 'No custom codes',
  codesAddPlaceholder: 'Type a code, e.g. MY_PROVIDER_BUSY',
  codesAddBtn: 'Add',
  codesAddDup: 'Already selected or listed: {code}',
  codesAddBad: '{code} contains spaces or illegal characters (A-Z 0-9 _ - . only)',
  catTransient: 'Transient failures',
  catTransientNote: 'Retrying usually recovers',
  catQuota: 'Rate limits and quota',
  catQuotaNote: 'May recover after a backoff',
  catRequest: 'Request and parameters',
  catRequestNote: 'Mostly deterministic errors',
  catContent: 'Content and capability',
  catContentNote: 'The model cannot do it; retrying will not help',
  catAuth: 'Credentials and auth',
  catAuthNote: 'Fix the configuration first',
  catMisc: 'Aborts and fallback',
  catMiscNote: 'Pick with care',
  codeServer: 'HTTP 5xx server error',
  codeTimeout: 'Request timed out: the whole request did not return within its deadline; a stalled SSE stream (the stream idle watchdog) is reported under this code too',
  codeTransport: 'Network break, connection reset, or a stream that ended early',
  codeEmptyResponse: 'The stream ended normally but carried no content block; safe to retry',
  codeStreamClosed: 'The deepseek SSE stream closed before [DONE] arrived',
  codeMalformedResponse: 'An SSE data frame was malformed',
  codeInvalidResponse: 'The response shape was not what the adapter expected (worth a try when it is intermittent)',
  codePiAiError: 'pi-ai catch-all for unknown errors; STREAM_ERROR stream failures land here',
  codePiAiNotWarmed: 'The pi-ai adapter was called before it finished warming up (a startup race); a backoff retry usually succeeds',
  codeRateLimit: 'HTTP 429 rate limit',
  codeQuota: 'Quota or balance exhausted (the canonical literal is QUOTA); retrying is pointless',
  codeInvalidRequest: 'A 400-class rejection (for example the thinking-mode reasoning_text conflict, or an oversized payload)',
  codeContextWindowExceeded: 'Context window exceeded; retrying fails the same way, so compress the context instead',
  codeUnsupportedOption: 'The adapter does not support that generation option (for example stop); change the option instead of retrying',
  codeUnknownModel: 'The requested model is not in the catalog; retrying fails the same way, so change the model',
  codeRequestExtension: 'A deepseek request extension (images, search, ...) failed to prepare or was rejected (extension field conflicts and the like); usually deterministic',
  codeInvalidReplayState: 'pi-ai replay state is corrupted (an internal pipeline error)',
  codeUnsupportedContent: 'The model does not support this kind of content (images, for example)',
  codeUnsupportedReasoningEffort: 'The model does not support the selected reasoning effort',
  codeFilesApi: 'The deepseek file service returned an HTTP failure',
  codeAuth: '401/403 authentication rejected; fix the key instead of retrying',
  codeInvalidCredential: 'The credential is malformed; correct the stored value',
  codeMissingCredential: 'No API key configured; set it on the Models page first',
  codeAborted: 'Cancelled by the caller; never retry',
  codeUnknown: 'Generic fallback for failures that are not LlmError; picking it means casting a wide net',
  groupContinue: 'Auto-continue on truncation',
  continueHint: 'When a reply is cut off by the output token limit (the host shows "Output token limit reached"), a "continue" turn is sent automatically so the model resumes. This is not a request failure, so the retry policy above never sees it; the two are independent.',
  logTitle: 'Troubleshooting log',
  logOpen: 'Open log',
  logCopied: 'Log path copied — paste it into Explorer\'s address bar.',
  logManual: 'This environment exposes neither the log path nor the clipboard; open the path above manually.',
  continueZero: 'Zero rounds: nothing will be sent.',
  fieldMaxContinue: 'Max consecutive continuations',
  fieldMaxContinueHint: 'Upper bound per truncation chain; resets once the model finishes or you speak again',
  fieldPrompt: 'Continuation prompt',
  fieldPromptHint: 'The text sent to the model after a truncation. Leave empty for the built-in default ("resume from where it stopped…").',
  fieldPromptPlaceholder: 'Empty = built-in default',
  fieldPromptDefault: 'Currently using the built-in default text',
  fieldPromptCustom: 'Currently using a custom text',
  fieldPromptTemplate: 'Prompt template',
  promptTemplateHint: 'Picking a template only fills the text box below — you can still edit it. "Built-in default" clears the box.',
  promptTemplatePick: 'Insert template…',
  promptTemplateState: 'Template: {name}',
  promptTplDefault: 'Built-in default',
  promptTplKeep: 'Resume',
  promptTplKeepText: 'Continue. Resume from where you stopped, without repeating what you already wrote or starting over.',
  promptTplAnswer: 'Answer first',
  promptTplAnswerText: 'The previous reply was cut off by the output length limit. Give the final answer first, then only the most essential argument; do not repeat what you already wrote.',
  promptTplThink: 'Compress thinking',
  promptTplThinkText: 'The previous reply hit the output limit while still thinking. Compress your reasoning: give the final answer directly, with at most one line of justification per step.',
  continueOnError: 'Continue after retries are exhausted',
  continueOnErrorHint: 'Once the request has used up all retries, a transient failure (timeout / transport / server / stream break / empty response) also gets one continuation round; deterministic failures (params, content, credentials) do not.',
  groupBackoff: 'Backoff & budget',
  backoffEmpty: 'Zero retries: no waiting at all.',
  backoffBudget: 'Budget: {n} retries wait {best}–{worst} in total (jitter range)',
  backoffSeq: 'Curve: {seq} ({n} steps)',
  backoffHint: 'Doubles each time, capped at Max backoff; jitter adds ±{p}% per step.',
  groupOverrides: 'Per provider / model policy',
  overridesHint: 'First matching rule wins: provider / model accept * wildcards; empty or * = any. Empty numbers inherit the global values above. Model matching depends on the latest request metadata the host has seen.',
  overridesNone: 'No override rules: every provider uses the global values above.',
  overrideProviderPlaceholder: 'e.g. jyld2 or *',
  overrideModelPlaceholder: 'e.g. qwen3.8-flash or *',
  overrideAdd: 'Add a rule',
  overrideRemove: 'Delete',
  overrideShortRetries: 'retries',
  overrideShortInitial: 'initial',
  overrideShortMax: 'cap',
  overrideShortJitter: 'jitter%',
  groupStats: 'Retry observation (this kernel run)',
  statsRefresh: 'Refresh',
  statsLoading: 'Loading…',
  statsUnavailable: 'Host data unavailable: {msg}. The host half registers these routes only after a kernel restart.',
  statsRetries: 'Retried failures',
  statsContinues: 'Auto-continues',
  statsCapped: 'Hit the cap',
  statsSkipped: 'Yielded to user',
  statsByCode: 'By error code',
  statsByProvider: 'By provider',
  statsRecent: 'Recent events',
  statsEmpty: 'No events yet',
  statsStale: 'The host half is not reloaded yet (kernel not restarted): the stats route is not registered. Restart and this panel fills up.',
  statsKindRetry: 'retry',
  statsKindContinue: 'continue',
  statsKindCap: 'cap',
  statsKindSkip: 'skip',
  statsUptime: 'up {mins} min',
  statsModels: 'Live session models (what the override rules match)',
  statsDiag: 'host build {tag}',
  statsLogTail: 'Show log tail',
  statsLogHide: 'Hide log',
  statsLogEmpty: '(no log yet)',
  hostStale: 'The host half is still the old build (kernel not restarted): the override rules, continuation extras and observation panel render, but saving has no effect and the stats route returns 404.',
  formUnavailable: 'The host does not expose this plugin\'s configuration to this client (entry inactive or not composed).',
  formReadOnly: 'This configuration is read-only; edits will not be stored.',
  formSaveFailed: 'Save failed ✗ (retry or refresh; host log: settings-rejected)',
  save: 'Save',
  saving: 'Saving…',
  overridden: 'overridden',
  reset: 'Reset',
  invalidNumber: 'Enter a number',
}
