import { fromHtml } from 'hast-util-from-html'
import type { Root, RootContent } from 'mdast'
import { SKIP, visit } from 'unist-util-visit'

export interface BoardComments {
  notes?: string
  explanation?: string
  preface?: string
}

export function attachBoardComments(target: BoardComments, content: BoardComments): void {
  for (const key of ['notes', 'explanation', 'preface'] as const) {
    if (content[key]) target[key] = [target[key], content[key]].filter(Boolean).join('\n\n')
  }
}

export function readBoardComment(value: string): BoardComments & { comment: boolean } {
  const fragment = fromHtml(value, { fragment: true })
  const comment = fragment.children.length > 0 && fragment.children.every((node) => node.type === 'comment' || (node.type === 'text' && !node.value.trim()))
  if (!comment) return { comment: false }
  const result: BoardComments = {}
  for (const node of fragment.children) {
    if (node.type !== 'comment') continue
    const content = node.value.trim()
    if (content.startsWith('speaker:')) attachBoardComments(result, { notes: content.slice('speaker:'.length).trim() })
    if (content.startsWith('explain:')) attachBoardComments(result, { explanation: content.slice('explain:'.length).trim() })
    if (content.startsWith('preface:')) attachBoardComments(result, { preface: content.slice('preface:'.length).trim() })
  }
  return { ...result, comment: true }
}

export function extractBoardComments(node: RootContent): BoardComments & { node?: RootContent; changed: boolean } {
  const root: Root = { type: 'root', children: [structuredClone(node)] }
  const result: BoardComments = {}
  let changed = false
  visit(root, 'html', (html, index, parent) => {
    const content = readBoardComment(html.value)
    if (!content.comment || index === undefined || !parent) return
    attachBoardComments(result, content)
    parent.children.splice(index, 1)
    changed = true
    return [SKIP, index]
  })
  return { ...result, node: root.children[0], changed }
}
