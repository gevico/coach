import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent } from 'react'
import { ArrowDownToLine, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Code2, Expand, Eye, FileText, ImagePlus, Maximize2, Minus, Plus, RotateCcw, Scan, X } from 'lucide-react'
import MarkdownContent from './components/MarkdownContent'
import CameraCanvas, { BASE_ZOOM } from './components/CameraCanvas'
import type { CanvasCamera } from './components/CameraCanvas'
import { EXAMPLE_MARKDOWN } from './data/example'
import { compileMarkdown } from './lib/markdown'
import { downloadMarkdown, exportCanvas } from './lib/export'
import type { InitialDocument } from './lib/document'

const STORAGE_KEY = 'coach-markdown-v1'
const COLUMN_WIDTH = 470
const COLUMN_GAP = 32
const BOARD_PADDING = 56

function initialSource(): string {
  return localStorage.getItem(STORAGE_KEY) ?? EXAMPLE_MARKDOWN
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`无法读取图片：${file.name}`))
    reader.readAsDataURL(file)
  })
}

export default function App({ initialDocument }: { initialDocument?: InitialDocument }) {
  const [source, setSource] = useState(() => initialDocument?.source ?? initialSource())
  const [renderedSource, setRenderedSource] = useState(source)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(BASE_ZOOM)
  const [step, setStep] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [followContent, setFollowContent] = useState(true)
  const [zenMode, setZenMode] = useState(() => new URLSearchParams(window.location.search).get('zen') === '1'
    || sessionStorage.getItem('coach-zen-mode') === 'true')
  const [boardHeight, setBoardHeight] = useState(900)
  const [ready, setReady] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const boardRef = useRef<HTMLElement>(null)
  const cameraRef = useRef<CanvasCamera | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const fullscreenTransitionRef = useRef<Promise<void>>(Promise.resolve())
  const storageKey = initialDocument ? `${STORAGE_KEY}-${initialDocument.documentId}` : STORAGE_KEY
  const assetBase = new URL(initialDocument?.assetBase ?? '/', window.location.origin).href

  const document = useMemo(() => compileMarkdown(renderedSource), [renderedSource])
  const page = document.pages[Math.min(pageIndex, document.pages.length - 1)]
  const columns = page?.columns.length || 1
  const boardWidth = BOARD_PADDING * 2 + columns * COLUMN_WIDTH + (columns - 1) * COLUMN_GAP
  const blockCount = page?.columns.reduce((count, column) => count + column.blocks.length, 0) || 0
  const total = blockCount + (page?.columns.filter((column) => column.title).length || 0)
  const visibleCount = showAll ? total : Math.min(step, total)
  const sourceKey = `${page?.id}-${revision}`

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (source !== renderedSource) {
        setRenderedSource(source)
        setPageIndex(0)
        setStep(1)
        setRevision((value) => value + 1)
      }
      try { localStorage.setItem(storageKey, source) } catch { setMessage('浏览器存储空间不足，请下载 Markdown 保存内容。') }
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [source])

  function changeZen(enabled: boolean) {
    setZenMode(enabled)
    const transition = fullscreenTransitionRef.current.then(async () => {
      if (enabled && window.document.fullscreenEnabled && !window.document.fullscreenElement) {
        await window.document.documentElement.requestFullscreen()
      } else if (!enabled && window.document.fullscreenElement) {
        await window.document.exitFullscreen()
      }
    }).catch(() => {})
    fullscreenTransitionRef.current = transition
    return transition
  }

  function enterZen() {
    setEditorOpen(false)
    setExportOpen(false)
    return changeZen(true)
  }

  function exitZen() {
    return changeZen(false)
  }

  useEffect(() => {
    if (zenMode) sessionStorage.setItem('coach-zen-mode', 'true')
    else sessionStorage.removeItem('coach-zen-mode')
  }, [zenMode])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest('textarea, input, [contenteditable="true"]')) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'Escape' && zenMode) {
        event.preventDefault()
        void exitZen()
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (zenMode) void exitZen()
        else void enterZen()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setShowAll(false)
        setStep(Math.min(total, visibleCount + 1))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setShowAll(false)
        setStep(Math.max(0, visibleCount - 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [total, visibleCount, zenMode])

  useEffect(() => { setStep(1) }, [page?.id])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 6000)
    return () => window.clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!exportOpen) return
    function outside(event: PointerEvent) {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportOpen(false)
    }
    window.addEventListener('pointerdown', outside)
    return () => window.removeEventListener('pointerdown', outside)
  }, [exportOpen])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    let cancelled = false
    let frame = 0
    setReady(false)

    function measure() {
      setBoardHeight(board!.offsetHeight)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(board)

    async function prepare() {
      await window.document.fonts.ready
      await Promise.all(Array.from(board!.querySelectorAll('img')).map(async (image) => {
        try { await image.decode() } catch { image.dataset.failed = 'true' }
      }))
      if (cancelled) return
      measure()
      setReady(true)
    }
    void prepare()
    return () => { cancelled = true; observer.disconnect(); cancelAnimationFrame(frame) }
  }, [sourceKey, boardWidth])

  async function importMarkdown(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setSource(await file.text())
    setEditorOpen(true)
    setMessage(`已导入 ${file.name}`)
    event.target.value = ''
  }

  async function insertImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    try {
      const images = await Promise.all(files.map(async (file) => `![${file.name.replaceAll('[', '').replaceAll(']', '')}](${await readImage(file)})`))
      const position = editorRef.current?.selectionStart ?? source.length
      const addition = `\n\n${images.join('\n\n')}\n\n`
      setSource(source.slice(0, position) + addition + source.slice(position))
      setMessage(`已添加 ${files.length} 张图片`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '图片读取失败') }
    event.target.value = ''
  }

  async function saveCanvas(format: 'pdf' | 'svg') {
    setExportOpen(false)
    if (!boardRef.current) return
    setExporting(true)
    try {
      await exportCanvas(boardRef.current, format, page?.title || 'Markdown 画布')
      setMessage(`已导出 ${format.toUpperCase()}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败，请检查图片是否加载完成。') }
    finally { setExporting(false) }
  }

  let revealIndex = 0
  function revealAttributes() {
    const visible = revealIndex++ < visibleCount
    return { 'data-visible': visible, 'aria-hidden': !visible }
  }

  return (
    <div className={`app-shell ${zenMode ? 'zen-mode' : ''}`}>
      {!zenMode && <header className="app-header">
        <a className="brand" href="/" aria-label="Coach 首页"><span className="brand-symbol"><BookOpen size={19} strokeWidth={1.8} /></span><span>coach</span></a>
        <div className="header-divider" />
        <div className="document-name"><h1>{page?.title || initialDocument?.fileName || '我的画布'}</h1><span className="document-meta">{columns} 个栏目 · {blockCount} 个内容块</span></div>
        <div className="header-actions">
          <div className="reveal-controls"><button className="step-button" aria-label="上一个内容块" title="上一个内容块（←）" disabled={visibleCount === 0} onClick={() => { setShowAll(false); setStep(Math.max(0, visibleCount - 1)) }}><ChevronLeft size={17} /></button><span className="step-count">{visibleCount}<span> / {total}</span></span><button className="step-button" aria-label="下一个内容块" title="下一个内容块（→）" disabled={visibleCount >= total} onClick={() => { setShowAll(false); setStep(Math.min(total, visibleCount + 1)) }}><ChevronRight size={17} /></button><span className="controls-divider" /><button className={`text-control ${showAll ? 'is-active' : ''}`} onClick={() => setShowAll(true)}><Eye size={14} /><span>全部显示</span></button><button className="text-control" onClick={() => { setShowAll(false); setStep(1); cameraRef.current?.reset() }}><RotateCcw size={13} /><span>从头展示</span></button></div>
          <div className="zoom-control"><button aria-label="缩小画布" onClick={() => cameraRef.current?.zoomOut()}><Minus size={15} /></button><button className="zoom-value" aria-label="重置缩放" title="重置缩放到 100%" onClick={() => cameraRef.current?.reset()}>{Math.round(scale / BASE_ZOOM * 100)}%</button><button aria-label="放大画布" onClick={() => cameraRef.current?.zoomIn()}><Plus size={15} /></button><span /><button aria-label="适应窗口" title="适应窗口" onClick={() => cameraRef.current?.fit()}><Maximize2 size={15} /></button></div>
          <button className={`follow-button ${followContent ? 'is-active' : ''}`} title="标准跟踪" aria-pressed={followContent} onClick={() => setFollowContent(!followContent)}><Scan size={14} /><span>标准跟踪</span></button>
          <button className="button zen-button" title="禅模式（F），Esc 退出" onClick={() => void enterZen()}><Expand size={16} /><span>禅模式</span></button>
          <button className={`button ${editorOpen ? 'is-active' : ''}`} onClick={() => setEditorOpen(!editorOpen)} aria-expanded={editorOpen}><Code2 size={16} /><span>编辑 Markdown</span></button>
          <div className="export-control" ref={exportMenuRef}>
            <button className="button button-dark" disabled={!page || exporting} onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}><ArrowDownToLine size={16} /><span>{exporting ? '正在导出' : '导出画布'}</span><ChevronDown size={13} /></button>
            {exportOpen && <div className="export-menu">
              <button onClick={() => void saveCanvas('pdf')}><FileText size={17} /><span>PDF</span></button>
              <button onClick={() => void saveCanvas('svg')}><ImagePlus size={17} /><span>SVG</span></button>
              <button onClick={() => { downloadMarkdown(source, page?.title || '画布'); setExportOpen(false) }}><Code2 size={17} /><span>Markdown</span></button>
            </div>}
          </div>
          {document.pages.length > 1 && <div className="page-switch"><button aria-label="上一张画布" disabled={pageIndex <= 0} onClick={() => setPageIndex(pageIndex - 1)}><ChevronLeft size={15} /></button><span>{pageIndex + 1} / {document.pages.length}</span><button aria-label="下一张画布" disabled={pageIndex >= document.pages.length - 1} onClick={() => setPageIndex(pageIndex + 1)}><ChevronRight size={15} /></button></div>}
        </div>
      </header>}

      <main className={`workspace ${editorOpen ? 'with-editor' : ''}`}>
        {editorOpen && <aside className="editor-panel">
          <div className="editor-heading"><h2>内容编辑</h2><button className="icon-button" aria-label="收起编辑区" onClick={() => setEditorOpen(false)}><X size={18} /></button></div>
          <div className="editor-tools"><button onClick={() => fileRef.current?.click()}><FileText size={14} />导入 Markdown</button><button onClick={() => imageRef.current?.click()}><ImagePlus size={14} />添加图片</button></div>
          <label className="sr-only" htmlFor="markdown-editor">Markdown 内容</label>
          <textarea id="markdown-editor" ref={editorRef} value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} placeholder={'# 画布标题\n\n## 第一栏目\n\n在这里编写内容。'} />
          <div className="editor-help"><span><b>##</b> 创建栏目</span><span><b>###</b> 创建板块</span><span><b>![ ]( )</b> 插入图片</span></div>
          <details className="syntax-help"><summary>标记与图片语法 <ChevronDown size={12} /></summary><code>:circle[需要圈出的文字]</code><code>:shade[添加底部阴影]</code><code>:highlight[高亮文字]</code><code>**加粗文字**</code><code>![图片说明](https://网站/图片.svg)</code></details>
          <div className="editor-footer"><button onClick={() => { setSource(EXAMPLE_MARKDOWN); cameraRef.current?.fit() }}><RotateCcw size={13} />使用示例</button></div>
        </aside>}

        <section className="canvas-area" aria-label="画布预览">
          <div className="canvas-stage">
            {page ? <CameraCanvas width={boardWidth} height={boardHeight} ready={ready} overview={showAll} focusIndex={showAll || !followContent || visibleCount === 0 ? null : visibleCount - 1} cameraRef={cameraRef} onZoomChange={setScale}>
              <article key={sourceKey} ref={boardRef} className="canvas-board" data-ready={ready} aria-label={page.title || 'Markdown 画布'} style={{ width: boardWidth, '--column-count': columns } as CSSProperties}>
                <div className="board-columns">
                  {page.columns.map((column, columnIndex) => <section className="board-column" key={column.id} aria-label={column.title || `栏目 ${columnIndex + 1}`}>
                    {column.title && <h2 className="column-heading" data-reveal {...revealAttributes()}><span>{column.title}</span></h2>}
                    {column.blocks.map((block) => <div className={`content-block block-${block.kind}`} key={block.id} data-reveal {...revealAttributes()}>
                      <MarkdownContent source={block.markdown} baseUrl={assetBase} />
                    </div>)}
                  </section>)}
                </div>
              </article>
            </CameraCanvas> : <div className="empty-canvas"><BookOpen size={34} strokeWidth={1.2} /><h2>从一段 Markdown 开始</h2><button className="button button-dark" onClick={() => setEditorOpen(true)}><Code2 size={15} />编写内容</button></div>}
          </div>
        </section>
      </main>

      {message && <div className="toast" role="status">{message}</div>}
      <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={(event) => void importMarkdown(event)} />
      <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(event) => void insertImages(event)} />
      <span className="sr-only" aria-live="polite">{ready ? `画布已准备，包含 ${total} 个展示元素` : '正在排版画布'}</span>
    </div>
  )
}
