/**
 * 宿主半区与浏览器半区共享的常量, 默认值与配置形状.
 *
 * 默认值过去在两侧各手抄一份 (宿主 `DEFAULTS` 与客户端 `DEFAULTS`), 改动漏掉一侧
 * 就会让卡片显示与服务端实际生效值不一致; 现在只在这里写一次.
 * @module dsh-llm-retry-settings/shared
 */

/** 包名: Client loader 的注册 id 与 `plugins.bundle.config` 槽位的键都用它. */
export const PACKAGE_NAME = 'dsh-llm-retry-settings'

/** profile 条目 id (`cordis.patch.yml` 的 `id:`): 设置命名空间与 `configForms` 寻址都用它. */
export const ENTRY_ID = 'llm-retry-settings'

/**
 * 续写消息的生产者标识.
 *
 * session 格式 v4 要求 `source.kind` 归生产者所有 (拒收退役的 `kind: 'plugin'`),
 * 取值为 `plugin:<本串>`; 换掉它会让历史会话里的续写消息认不出来.
 */
export const PRODUCER_ID = 'dsh-llm-retry'

/**
 * 观测路由.
 *
 * 挂在 dsh 的 `/api` 通道下, 由 connection 插件注册的前缀路由先做 Host/Origin 栅栏
 * 与浏览器会话 cookie 认证, 过了才分发到这里的 handler; 插件不自己实现认证.
 */
export const STATS_PATH = '/api/dsh-llm-retry-settings/stats'
export const LOG_PATH = '/api/dsh-llm-retry-settings/log'

/** 日志路径的展示写法: 宿主还没把绝对路径注入进来时卡片显示它. */
export const LOG_FILE_DISPLAY = '~/.dsh/logs/dsh-llm-retry-settings/host.log'

/** 覆盖行里 "继承全局值" 的哨兵值 (避免 schema 里可选字段的歧义). */
export const OVERRIDE_INHERIT = -1

/** 覆盖行数量上限 (防手滑粘贴一大坨). */
export const OVERRIDE_MAX_ROWS = 20

/** 单条 provider/model 覆盖; 数值字段为 {@link OVERRIDE_INHERIT} 时继承全局值. */
export interface PolicyOverride {
  provider: string
  model: string
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
}

/**
 * 默认补充码: 400 reasoning_text (INVALID_REQUEST, OpenAI thinking 模式冲突) 与
 * pi-ai 兜底错误 (PI_AI_ERROR, 覆盖 STREAM_ERROR 等流式失败).
 */
export const DEFAULT_RETRYABLE_CODES = ['INVALID_REQUEST', 'PI_AI_ERROR']

/** 默认续写指令: 卡片里可以按 provider/model 覆盖. */
export const DEFAULT_CONTINUATION_PROMPT =
  '上一条回复因达到输出 token 上限被截断。请从中断处直接继续输出，不要重复已经输出的内容，也不要重新开头。'

/**
 * 全部默认值.
 *
 * 唯一事实源: 宿主 schema 的 default, 宿主归一化的兜底与客户端卡片的初值都取这里.
 * `logPath` 不在其中——它是宿主按 `DSH_HOME` 解析出来的只读值, 不是可配置默认.
 */
export const DEFAULTS = {
  enabled: false,
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  jitterRatio: 0.1,
  retryableCodes: [...DEFAULT_RETRYABLE_CODES],
  autoContinue: false,
  maxContinuations: 2,
  continuationPrompt: '',
  /** 瞬时错误 (重试彻底失败) 也自动续写一轮; 默认关闭. */
  continueOnError: false,
  /** provider/model 级策略覆盖; 空数组 = 全部沿用全局值. */
  overrides: [] as PolicyOverride[],
}

/** 生效配置的形状 (客户端卡片与服务端读到的是同一份). */
export interface Config {
  enabled: boolean
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  jitterRatio: number
  /** 补充到重试码列表的额外 code, 与 provider 默认值取并集 (不覆盖). 空数组 = 不补充. */
  retryableCodes: string[]
  /** 输出被 token 上限截断时自动补一轮续写. */
  autoContinue: boolean
  /** 单个会话内连续自动续写的次数上限 (0 = 永不续写). */
  maxContinuations: number
  /** 自动续写发送给模型的提示词; 空字符串表示使用 {@link DEFAULT_CONTINUATION_PROMPT}. */
  continuationPrompt: string
  /** 会话因瞬时错误结束时也自动续写一轮 (确定性错误不续写). */
  continueOnError: boolean
  /** provider/model 级策略覆盖, 按顺序取第一条命中. */
  overrides: PolicyOverride[]
  /** 只读: 宿主日志的绝对路径 (卡片用它打开日志). */
  logPath: string
}

/** 卡片渲染用的配置视图: `logPath` 缺席时由卡片自行兜底. */
export type ConfigView = Omit<Config, 'logPath'> & { logPath?: string }
