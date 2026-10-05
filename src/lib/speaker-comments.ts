import { fromHtml } from 'hast-util-from-html'
import type { Root, RootContent } from 'mdast'
import { SKIP, visit } from 'unist-util-visit'

export function readSpeakerComment(value: string): { comment: boolean; notes?: string } {
  const fragment = fromHtml(value, { fragment: true })
  const comment = fragment.children.length > 0 && fragment.children.every((node) => node.type === 'comment' || (node.type === 'text' && !node.value.trim()))
  if (!comment) return { comment: false }
  const notes = fragment.children.flatMap((node) => {
    if (node.type !== 'comment') return []
    const content = node.value.trim()
    return content.startsWith('speaker:') ? [content.slice('speaker:'.length).trim()] : []
  }).filter(Boolean).join('\n\n')
  return { comment: true, notes: notes || undefined }
}

export function extractSpeakerNotes(node: RootContent): { node?: RootContent; notes?: string; changed: boolean } {
  const root: Root = { type: 'root', children: [structuredClone(node)] }
  const notes: string[] = []
  let changed = false
  visit(root, 'html', (html, index, parent) => {
    const content = readSpeakerComment(html.value)
    if (!content.comment || index === undefined || !parent) return
    if (content.notes) notes.push(content.notes)
    parent.children.splice(index, 1)
    changed = true
    return [SKIP, index]
  })
  return { node: root.children[0], notes: notes.join('\n\n') || undefined, changed }
}
