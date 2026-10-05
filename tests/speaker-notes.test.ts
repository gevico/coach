import assert from 'node:assert/strict'
import test from 'node:test'
import { compileMarkdown } from '../src/lib/markdown.ts'
import { compileNarration, narrationFromBoard } from '../src/lib/narration.ts'

test('speaker comments stay attached to their reveal units without adding canvas content', () => {
  const source = `# Presentation
<!-- speaker: Opening speech. -->

## First column
<!-- speaker: Explain the column. -->

A paragraph. <!-- speaker: Explain **the paragraph**. -->

- First item
  <!-- speaker: Explain the first item. -->
- Second item
  <!-- speaker: Explain the second item. -->
  - Nested content
    <!-- speaker: Explain the nested content. -->

### Comparison
<!-- speaker: Introduce the comparison. -->

| Name | Value |
| --- | --- |
| A | 1 |
<!-- speaker: Explain the table. -->

<!-- Ordinary editing comment. -->

## Second column
<!-- speaker: Explain the second column. -->
`
  const board = compileMarkdown(source)
  const narration = narrationFromBoard(board)
  assert.equal(board.pages.length, 1)
  assert.equal(board.pages[0].columns.length, 2)
  assert.equal(narration.steps.length, 7)
  assert.deepEqual(narration.steps.map((step) => step.speech), ['Explain the column.', 'Explain **the paragraph**.', 'Explain the first item.', 'Explain the second item.\n\nExplain the nested content.', 'Introduce the comparison.', 'Explain the table.', 'Explain the second column.'])
  assert.equal(narration.steps[0].introduction, 'Opening speech.')
  for (const column of board.pages[0].columns) {
    for (const block of column.blocks) {
      assert.ok(!block.markdown.includes('speaker:'))
      assert.ok(!block.markdown.includes('Explain'))
      assert.ok(!block.markdown.includes('Ordinary editing'))
    }
  }
  assert.ok(board.pages[0].columns[0].blocks[2].markdown.includes('Nested content'))
  assert.equal(narration.steps[5].title, 'Comparison')
})

test('multiple pages retain per-page introductions and global narration numbers', () => {
  const board = compileMarkdown(`# One
<!-- speaker: First opening. -->
## A
<!-- speaker: First column. -->

First body.
<!-- speaker: First body speech. -->

# Two
<!-- speaker: Second opening. -->
## B
<!-- speaker: Second column. -->

Second body.
<!-- speaker: Second body speech. -->`)
  const narration = narrationFromBoard(board)
  assert.deepEqual(narration.steps.map((step) => step.number), [1, 2, 3, 4])
  assert.equal(narration.steps[0].introduction, 'First opening.')
  assert.equal(narration.steps[2].introduction, 'Second opening.')
  assert.equal(narration.steps[3].speech, 'Second body speech.')
})

test('inline comments in page and column headings remain narration metadata', () => {
  const board = compileMarkdown('# Title <!-- speaker: Opening. -->\n\n## Column <!-- speaker: Column speech. -->\n\nBody.')
  assert.equal(board.pages[0].title.trim(), 'Title')
  assert.equal(board.pages[0].notes, 'Opening.')
  assert.equal(board.pages[0].columns[0].title.trim(), 'Column')
  assert.equal(board.pages[0].columns[0].notes, 'Column speech.')
  assert.equal(narrationFromBoard(board).steps.length, 2)
})

test('code examples containing comment syntax remain visible code, and comments preserve references', () => {
  const source = '# Examples\n\n## Code\n\n```html\n<!-- speaker: A literal code example. -->\n```\n\n<!-- speaker: Read [the documentation][docs]. -->\n\n[docs]: https://example.com/docs\n'
  const board = compileMarkdown(source)
  const block = board.pages[0].columns[0].blocks[0]
  assert.equal(block.kind, 'code')
  assert.ok(block.markdown.includes('A literal code example.'))
  assert.ok(block.notes?.startsWith('Read [the documentation][docs].'))
  assert.ok(block.notes?.includes('[docs]: https://example.com/docs'))
  assert.ok(block.markdown.includes('https://example.com/docs'))
})

test('numbered narration extracts speech and advance cues while omitting board and reference sections', () => {
  const notes = compileNarration(`Hello everyone.

An opening paragraph.

# Presentation

These are recording instructions.

## 01｜First step

**板书**：A table.

| A | B |
| --- | --- |
| 1 | 2 |

**口播**：Read **this part**.

Continue with another paragraph.

**【说完，按一次下一步，显示第 02 项】**

## 02｜Second step

Read this directly.

## Technical references

Reference content.
`)
  assert.equal(notes.introduction, 'Hello everyone.\n\nAn opening paragraph.')
  assert.equal(notes.steps.length, 2)
  assert.equal(notes.steps[0].speech, 'Read **this part**.\n\nContinue with another paragraph.')
  assert.equal(notes.steps[0].cue, '【说完，按一次下一步，显示第 02 项】')
  assert.equal(notes.steps[1].speech, 'Read this directly.')
  assert.deepEqual(notes.issues, [])
})

test('duplicate narration numbers cannot silently select the wrong script', () => {
  const notes = compileNarration('## 01｜A\n\nFirst script.\n\n## 01｜B\n\nAnother script.\n\n## 00｜C\n\nInvalid script.')
  assert.equal(notes.steps.length, 0)
  assert.ok(notes.issues.some((issue) => issue.includes('编号重复')))
  assert.ok(notes.issues.some((issue) => issue.includes('从 1 开始')))
})
