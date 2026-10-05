import type { BoardDocument } from './markdown'

export interface OutlineSection {
  id: string
  title: string
  children: { id: string; title: string }[]
}

export function outlineFromBoard(document: BoardDocument): OutlineSection[] {
  return document.pages.map((page) => ({
    id: page.id,
    title: page.title,
    children: page.columns.filter((column) => column.title.trim()).map((column) => ({ id: column.id, title: column.title })),
  })).filter((section) => section.title.trim() || section.children.length)
}
