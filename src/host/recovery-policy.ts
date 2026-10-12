/** 三类回合恢复的独立策略. */
import {
  DEFAULT_CONTINUATION_PROMPT, DEFAULT_REPEAT_CONTINUATION_PROMPT,
  DEFAULT_ERROR_CONTINUATION_PROMPT, type Config,
} from '../shared.ts'

export type RecoveryKind = 'token' | 'repeat' | 'error'

export function recoveryPolicy(config: Config, kind: RecoveryKind) {
  const enabled = kind === 'token' ? config.autoContinue
    : kind === 'repeat' ? config.repeatMode === 'continue' : config.errorContinue
  const limit = kind === 'token' ? config.maxContinuations
    : kind === 'repeat' ? config.repeatMaxContinuations : config.errorMaxContinuations
  const custom = (kind === 'token' ? config.continuationPrompt
    : kind === 'repeat' ? config.repeatContinuationPrompt : config.errorContinuationPrompt).trim()
  const fallback = kind === 'token' ? DEFAULT_CONTINUATION_PROMPT
    : kind === 'repeat' ? DEFAULT_REPEAT_CONTINUATION_PROMPT : DEFAULT_ERROR_CONTINUATION_PROMPT
  return { enabled, limit, prompt: custom || fallback, custom: custom !== '' }
}
