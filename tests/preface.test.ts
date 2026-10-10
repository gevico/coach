import assert from 'node:assert/strict'
import test from 'node:test'
import { compileMarkdown } from '../src/lib/markdown.ts'
import { narrationFromBoard } from '../src/lib/narration.ts'

test('per-page prefaces preserve Markdown references independently of speaker notes and reveal steps', () => {
  const board = compileMarkdown(`# Coach canvas
<!-- preface:
- **Board**: Render [Markdown with Coach][project].
- **Navigation**: Reveal content with the arrow keys.
-->
<!-- speaker: Introduce the Markdown canvas. -->

## Markdown
<!-- speaker: Explain Markdown content. -->

# Coach narration
<!-- preface: **Narration**: Read synchronized speaker notes. -->
<!-- speaker: Introduce speaker notes. -->

## Speaker notes
<!-- speaker: Explain speaker comments. -->

[project]: https://github.com/gevico/coach
`)
  assert.equal(board.pages.length, 2)
  assert.match(board.pages[0].preface!, /\*\*Board\*\*/)
  assert.match(board.pages[0].preface!, /\[project\]: https:/)
  assert.ok(!board.pages[1].preface!.includes('Navigation'))
  assert.match(board.pages[1].preface!, /Narration/)
  assert.ok(!board.pages[0].notes!.includes('Navigation'))
  const narration = narrationFromBoard(board)
  assert.equal(narration.steps.length, 2)
  assert.ok(!narration.steps.some((item) => item.speech.includes('preface:')))
  assert.equal(narration.steps[1].introduction, 'Introduce speaker notes.\n\n[project]: https://github.com/gevico/coach')
  assert.match(narration.introduction, /Introduce the Markdown canvas/)
})
