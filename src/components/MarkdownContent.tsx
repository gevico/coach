import { memo, useCallback } from 'react'
import type { AnimationEvent, ComponentProps } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Components, UrlTransform } from 'react-markdown'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { remarkDecorations } from '../lib/directives'
import MarkdownTable from './MarkdownTable'

function BoardImage({ src, alt, ...props }: ComponentProps<'img'>) {
  return (
    <figure className="board-figure">
      <img {...props} src={src} alt={alt || '画布图片'} onError={(event) => {
        const image = event.currentTarget
        image.dataset.failed = 'true'
        const message = image.parentElement?.querySelector('.image-error')
        if (message) message.textContent = `图片加载失败：${src}`
      }} />
      <span className="image-error" role="status" />
    </figure>
  )
}

function finishCircle(event: AnimationEvent<HTMLSpanElement>) {
  if (event.animationName !== 'circle-appear' || event.currentTarget.dataset.drawn === 'true') return
  const ellipse = event.currentTarget.querySelector(':scope > .circle-decoration > ellipse')
  if (event.target === ellipse) event.currentTarget.dataset.drawn = 'true'
}

function finishHighlight(event: AnimationEvent<HTMLElement>) {
  if (event.animationName === 'highlight-appear' && event.target === event.currentTarget && event.currentTarget.dataset.drawn !== 'true') {
    event.currentTarget.dataset.drawn = 'true'
  }
}

const components: Components = {
  h3: ({ node: _node, children, ...props }) => <h3 {...props}><span className="heading-text">{children}</span></h3>,
  p: ({ node, children, ...props }) => node?.children.some((child) => child.type === 'element' && child.tagName === 'img')
    ? <div className="image-paragraph" {...props}>{children}</div>
    : <p {...props}>{children}</p>,
  img: ({ node: _node, ...props }) => <BoardImage {...props} />,
  table: ({ node: _node, ...props }) => <MarkdownTable {...props} />,
  span: ({ node: _node, className, children, ...props }) => (
    <span {...props} className={className} onAnimationEnd={className?.includes('board-circle') ? finishCircle : undefined}>
      {children}
      {className?.includes('board-circle') && (
        <svg className="circle-decoration" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="50" cy="20" rx="48" ry="17" pathLength="1" />
        </svg>
      )}
    </span>
  ),
  mark: ({ node: _node, className, ...props }) => (
    <mark {...props} className={className} onAnimationEnd={className?.includes('board-highlight') ? finishHighlight : undefined} />
  ),
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
}

const remarkPlugins = [remarkGfm, remarkDirective, remarkDecorations]

interface MarkdownContentProps {
  source: string
  baseUrl?: string
}

const MarkdownContent = memo(function MarkdownContent({ source, baseUrl }: MarkdownContentProps) {
  const urlTransform = useCallback<UrlTransform>((url, key) => {
    if (key !== 'src') return defaultUrlTransform(url)
    if (url.toLowerCase().startsWith('data:image/')) return url
    if (!baseUrl) return defaultUrlTransform(url)

    const base = new URL(baseUrl, typeof document === 'undefined' ? undefined : document.baseURI)
    if (!base.pathname.endsWith('/')) base.pathname += '/'
    base.search = ''
    base.hash = ''
    const resolved = URL.canParse(url, base) ? new URL(url, base).href : url
    return defaultUrlTransform(resolved)
  }, [baseUrl])

  return <Markdown remarkPlugins={remarkPlugins} urlTransform={urlTransform} components={components}>{source}</Markdown>
})

export default MarkdownContent
