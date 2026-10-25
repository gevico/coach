import assert from 'node:assert/strict'
import test from 'node:test'
import { compileMarkdown } from '../src/lib/markdown.ts'
import { narrationFromBoard } from '../src/lib/narration.ts'
import { DEFAULT_PRESENTATION, mediaConfig, mediaURL, resolvePresentation } from '../src/lib/presentation.ts'
import { createSceneDocument } from '../src/lib/scene-document.ts'
import { fromHtml } from 'hast-util-from-html'
import { visit } from 'unist-util-visit'

test('presentation metadata stays out of the reveal sequence and preserves notes and pages', () => {
  const source = '---\npresentation:\n  theme: night\n  motion: slide\n  speed: 1.5\n  autoplay: false\n---\n# 课程\n<!-- speaker: 开场 -->\n## 第一栏\n<!-- speaker: 栏目 -->\n```mermaid\nflowchart LR\n A-->B\n```\n<!-- speaker: 图示 -->\n<!-- pagebreak -->\n## 第二栏\n```math\na^2+b^2=c^2\n```\n<!-- speaker: 公式 -->'
  const document = compileMarkdown(source)
  assert.deepEqual(document.presentation, { theme: 'night', motion: 'slide', speed: 1.5, autoplay: false })
  assert.equal(document.pages.length, 2)
  const narration = narrationFromBoard(document)
  assert.equal(narration.introduction, '开场')
  assert.deepEqual(narration.steps.map(step => step.speech), ['栏目', '图示', '', '公式'])
  assert.equal(document.pages[0].columns[0].blocks[0].notes, '图示')
})

test('invalid settings are reported while lesson content remains available', () => {
  for (const config of ['theme: missing', 'speed: .nan', 'autoplay: yes', 'motion: wrong', 'theme: paper\n  theme: night']) {
    const document = compileMarkdown(`---\npresentation:\n  ${config}\n---\n# 课程\n## 内容\n正文`)
    assert.ok(document.issues?.length)
    assert.equal(document.pages[0].columns[0].blocks[0].markdown, '正文')
  }
})

test('theme selection applies its motion while explicit course effects retain precedence', () => {
  assert.deepEqual(resolvePresentation(), DEFAULT_PRESENTATION)
  const saved = { theme: 'night', motion: 'none', speed: 1.5, autoplay: false } as const
  const course = compileMarkdown('---\npresentation:\n  theme: editorial\n---\n# 课程\n## 内容\n正文')
  assert.deepEqual(resolvePresentation(saved, course.presentation), { theme: 'editorial', motion: 'slide', speed: 1.5, autoplay: false })
  const selected = resolvePresentation(saved, { theme: 'particles' })
  assert.deepEqual(selected, { theme: 'particles', motion: 'cinematic', speed: 1.5, autoplay: false })
  assert.deepEqual(resolvePresentation(selected, { theme: 'paper', motion: 'fade' }), { theme: 'paper', motion: 'fade', speed: 1.5, autoplay: false })
  assert.equal(resolvePresentation(selected, { theme: 'paper' }).motion, 'write')
  assert.deepEqual(resolvePresentation(selected), selected)
})

test('media clips validate dimensions, timeline and local scene origin', () => {
  const source = 'src: ./film/index.html\ntitle: 课堂\nposter: ./cover.png\nstart: 14\nduration: 9\nfps: 60'
  const config = mediaConfig(source, true)
  assert.equal(config.start, 14)
  assert.equal(config.duration, 9)
  assert.equal(mediaURL(config.src, 'http://localhost:4000/course-assets/', true), 'http://localhost:4000/course-assets/film/index.html')
  for (const src of ['javascript:alert(1)', 'file:///etc/passwd', '../api/document', 'https://elsewhere.test/scene.html']) assert.throws(() => mediaURL(src, 'http://localhost:4000/course-assets/', true))
  assert.throws(() => mediaConfig('src: ./film.html\ntitle: 课堂', true))
  for (const value of ['duration: 0', 'fps: .inf', 'start: -1', 'width: 0']) {
    assert.throws(() => mediaConfig(`src: ./film/index.html\ntitle: 课堂\nposter: ./cover.png\n${value}`, true), /需要在/)
  }
})

test('HTML scenes receive an isolated bridge and cannot replace its base or CSP', () => {
  const config = mediaConfig('src: ./film/index.html\ntitle: 课堂\nposter: ./cover.png', true)
  const html = createSceneDocument('<html><head><base href="https://elsewhere.test/"><meta http-equiv="refresh" content="0;url=https://elsewhere.test/"></head><body><script>window.renderFrame = f => document.body.dataset.frame = f</script></body></html>', 'http://localhost:4000/course-assets/film/index.html', 'http://localhost:4000/course-assets/', config)
  const elements: { tag: string; properties: Record<string, unknown> }[] = []
  visit(fromHtml(html), 'element', node => { elements.push({ tag: node.tagName, properties: node.properties }) })
  const bases = elements.filter(node => node.tag === 'base')
  assert.equal(bases.length, 1)
  assert.equal(bases[0].properties.href, 'http://localhost:4000/course-assets/film/index.html')
  const policy = elements.find(node => node.tag === 'meta')!
  assert.match(String(policy.properties.content), /connect-src http:\/\/localhost:4000\/course-assets\//)
  assert.match(String(policy.properties.content), /form-action 'none'/)
  assert.ok(!html.includes('http-equiv="refresh"'))
  assert.ok(html.includes('coach:seek') && html.includes('coach:ready'))
})
