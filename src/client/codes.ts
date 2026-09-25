/**
 * 已知错误码清单.
 *
 * 这里只有数据: 码本身, 它属于哪一组, 重试它值不值得, 以及**指向哪条文案的字典键**.
 * 所有显示出来的字 (组名, 组说明, 每个码的悬停说明) 都在 `locales.ts` 里, 界面切语言
 * 时跟着变.
 * @module dsh-llm-retry-settings/client/codes
 */

import type { RetryLocaleKey } from './locales.ts'

/** 一个错误码分组. */
export interface CodeCategory {
  id: string
  /** 组名的字典键. */
  labelKey: RetryLocaleKey
  /** 组说明 (一行小字) 的字典键. */
  noteKey: RetryLocaleKey
}

/** 一条已知错误码. */
export interface KnownCode {
  code: string
  cat: string
  /** 悬停说明的字典键. */
  descKey: RetryLocaleKey
  /** 重试基本无意义 (琥珀色), 仅特殊场景手动勾选. */
  warn?: boolean
}

/**
 * 分类口径: 按 "重试有没有恢复价值" 分六组, 从上到下递减.
 * transient 组是官方默认列表覆盖的瞬时故障; `warn` 的码一律落在后面四组.
 */
export const CODE_CATEGORIES: CodeCategory[] = [
  { id: 'transient', labelKey: 'catTransient', noteKey: 'catTransientNote' },
  { id: 'quota', labelKey: 'catQuota', noteKey: 'catQuotaNote' },
  { id: 'request', labelKey: 'catRequest', noteKey: 'catRequestNote' },
  { id: 'content', labelKey: 'catContent', noteKey: 'catContentNote' },
  { id: 'auth', labelKey: 'catAuth', noteKey: 'catAuthNote' },
  { id: 'misc', labelKey: 'catMisc', noteKey: 'catMiscNote' },
]

/**
 * 已知错误码全集.
 *
 * 刻意不列 (在 `agent/request-error` 之前抛出, 勾选也永远命中不了): dsh-llm 注册期码
 * NO_ADAPTER / INVALID_ADAPTER / DUPLICATE_ADAPTER / INVALID_CATALOG / *_DIRECTORY /
 * *_DISCOVERY / INVALID_MODEL_* / INVALID_PREPARED_CALL / REGISTRATION_DISPOSED /
 * INVARIANT, 以及凭证与发现期码 NO_CREDENTIAL_STORE / UNSTORABLE_PROVIDER_ID /
 * DISCOVERY_FAILED / DISCOVERY_UNSUPPORTED.
 *
 * 同样不列 LLM_STREAM_IDLE_TIMEOUT / DEEPSEEK_FILES_API_TIMEOUT: 它们只是 dsh-timeout
 * TimeoutReason 的 code, 从不作为 failure.code 出现. 判据: 只有
 * `new LlmError(msg, CODE)` (或 HarnessError.code) 才算错误码.
 */
export const KNOWN_CODES: KnownCode[] = [
  // —— 瞬时故障 ——
  { code: 'SERVER', cat: 'transient', descKey: 'codeServer' },
  { code: 'TIMEOUT', cat: 'transient', descKey: 'codeTimeout' },
  { code: 'TRANSPORT', cat: 'transient', descKey: 'codeTransport' },
  { code: 'EMPTY_RESPONSE', cat: 'transient', descKey: 'codeEmptyResponse' },
  { code: 'STREAM_CLOSED', cat: 'transient', descKey: 'codeStreamClosed' },
  { code: 'MALFORMED_RESPONSE', cat: 'transient', descKey: 'codeMalformedResponse' },
  { code: 'INVALID_RESPONSE', cat: 'transient', descKey: 'codeInvalidResponse' },
  { code: 'PI_AI_ERROR', cat: 'transient', descKey: 'codePiAiError' },
  { code: 'PI_AI_NOT_WARMED', cat: 'transient', descKey: 'codePiAiNotWarmed' },
  // —— 限流与配额 ——
  { code: 'RATE_LIMIT', cat: 'quota', descKey: 'codeRateLimit' },
  { code: 'QUOTA', cat: 'quota', warn: true, descKey: 'codeQuota' },
  // —— 请求与参数 ——
  { code: 'INVALID_REQUEST', cat: 'request', descKey: 'codeInvalidRequest' },
  { code: 'CONTEXT_WINDOW_EXCEEDED', cat: 'request', warn: true, descKey: 'codeContextWindowExceeded' },
  { code: 'UNSUPPORTED_OPTION', cat: 'request', warn: true, descKey: 'codeUnsupportedOption' },
  { code: 'UNKNOWN_MODEL', cat: 'request', warn: true, descKey: 'codeUnknownModel' },
  { code: 'REQUEST_EXTENSION', cat: 'request', warn: true, descKey: 'codeRequestExtension' },
  { code: 'INVALID_REPLAY_STATE', cat: 'request', warn: true, descKey: 'codeInvalidReplayState' },
  // —— 内容与能力 ——
  { code: 'UNSUPPORTED_CONTENT', cat: 'content', warn: true, descKey: 'codeUnsupportedContent' },
  { code: 'UNSUPPORTED_REASONING_EFFORT', cat: 'content', warn: true, descKey: 'codeUnsupportedReasoningEffort' },
  { code: 'FILES_API', cat: 'content', warn: true, descKey: 'codeFilesApi' },
  // —— 凭证与鉴权 ——
  { code: 'AUTH', cat: 'auth', warn: true, descKey: 'codeAuth' },
  { code: 'INVALID_CREDENTIAL', cat: 'auth', warn: true, descKey: 'codeInvalidCredential' },
  { code: 'MISSING_CREDENTIAL', cat: 'auth', warn: true, descKey: 'codeMissingCredential' },
  // —— 取消与兜底 ——
  { code: 'ABORTED', cat: 'misc', warn: true, descKey: 'codeAborted' },
  { code: 'UNKNOWN', cat: 'misc', warn: true, descKey: 'codeUnknown' },
]

/** 已知码集合. */
export const KNOWN_CODE_SET = new Set(KNOWN_CODES.map((entry) => entry.code))

/** 自定义码白名单: 宿主错误码是全大写标识符; 输入侧同样放行 `.` 与 `-`. */
export const CODE_RE = /^[A-Z0-9_][A-Z0-9_.-]*$/
