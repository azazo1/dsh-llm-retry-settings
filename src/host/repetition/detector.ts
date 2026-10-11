/** 有界的流式重复检测, 思维链和正文分别使用独立实例. */

/** 最大重复单元为 1024 个 Unicode 字符, 每 32 个新字符检查一次. */
export const MAX_REPEAT_PERIOD = 1024
const CHECK_STEP = 32

export interface RepeatRule {
  minRepeats: number
  minChars: number
}

export interface RepeatHit {
  period: number
  repeats: number
  chars: number
}

/** 精确匹配连续重复后缀, 不把相似句子或非连续的引用当作循环. */
export class RepetitionDetector {
  private tail: string[] = []
  private unchecked = 0
  private rule: RepeatRule | undefined
  private pendingHighSurrogate = ''

  push(text: string, rule: RepeatRule): RepeatHit | undefined {
    if (this.rule?.minRepeats !== rule.minRepeats || this.rule?.minChars !== rule.minChars) {
      this.tail = []
      this.unchecked = 0
      this.pendingHighSurrogate = ''
      this.rule = { ...rule }
    }
    if (text === '') return undefined
    text = this.pendingHighSurrogate + text
    this.pendingHighSurrogate = ''
    // 适配器若在 UTF-16 代理对中间拆 chunk, 仍按一个 Unicode 字符计数.
    const last = text.charCodeAt(text.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) {
      this.pendingHighSurrogate = text.slice(-1)
      text = text.slice(0, -1)
    }
    const limit = Math.max(rule.minChars, MAX_REPEAT_PERIOD * rule.minRepeats)
    // 逐批检查, 大 chunk 内循环后面即使跟着正常文字也不会漏检.
    for (const char of text) {
      this.tail.push(char)
      this.unchecked += 1
      if (this.unchecked < CHECK_STEP) continue
      this.unchecked = 0
      if (this.tail.length > limit) this.tail.splice(0, this.tail.length - limit)
      const hit = this.detect(rule)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  private detect(rule: RepeatRule): RepeatHit | undefined {
    const size = this.tail.length
    if (size < rule.minChars) return undefined
    const maxPeriod = Math.min(MAX_REPEAT_PERIOD, Math.floor(size / rule.minRepeats))
    for (let period = 1; period <= maxPeriod; period += 1) {
      const repeats = Math.max(rule.minRepeats, Math.ceil(rule.minChars / period))
      const chars = period * repeats
      if (chars > size) continue
      let matched = true
      for (let i = size - 1; i >= size - chars + period; i -= 1) {
        if (this.tail[i] !== this.tail[i - period]) {
          matched = false
          break
        }
      }
      if (matched) return { period, repeats, chars }
    }
    return undefined
  }
}
