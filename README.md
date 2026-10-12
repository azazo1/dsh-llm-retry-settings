# dsh-llm-retry-settings

DSH 的 LLM 请求重试与自动恢复设置页. 在插件管理页编辑, 保存后实时生效. 请求重试, token 上限续写, 重复输出处理和最终失败恢复独立控制.

## 四组设置

| 设置组 | 主控项 | 参数 |
| --- | --- | --- |
| 请求失败重试 | 覆盖请求重试策略 | 重试次数, 退避, 抖动, 补充错误码, provider/model 覆盖 |
| token 上限续写 | 达到输出 token 上限后自动继续 | 次数上限, token 专用提示词 |
| 重复输出处理 | 关闭 / 仅中止 / 中止并自动继续 | 重复次数与字符阈值, 次数上限, 重复专用提示词 |
| 请求最终失败恢复 | 可恢复错误结束后自动继续 | 次数上限, 错误专用提示词 |

- 请求重试是在同一次请求内重试. 其余三组是在回合结束后恢复执行, 不伪装成 user 输入. 普通恢复发送插件消息, 重复截断的已激活 goal 由正式 goal 驱动继续.
- `中止并自动继续` 完整启用重复检测, 中止和继续. 不需要开启 token 续写或请求重试.
- 三类自动继续的次数上限默认各 `2` 次, 在同一条自动恢复链中分别累计. 切换触发原因不重置计数, 模型正常完成或 user 发言后才全部重置.
- 次数为 `0` 时, 对应组不发送继续. 重复检测仍会中止输出.
- 真人手动停止不自动继续. 已有 user 消息排队时让位给该消息. 等待期间开关关闭, 模式改变, 上限耗尽, 新回合开始或会话离场, 都会放弃过期投递.
- 各组关闭时参数仍可编辑. 只有保存才写入 profile patch, 离开页面会丢弃未保存的草稿.
- 参数, 内容和凭证等确定性错误不触发最终失败恢复. 错误恢复处理超时, 传输, 服务端, 流中断和空响应等可恢复错误.

## 重复检测

思考和正文分别检测连续精确重复, 不检测工具参数, 标题生成或上下文压缩. 默认要求连续重复至少 `8` 次, 且累计至少 `256` 个 Unicode 字符, 两个条件必须同时满足.

每 `32` 个新字符检查一次, 重复单元最多 `1024` 个字符, 检测窗口有内存上限. 相似但不相同的表达不触发. 正常长串重复也可能命中, 可提高阈值或选择关闭.

中止通过 agent 的公开取消接口执行. 保留已有输出和排队输入, 不删除已提交的重复尾部, 不伪造 token 上限或补造未执行工具的结果. 真人停止, 其他插件中止及旧会话恢复不触发重复自动继续.

`中止并自动继续` 遇到已激活的 goal 时, 记录中止前的目标并恢复宿主在取消收尾中产生的暂停或解除激活. 通过正式 goal 服务恢复, 下一轮由 goal 驱动投递, 重复专用提示词作为同轮上下文注入, 不额外发送普通续写. 下一轮仍计入 goal 轮次, 同时消耗一次重复恢复预算. 原本暂停或未激活的 goal, 真人主动暂停, 目标修改或替换, 排队输入, 次数触顶及 goal 轮次耗尽均不恢复. `仅中止` 保留宿主的暂停行为.

## 配置格式与迁移

配置格式版本是 `configVersion: 2`, 与插件发布版本无关. 无版本号或版本 `1` 的配置自动迁移, 通过正式 Settings 服务原子写回并清理旧开关. 并发编辑以设置修订号保护, 不直接改写 profile 文件.

- 旧 `repeatDetection=true` 转为 `repeatMode=continue`, 即中止并自动继续, 即使旧 `autoContinue=false` 也生效.
- 旧 token 续写开关, 上限及提示词保留. `autoContinue` 此后仅控制 token 上限续写.
- 旧错误恢复只有在 `autoContinue` 和 `continueOnError` 均开启时迁移为开启, 保持此前实际行为. 旧续写提示词复制到错误专用提示词.
- 新的重复和错误恢复上限各默认 `2`, 不继承旧的共用上限. 后续修改或恢复默认不再被旧字段覆盖.

| 组 | 配置键 | 默认值 |
| --- | --- | --- |
| 请求重试 | `enabled`, `maxRetries`, `initialDelayMs`, `maxDelayMs`, `jitterRatio` | `false`, `2`, `500`, `10000`, `0.1` |
| 请求重试 | `retryableCodes`, `overrides` | `["INVALID_REQUEST", "PI_AI_ERROR"]`, `[]` |
| token 续写 | `autoContinue`, `maxContinuations`, `continuationPrompt` | `false`, `2`, `""` |
| 重复处理 | `repeatMode`, `repeatMaxContinuations`, `repeatContinuationPrompt` | `off`, `2`, `""` |
| 重复阈值 | `repeatMinRepeats`, `repeatMinChars` | `8`, `256` |
| 错误恢复 | `errorContinue`, `errorMaxContinuations`, `errorContinuationPrompt` | `false`, `2`, `""` |

`repeatMode` 可选 `off`, `stop`, `continue`. 重复次数范围 `3-20`, 字符阈值范围 `64-8192`. 空提示词使用各组内置文案. 额外错误码与 provider 自带列表取并集, provider/model 覆盖按顺序取第一条命中, `*` 匹配任意值, 数值 `-1` 表示继承.

## 安装与使用

需要 DSH `>=0.2.0-rc.1 <0.3.0`, 以及宿主的 `settings`, `agents`, `sessions` 服务. 插件自带配置 UI, 不需要另外安装 UI 包.

```shell
dsh plugin --profile web add github:azazo1/dsh-llm-retry-settings
```

在目标 profile 启用插件后重启 DSH. 打开 `插件 -> 已安装 -> dsh-llm-retry-settings`, 设置区位于简介下方. 宿主构建更新后需要重新加载插件或重启 DSH, 仅刷新页面不会更新宿主逻辑.

## 观测与排错

页面末尾显示重试, 重复中止, 自动继续, 触顶和让位 user 的计数, 以及 provider/model 明细. 日志默认在 `~/.dsh/logs/dsh-llm-retry-settings/host.log`, 也可由设置页定位. 日志不保存原始模型输出.

恢复诊断会标出 `recovery=token|repeat|error`, 本组启用状态和 `count=N/M`. `bail` 表示触顶或无法投递, `放弃过期投递` 表示等待期间状态变化, `续写已投递` 表示已成功入队. 配置迁移写回失败会记录原因, 有效配置仍按新格式运行.

观测路由通过 `connection.fetch.register` 的认证 `/api` 通道提供, 不绕过内核的 Host/Origin 与会话认证.

## 开发

```shell
just verify           # 类型检查, 构建及无凭据回归测试
```

构建包含宿主和客户端, 发布产物位于 `lib/`. 回归覆盖真实 Loader 热更新, 配置迁移写回, 独立恢复预算及停止后的投递行为.

## License

[MIT](./LICENSE)
