import assert from 'node:assert/strict'
import test from 'node:test'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { compileMarkdown } from '../src/lib/markdown.ts'
import { narrationFromBoard } from '../src/lib/narration.ts'
import { buildExplanationPrompt, explanationsFromBoard } from '../src/lib/explanation.ts'

test('explanations and speaker notes remain separate through nested reveal units and multiple pages', () => {
  const board = compileMarkdown(`# Design <!-- explain: Overall reasoning. -->
<!-- speaker: Opening narration. -->

## Constraints
<!-- explain: Column reasoning. -->
<!-- speaker: Column narration. -->

An assumption. <!-- explain: Assumption reasoning. -->
<!-- speaker: Assumption narration. -->

- First constraint
  <!-- explain: Constraint reasoning. -->
  - Nested condition
    <!-- explain: Nested reasoning. -->
- Existing note
  <!-- speaker: Existing explanation. -->

# Implementation
<!-- explain: Implementation overview. -->
## Storage
<!-- explain: Storage reasoning. -->

![Layout](./layout.svg)
<!-- explain: Image reasoning. -->`)
  const narration = narrationFromBoard(board)
  const explanation = explanationsFromBoard(board)
  assert.equal(board.pages[0].explanation, 'Overall reasoning.')
  assert.equal(board.pages[0].notes, 'Opening narration.')
  assert.equal(explanation.introduction, 'Overall reasoning.')
  assert.deepEqual(explanation.steps.map((step) => step.body), ['Column reasoning.', 'Assumption reasoning.', 'Constraint reasoning.\n\nNested reasoning.', 'Existing explanation.', 'Storage reasoning.', 'Image reasoning.'])
  assert.deepEqual(explanation.steps.map((step) => [step.number, step.pageIndex, step.localStep]), [[1, 0, 1], [2, 0, 2], [3, 0, 3], [4, 0, 4], [5, 1, 1], [6, 1, 2]])
  assert.equal(explanation.steps[3].source, 'speaker')
  assert.equal(explanation.steps[5].title, 'Layout')
  assert.deepEqual(narration.steps.map((step) => step.speech), ['Column narration.', 'Assumption narration.', '', 'Existing explanation.', '', ''])
  for (const block of board.pages.flatMap((page) => page.columns.flatMap((column) => column.blocks))) {
    assert.ok(!block.markdown.includes('explain:'))
  }
})

test('explanation references survive extraction and literal code comments remain visible', () => {
  const board = compileMarkdown('# Design\n\n## Example\n\n```html\n<!-- explain: Literal syntax. -->\n```\n\n<!-- explain: See [the reference][source]. -->\n\n[source]: https://example.com/reference\n')
  const block = board.pages[0].columns[0].blocks[0]
  assert.equal(block.kind, 'code')
  assert.ok(block.markdown.includes('<!-- explain: Literal syntax. -->'))
  assert.ok(block.explanation?.includes('[source]: https://example.com/reference'))
  assert.ok(!block.explanation?.includes('Literal syntax.'))
})

test('copy prompts preserve complete source with nested fences for manual annotation generation', () => {
  const source = '# Design\n\n## Example\n\n````markdown\n```bash\ncoach design.md --explain\n```\n````\n'
  const prompt = buildExplanationPrompt(source)
  const parsed = unified().use(remarkParse).parse(prompt)
  const quoted = parsed.children.filter((node) => node.type === 'code')
  assert.equal(quoted.length, 1)
  assert.equal(quoted[0].value, source)
  assert.ok(prompt.includes('阅读进度由用户手动控制'))
})
