/** 重复检测的关键边界回归. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { RepetitionDetector } from '../src/host/repetition/detector.ts'
import { normalizeConfig, Config as ConfigSchema } from '../src/host/config.ts'

const rule = { minRepeats: 4, minChars: 256 }

test('中文和 Unicode 按字符计数, 两个阈值同时满足', () => {
  const detector = new RepetitionDetector()
  assert.equal(detector.push('你好🙂'.repeat(64), rule), undefined)
  const hit = detector.push('你好🙂'.repeat(40), rule)
  assert.equal(hit?.period, 3)
  assert.ok(hit!.chars >= 256)
  assert.ok(hit!.repeats >= 4)
})

test('任意 chunk 划分都能检测, 巨大 chunk 内的重复后缀不漏检', () => {
  const text = '正常前文\n' + '持续重复的一段文字\n'.repeat(150) + '后面恢复正常'
  for (const size of [1, 7, 64, text.length]) {
    const detector = new RepetitionDetector()
    let hit
    for (let i = 0; i < text.length && hit === undefined; i += size) hit = detector.push(text.slice(i, i + size), rule)
    assert.ok(hit)
  }
})

test('UTF-16 代理对跨 chunk 时不把 emoji 计数为两个字符', () => {
  const detector = new RepetitionDetector()
  for (let i = 0; i < 255; i += 1) {
    assert.equal(detector.push('\ud83d', rule), undefined)
    assert.equal(detector.push('\ude42', rule), undefined)
  }
  assert.equal(detector.push('\ud83d', rule), undefined)
  const hit = detector.push('\ude42', rule)
  assert.equal(hit?.chars, 256)
  assert.equal(hit?.period, 1)
})

test('重复次数阈值独立生效, 不能仅凭长度中止', () => {
  const detector = new RepetitionDetector()
  const unit = Array.from({ length: 100 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('')
  assert.equal(detector.push(unit.repeat(3), rule), undefined)
  assert.ok(detector.push(unit.repeat(2), rule))
})

test('有限重复, 相似段落, 非连续重复及普通长文本不触发', () => {
  const samples = [
    '例子\n'.repeat(4),
    Array.from({ length: 200 }, (_, i) => `第 ${i} 步: 检查当前内容\n`).join(''),
    '相同引用\n不同解释\n相同引用\n另一段解释\n'.repeat(3),
    Array.from({ length: 30000 }, (_, i) => String.fromCodePoint(0x4e00 + i % 20000)).join(''),
  ]
  for (const text of samples) assert.equal(new RepetitionDetector().push(text, rule), undefined)
})

test('单字符死循环和长句死循环都检测, 改规则清空旧窗口', () => {
  assert.ok(new RepetitionDetector().push('a'.repeat(300), rule))
  const unit = Array.from({ length: 1000 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('')
  assert.ok(new RepetitionDetector().push(unit.repeat(5), rule))
  const detector = new RepetitionDetector()
  detector.push('a'.repeat(224), rule)
  assert.equal(detector.push('a'.repeat(32), { minRepeats: 5, minChars: 512 }), undefined)
})

test('默认要求至少 8 次且至少 256 个字符, 两个条件同时满足', () => {
  const config = normalizeConfig(undefined)
  assert.equal(config.repeatMinRepeats, 8)
  assert.equal(config.repeatMinChars, 256)
  const defaultRule = { minRepeats: config.repeatMinRepeats, minChars: config.repeatMinChars }
  const unit = Array.from({ length: 64 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join('')
  const detector = new RepetitionDetector()
  assert.equal(detector.push(unit.repeat(7), defaultRule), undefined)
  assert.ok(detector.push(unit, defaultRule))
  const short = new RepetitionDetector()
  assert.equal(short.push('ab'.repeat(8), defaultRule), undefined)
  assert.ok(short.push('ab'.repeat(120), defaultRule))
})

test('默认关闭及配置边界收敛, Schema 拒绝非法阈值', () => {
  assert.equal(normalizeConfig(undefined).repeatDetection, false)
  const config = normalizeConfig({ repeatDetection: true, repeatMinRepeats: 200, repeatMinChars: -10 })
  assert.equal(config.repeatMinRepeats, 20)
  assert.equal(config.repeatMinChars, 64)
  assert.throws(() => ConfigSchema({ repeatMinRepeats: 2 }))
  assert.throws(() => ConfigSchema({ repeatMinChars: 9000 }))
})
