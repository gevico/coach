import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Minus, Plus } from 'lucide-react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ExplanationDocument } from '../lib/explanation'

interface ExplanationPanelProps {
  document: ExplanationDocument
  current: number
  opening: boolean
  hasOutline: boolean
  canGoBack: boolean
  pageTitle: string
  introduction: string
  baseUrl: string
  onSelect(number: number): void
  onNext(): void
  onPrevious(): void
  onCopy(): void
  onImport(): void
}

const plugins = [remarkGfm]
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
}

export default function ExplanationPanel({ document, current, opening, hasOutline, canGoBack, pageTitle, introduction, baseUrl, onSelect, onNext, onPrevious, onCopy, onImport }: ExplanationPanelProps) {
  const [fontSize, setFontSize] = useState(16)
  const copyRef = useRef<HTMLDivElement>(null)
  const item = document.steps.find((step) => step.number === current)
  const body = opening ? introduction : item?.body || ''
  useEffect(() => { copyRef.current?.scrollTo({ top: 0 }) }, [current, opening, body])
  return <aside className="explanation-panel" aria-label="内容解析">
    <div className="explanation-heading">
      <div><span className="presenter-eyebrow">内容解析</span><h2>{opening ? pageTitle || '前言' : item?.title || (current ? `第 ${current} 项` : '内容解析')}</h2></div>
      <span className="presenter-progress">{opening ? '前言' : `${current} / ${document.steps.length}`}</span>
    </div>
    <div className="explanation-tools">
      <button aria-label="复制解析提示词" onClick={onCopy}><Copy size={14} /><span>复制提示词</span></button>
      <button aria-label="导入解析 Markdown" onClick={onImport}><FileText size={14} /><span>导入</span></button>
      <div className="presenter-font-control">
        <button aria-label="缩小解析字体" disabled={fontSize <= 14} onClick={() => setFontSize(Math.max(14, fontSize - 2))}><Minus size={14} /></button>
        <span aria-label="解析字体大小">{fontSize}</span>
        <button aria-label="放大解析字体" disabled={fontSize >= 32} onClick={() => setFontSize(Math.min(32, fontSize + 2))}><Plus size={14} /></button>
      </div>
    </div>
    <label className="sr-only" htmlFor="explanation-selection">选择解析内容</label>
    <select id="explanation-selection" className="explanation-selection" value={opening ? 0 : current} onChange={(event) => onSelect(Number(event.target.value))}>
      {hasOutline && <option value={0}>前言</option>}
      {document.steps.map((step) => <option key={step.number} value={step.number}>{step.number}. {step.title || `第 ${step.number} 项`}</option>)}
    </select>
    <div className="explanation-copy presenter-copy" ref={copyRef} style={{ fontSize }}>
      {body ? <Markdown skipHtml remarkPlugins={plugins} components={components} urlTransform={(url, key) => {
        if (key === 'src' && url.toLowerCase().startsWith('data:image/')) return url
        const safe = defaultUrlTransform(url)
        if (!safe) return ''
        return URL.canParse(safe, baseUrl) ? new URL(safe, baseUrl).href : ''
      }}>{body}</Markdown> : <div className="explanation-empty">
        <h3>为这部分内容添加解析</h3>
        <p>复制提示词并交给 ChatGPT，生成包含解析的 Markdown 后，在这里导入。</p>
        <pre><code>{'<!-- explain:\n这里说明推理过程、设计依据和适用条件。\n-->'}</code></pre>
      </div>}
    </div>
    <div className="explanation-navigation">
      <button aria-label="上一段解析" disabled={!canGoBack} onClick={onPrevious}><ArrowLeft size={16} /><span>上一段</span></button>
      <span>{!opening && current >= document.steps.length ? <Check size={15} /> : '← / →'}</span>
      <button aria-label="下一段解析" disabled={document.steps.length === 0 || (!opening && current >= document.steps.length)} onClick={onNext}><span>下一段</span><ArrowRight size={16} /></button>
    </div>
  </aside>
}
