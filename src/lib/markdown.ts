import type { Heading, List, ListItem, Root, RootContent } from 'mdast'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { attachBoardComments, extractBoardComments, readBoardComment } from './board-comments'
import type { BoardComments } from './board-comments'

export interface BoardDocument {
  pages: CanvasPage[]
}

export interface CanvasPage extends BoardComments {
  id: string
  title: string
  columns: CanvasColumn[]
}

export interface CanvasColumn extends BoardComments {
  id: string
  title: string
  blocks: CanvasBlock[]
}

export interface CanvasBlock extends BoardComments {
  id: string
  kind: 'heading' | 'paragraph' | 'list' | 'image' | 'code' | 'table' | 'quote' | 'divider'
  markdown: string
  order: number
  start?: number
}

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkStringify, { bullet: '-', fences: true, listItemIndent: 'one' })

function serializeNode(node: RootContent): string {
  return markdownProcessor.stringify({ type: 'root', children: [node] })
}

function sourceForNode(node: RootContent, source: string): string {
  const start = node.position?.start.offset
  const end = node.position?.end.offset

  if (start !== undefined && end !== undefined) {
    return source.slice(start, end)
  }

  return serializeNode(node)
}

function nodeId(node: RootContent, suffix = ''): string {
  const position = node.position?.start
  const location = position?.offset ?? `${position?.line ?? 0}-${position?.column ?? 0}`
  return `${node.type}-${location}${suffix}`
}

function plainText(node: { value?: unknown; children?: unknown; alt?: unknown }): string {
  if (typeof node.value === 'string') {
    return node.value
  }

  if (typeof node.alt === 'string') {
    return node.alt
  }

  if (Array.isArray(node.children)) {
    return node.children.map((child) => plainText(child)).join('')
  }

  return ''
}

function headingText(node: Heading): string {
  return plainText(node)
}

function blockKind(node: RootContent): CanvasBlock['kind'] {
  switch (node.type) {
    case 'heading':
      return 'heading'
    case 'list':
      return 'list'
    case 'code':
      return 'code'
    case 'table':
      return 'table'
    case 'blockquote':
      return 'quote'
    case 'thematicBreak':
      return 'divider'
    case 'paragraph': {
      const child = node.children[0]
      if (
        node.children.length === 1 &&
        child &&
        (child.type === 'image' || child.type === 'imageReference')
      ) {
        return 'image'
      }
      return 'paragraph'
    }
    default:
      return 'paragraph'
  }
}

function singleItemList(list: List, item: ListItem, index: number): List {
  return {
    ...list,
    children: [item],
    start: list.ordered ? (list.start ?? 1) + index : null,
  }
}

export function compileMarkdown(source: string): BoardDocument {
  const root = markdownProcessor.parse(source) as Root
  const document: BoardDocument = { pages: [] }
  const definitions = root.children
    .filter((node) => node.type === 'definition')
    .map((node) => sourceForNode(node, source))
    .join('\n')

  let currentPage: CanvasPage | undefined
  let currentColumn: CanvasColumn | undefined
  let order = 0
  let notesTarget: BoardComments | undefined
  let introduction: BoardComments = {}

  function createPage(node: RootContent, title: string): CanvasPage {
    const page: CanvasPage = { id: nodeId(node, '-page'), title, columns: [] }
    attachBoardComments(page, introduction)
    introduction = {}
    return page
  }

  function ensureColumn(node: RootContent): CanvasColumn {
    if (!currentPage) {
      currentPage = createPage(node, '')
      document.pages.push(currentPage)
    }

    if (!currentColumn) {
      currentColumn = { id: nodeId(node, '-column'), title: '', blocks: [] }
      currentPage.columns.push(currentColumn)
    }

    return currentColumn
  }

  function addBlock(node: RootContent, markdown: string, start?: number, suffix = ''): void {
    const content = extractBoardComments(node)
    if (!content.node || (content.node.type === 'paragraph' && content.node.children.length === 0)) return
    const column = ensureColumn(node)
    const visibleMarkdown = content.changed ? serializeNode(content.node) : markdown
    const block: CanvasBlock = {
      id: nodeId(node, suffix),
      kind: blockKind(node),
      markdown: definitions ? `${visibleMarkdown}\n\n${definitions}` : visibleMarkdown,
      order: order++,
    }

    if (start !== undefined) {
      block.start = start
    }

    column.blocks.push(block)
    attachBoardComments(block, content)
    notesTarget = block
  }

  for (const node of root.children) {
    if (node.type === 'definition') {
      continue
    }

    if (node.type === 'html') {
      const content = readBoardComment(node.value)
      if (content.comment) {
        attachBoardComments(notesTarget || introduction, content)
        continue
      }
    }

    if (node.type === 'heading' && node.depth === 1) {
      const content = extractBoardComments(node)
      currentPage = createPage(node, headingText(content.node as Heading))
      attachBoardComments(currentPage, content)
      currentColumn = undefined
      document.pages.push(currentPage)
      notesTarget = currentPage
      continue
    }

    if (node.type === 'heading' && node.depth === 2) {
      const content = extractBoardComments(node)
      if (!currentPage) {
        currentPage = createPage(node, '')
        document.pages.push(currentPage)
      }

      currentColumn = { id: nodeId(node, '-column'), title: headingText(content.node as Heading), blocks: [] }
      attachBoardComments(currentColumn, content)
      currentPage.columns.push(currentColumn)
      notesTarget = currentColumn
      continue
    }

    if (node.type === 'list') {
      for (const [index, item] of node.children.entries()) {
        const list = singleItemList(node, item, index)
        addBlock(list, serializeNode(list), list.ordered ? list.start ?? 1 : undefined, `-item-${index}`)
      }
      continue
    }

    addBlock(node, sourceForNode(node, source))
  }

  if (definitions) {
    for (const page of document.pages) {
      if (page.preface) page.preface += `\n\n${definitions}`
      if (page.notes) page.notes += `\n\n${definitions}`
      if (page.explanation) page.explanation += `\n\n${definitions}`
      for (const column of page.columns) {
        if (column.notes) column.notes += `\n\n${definitions}`
        if (column.explanation) column.explanation += `\n\n${definitions}`
        for (const block of column.blocks) {
          if (block.notes) block.notes += `\n\n${definitions}`
          if (block.explanation) block.explanation += `\n\n${definitions}`
        }
      }
    }
  }
  return document
}
