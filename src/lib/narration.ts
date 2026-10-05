import type { Paragraph, Root, RootContent } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { BoardDocument } from './markdown'

export interface NarrationStep {
  number: number
  title: string
  speech: string
  cue: string
  introduction?: string
}

export interface NarrationDocument {
  introduction: string
  steps: NarrationStep[]
  issues: string[]
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkStringify)

function text(node: { type: string; value?: unknown; children?: unknown; alt?: unknown }): string {
  if (typeof node.value === 'string') return node.value
  if (typeof node.alt === 'string') return node.alt
  if (Array.isArray(node.children)) return node.children.map(text).join('')
  return ''
}

function label(node: RootContent, name: string): boolean {
  return node.type === 'paragraph' && new RegExp(`^${name}[：:]`).test(text(node))
}

function speechParagraph(node: Paragraph): Paragraph {
  const children = [...node.children]
  const first = children[0]
  if (first?.type === 'strong' && text(first) === '口播') children.shift()
  const leading = children[0]
  if (leading?.type === 'text') {
    children[0] = { ...leading, value: leading.value.replace(/^(?:口播)?[：:]\s*/, '') }
  }
  return { ...node, children }
}

export function compileNarration(source: string): NarrationDocument {
  const root = processor.parse(source) as Root
  const result: NarrationDocument = { introduction: '', steps: [], issues: [] }
  const definitions = root.children.filter((node) => node.type === 'definition')
  const serialize = (nodes: RootContent[]) => nodes.length
    ? processor.stringify({ type: 'root', children: [...nodes, ...definitions] }).trim()
    : ''
  const numbered = (node: RootContent) => node.type === 'heading' && node.depth === 2
    ? text(node).match(/^(\d+)\s*[｜|.、]\s*(.+)$/)
    : null
  const firstStep = root.children.findIndex((node) => numbered(node))
  if (firstStep < 0) {
    if (source.trim()) result.issues.push('口播稿需要使用编号标题，例如“## 01｜第一步”。')
    return result
  }
  const firstTitle = root.children.findIndex((node) => node.type === 'heading' && node.depth === 1)
  const introduction = root.children.slice(0, firstTitle > 0 && firstTitle < firstStep ? firstTitle : firstStep)
  result.introduction = serialize(introduction.filter((node) => node.type !== 'heading' && node.type !== 'definition' && node.type !== 'thematicBreak'))

  const sections: { number: number; title: string; nodes: RootContent[] }[] = []
  let section: typeof sections[number] | undefined
  for (const node of root.children) {
    if (node.type === 'heading' && node.depth <= 2) {
      section = undefined
      const match = numbered(node)
      if (match) {
        const number = Number(match[1])
        if (!Number.isSafeInteger(number) || number < 1) {
          result.issues.push('展示步骤编号需要从 1 开始。')
          continue
        }
        section = { number, title: match[2], nodes: [] }
        sections.push(section)
      }
    } else if (section && node.type !== 'definition') {
      section.nodes.push(node)
    }
  }

  const counts = new Map<number, number>()
  for (const item of sections) counts.set(item.number, (counts.get(item.number) ?? 0) + 1)
  for (const [number, count] of counts) {
    if (count > 1) result.issues.push(`第 ${number} 项的编号重复，请调整口播稿。`)
  }
  for (const item of sections) {
    if (counts.get(item.number) !== 1) continue
    const speechStart = item.nodes.findIndex((node) => label(node, '口播'))
    const hasBoard = item.nodes.some((node) => label(node, '板书'))
    const nodes = speechStart >= 0 ? item.nodes.slice(speechStart) : hasBoard ? [] : item.nodes
    let cue = ''
    const speech: RootContent[] = []
    for (const [index, node] of nodes.entries()) {
      const value = text(node).trim()
      if (node.type === 'paragraph' && /^【(?:说完|口播结束|讲完|按)/.test(value)) {
        cue = value
      } else {
        speech.push(index === 0 && speechStart >= 0 && node.type === 'paragraph' ? speechParagraph(node) : node)
      }
    }
    const markdown = serialize(speech)
    if (!markdown) result.issues.push(`第 ${item.number} 项还没有口播内容。`)
    result.steps.push({ number: item.number, title: item.title, speech: markdown, cue })
  }
  result.steps.sort((a, b) => a.number - b.number)
  return result
}

export function narrationFromBoard(document: BoardDocument): NarrationDocument {
  const result: NarrationDocument = { introduction: document.pages[0]?.notes || '', steps: [], issues: [] }
  let number = 0
  for (const page of document.pages) {
    let first = true
    for (const column of page.columns) {
      let heading = column.title
      const items = [
        ...(column.title ? [{ title: column.title, notes: column.notes }] : []),
        ...column.blocks.map((block) => {
          const title = text(processor.parse(block.markdown))
          if (block.kind === 'heading') heading = title
          return { title: block.kind === 'table' || block.kind === 'code' ? heading || title : title, notes: block.notes }
        }),
      ]
      for (const item of items) {
        result.steps.push({ number: ++number, title: item.title.trim().slice(0, 80), speech: item.notes || '', cue: '', ...(first && page.notes ? { introduction: page.notes } : {}) })
        first = false
      }
    }
  }
  return result
}
