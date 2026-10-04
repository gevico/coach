import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'
import type {} from 'mdast-util-directive'

export function remarkDecorations() {
  return (tree: Root) => {
    visit(tree, 'textDirective', (node) => {
      if (node.name !== 'highlight' && node.name !== 'circle' && node.name !== 'shade') return
      const data = node.data || (node.data = {})
      data.hName = node.name === 'circle' ? 'span' : 'mark'
      data.hProperties = { className: [`board-${node.name}`] }
    })
  }
}
