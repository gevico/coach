import assert from 'node:assert/strict'
import test from 'node:test'
import { compileMarkdown } from '../src/lib/markdown.ts'
import { narrationFromBoard } from '../src/lib/narration.ts'

test('explicit page breaks preserve titles, per-page notes and globally ordered narration', () => {
  const source = `# Lesson
<!-- speaker: Opening. -->
## First
<!-- speaker: First column. -->
First content with [source][reference].
<!-- speaker: First content. -->

<!-- pagebreak -->
<!-- speaker: Second introduction. -->
<!-- preface: Second preface. -->
## Second
<!-- speaker: Second column. -->
Second content with [source][reference].
<!-- speaker: Second content. -->

# Appendix
<!-- speaker: Appendix introduction. -->
## Third
<!-- speaker: Third column. -->
Third content.
<!-- speaker: Third content. -->

[reference]: https://example.com/reference
`
  const board = compileMarkdown(source)
  assert.deepEqual(board.pages.map((page) => page.title), ['Lesson', 'Lesson', 'Appendix'])
  assert.deepEqual(board.pages.map((page) => page.columns.map((column) => column.title)), [['First'], ['Second'], ['Third']])
  const reference = '\n\n[reference]: https://example.com/reference'
  assert.equal(board.pages[1].notes, `Second introduction.${reference}`)
  assert.ok(board.pages[1].preface?.startsWith('Second preface.'))
  assert.ok(board.pages[1].columns[0].blocks[0].markdown.includes('[reference]: https://example.com/reference'))
  const narration = narrationFromBoard(board)
  const speeches = ['First column.', 'First content.', 'Second column.', 'Second content.', 'Third column.', 'Third content.']
  assert.deepEqual(narration.steps.map((step) => [step.number, step.speech]), speeches.map((speech, index) => [index + 1, speech + reference]))
  assert.equal(narration.steps[2].introduction, `Second introduction.${reference}`)
})

test('page-break text inside a code example remains visible source code', () => {
  const source = '# Syntax\n\n## Example\n\n```markdown\n<!-- pagebreak -->\n## Another column\n```\n<!-- speaker: Explain the example. -->\n'
  const board = compileMarkdown(source)
  assert.equal(board.pages.length, 1)
  assert.equal(board.pages[0].columns[0].blocks[0].kind, 'code')
  assert.ok(board.pages[0].columns[0].blocks[0].markdown.includes('<!-- pagebreak -->'))
  assert.equal(board.pages[0].columns[0].blocks[0].notes, 'Explain the example.')
})
