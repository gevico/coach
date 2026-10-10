import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Code2, Download, Expand, Eye, FileText, ImagePlus, Lightbulb, Maximize2, Minus, Plus, Presentation, RotateCcw, Scan, X } from 'lucide-react'
import MarkdownContent from './components/MarkdownContent'
import CameraCanvas, { BASE_ZOOM } from './components/CameraCanvas'
import type { CanvasCamera } from './components/CameraCanvas'
import { EXAMPLE_MARKDOWN } from './data/example'
import { compileMarkdown } from './lib/markdown'
import { downloadMarkdown, exportCanvas } from './lib/export'
import type { InitialDocument } from './lib/document'
import PresenterNotes from './components/PresenterNotes'
import { compileNarration, narrationFromBoard } from './lib/narration'
import { usePresenterLayout } from './lib/presenter-layout'
import { useMacRecording } from './lib/recording'
import CourseOutline from './components/CourseOutline'
import { outlineFromBoard } from './lib/outline'
import ExplanationPanel from './components/ExplanationPanel'
import { buildExplanationPrompt, explanationsFromBoard } from './lib/explanation'

const STORAGE_KEY = 'coach-markdown-v1'
const COLUMN_WIDTH = 470
const COLUMN_GAP = 32
const BOARD_PADDING = 56
type DisplayMode = 'normal' | 'presenter' | 'explain'

function initialDisplayMode(): DisplayMode {
  const params = new URLSearchParams(window.location.search)
  if (params.get('explain') === '1') return 'explain'
  if (params.get('presenter') === '1') return 'presenter'
  if (params.get('zen') === '1') return 'normal'
  try {
    const saved = sessionStorage.getItem('coach-display-mode')
    if (saved === 'normal' || saved === 'presenter' || saved === 'explain') return saved
    if (sessionStorage.getItem('coach-presenter-mode') === 'true') return 'presenter'
  } catch { return 'normal' }
  return 'normal'
}

function initialSource(): string {
  return savedValue(STORAGE_KEY) ?? EXAMPLE_MARKDOWN
}

function savedValue(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
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
  const storageKey = initialDocument ? `${STORAGE_KEY}-${initialDocument.documentId}` : STORAGE_KEY
  const [source, setSource] = useState(() => initialDocument?.source ?? initialSource())
  const [sourceFileName, setSourceFileName] = useState(initialDocument?.fileName || '')
  const [renderedSource, setRenderedSource] = useState(source)
  const [editorOpen, setEditorOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(BASE_ZOOM)
  const [step, setStep] = useState(() => outlineFromBoard(compileMarkdown(source)).length ? 0 : 1)
  const [showAll, setShowAll] = useState(false)
  const [followContent, setFollowContent] = useState(true)
  const [zenMode, setZenMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('explain') === '1' || params.get('presenter') === '1') return false
    return params.get('zen') === '1' || sessionStorage.getItem('coach-zen-mode') === 'true'
  })
  const [displayMode, setDisplayMode] = useState<DisplayMode>(initialDisplayMode)
  const [readingStep, setReadingStep] = useState(() => outlineFromBoard(compileMarkdown(source)).length ? 0 : 1)
  const [notesSource, setNotesSource] = useState(() => initialDocument?.notes?.source ?? savedValue(`${storageKey}-notes`) ?? '')
  const [notesFileName, setNotesFileName] = useState(() => initialDocument?.notes?.fileName ?? savedValue(`${storageKey}-notes-name`) ?? '')
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
  const notesFileRef = useRef<HTMLInputElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const fullscreenTransitionRef = useRef<Promise<void>>(Promise.resolve())
  const readingPointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const assetBase = new URL(initialDocument?.assetBase ?? '/', window.location.origin).href

  const document = useMemo(() => compileMarkdown(renderedSource), [renderedSource])
  const outline = useMemo(() => outlineFromBoard(document), [document])
  const hasOutline = pageIndex === 0 && outline.length > 0
  const page = document.pages[Math.min(pageIndex, document.pages.length - 1)]
  const columns = page?.columns.length || 1
  const layoutColumns = columns + (hasOutline ? 1 : 0)
  const boardWidth = BOARD_PADDING * 2 + layoutColumns * COLUMN_WIDTH + (layoutColumns - 1) * COLUMN_GAP
  const blockCount = page?.columns.reduce((count, column) => count + column.blocks.length, 0) || 0
  const total = blockCount + (page?.columns.filter((column) => column.title).length || 0)
  const explanationMode = displayMode === 'explain'
  const explanationActive = explanationMode && !zenMode
  const presenterActive = displayMode === 'presenter' && !zenMode
  const visibleCount = explanationMode || showAll ? total : Math.min(step, total)
  const navigationStep = explanationMode ? Math.min(readingStep, total) : visibleCount
  const opening = hasOutline && (explanationMode ? navigationStep === 0 : !showAll && visibleCount === 0)
  const focusIndex = !followContent || (!explanationMode && showAll) ? null : opening ? 0 : navigationStep > 0 ? navigationStep - 1 + (hasOutline ? 1 : 0) : null
  const sourceKey = `${page?.id}-${revision}`
  const recording = useMacRecording()
  const presenterStyle = usePresenterLayout(workspaceRef, presenterActive, recording.frozen)
  const embeddedNarration = useMemo(() => narrationFromBoard(document), [document])
  const externalNarration = useMemo(() => compileNarration(notesSource), [notesSource])
  const embedded = !!embeddedNarration.introduction || embeddedNarration.steps.some((item) => item.speech || item.introduction)
  const narration = embedded ? embeddedNarration : externalNarration
  const pageSteps = document.pages.map((item) => item.columns.reduce((count, column) => count + column.blocks.length + (column.title ? 1 : 0), 0))
  const narrationStep = pageSteps.slice(0, pageIndex).reduce((sum, count) => sum + count, 0) + visibleCount
  const narrationTotal = pageSteps.reduce((sum, count) => sum + count, 0)
  const explanations = useMemo(() => explanationsFromBoard(document), [document])
  const pageOffset = pageSteps.slice(0, pageIndex).reduce((sum, count) => sum + count, 0)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (source !== renderedSource) {
        setRenderedSource(source)
        setPageIndex(0)
        setStep(outlineFromBoard(compileMarkdown(source)).length ? 0 : 1)
        setReadingStep(outlineFromBoard(compileMarkdown(source)).length ? 0 : 1)
        setRevision((value) => value + 1)
      }
      try { localStorage.setItem(storageKey, source) } catch { setMessage('浏览器存储空间不足，请下载 Markdown 保存内容。') }
    }, 450)
    return () => window.clearTimeout(timeout)
  }, [source])

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}-notes`, notesSource)
      localStorage.setItem(`${storageKey}-notes-name`, notesFileName)
    } catch { setMessage('浏览器存储空间不足，请保留口播稿原文件。') }
  }, [notesSource, notesFileName, storageKey])

  useEffect(() => {
    sessionStorage.setItem('coach-display-mode', displayMode)
    if (displayMode === 'presenter') sessionStorage.setItem('coach-presenter-mode', 'true')
    else sessionStorage.removeItem('coach-presenter-mode')
  }, [displayMode])

  function changeDisplayMode(mode: DisplayMode) {
    if (explanationMode && mode !== 'explain') {
      setStep(readingStep)
      setShowAll(false)
    }
    setDisplayMode(mode)
  }

  function togglePresenter() {
    if (recording.busy) return
    setEditorOpen(false)
    setExportOpen(false)
    changeDisplayMode(presenterActive ? 'normal' : 'presenter')
    if (zenMode) void changeZen(false)
  }

  function toggleExplanation() {
    if (recording.busy) return
    setEditorOpen(false)
    setExportOpen(false)
    changeDisplayMode(explanationActive ? 'normal' : 'explain')
    if (!explanationMode) setReadingStep(showAll ? total : visibleCount)
    if (zenMode) void changeZen(false)
  }

  function changePage(index: number, last = false) {
    setPageIndex(index)
    setStep(last ? pageSteps[index] : index === 0 && outline.length > 0 ? 0 : 1)
    setReadingStep(last ? pageSteps[index] : index === 0 && outline.length > 0 ? 0 : 1)
    setShowAll(false)
  }

  function nextStep() {
    if (explanationMode) {
      if (readingStep >= total && pageIndex < document.pages.length - 1) changePage(pageIndex + 1)
      else setReadingStep(Math.min(total, readingStep + 1))
      return
    }
    if (presenterActive && visibleCount >= total && pageIndex < document.pages.length - 1) changePage(pageIndex + 1)
    else { setShowAll(false); setStep(Math.min(total, visibleCount + 1)) }
  }

  function previousStep() {
    if (explanationMode) {
      if (readingStep <= 1 && pageIndex > 0) changePage(pageIndex - 1, true)
      else setReadingStep(Math.max(hasOutline ? 0 : 1, readingStep - 1))
      return
    }
    if (presenterActive && visibleCount <= 1 && pageIndex > 0) changePage(pageIndex - 1, true)
    else { setShowAll(false); setStep(Math.max(0, visibleCount - 1)) }
  }

  function selectExplanation(number: number) {
    if (number === 0) {
      setPageIndex(0)
      setReadingStep(outline.length ? 0 : 1)
      return
    }
    const selected = explanations.steps.find((item) => item.number === number)
    if (selected) { setPageIndex(selected.pageIndex); setReadingStep(selected.localStep) }
  }

  async function copyExplanationPrompt() {
    try {
      await navigator.clipboard.writeText(buildExplanationPrompt(source))
      setMessage('已复制板书和解析生成要求，可以粘贴到 ChatGPT。')
    } catch { setMessage('无法复制提示词，请检查浏览器的剪贴板权限。') }
  }

  function beginReadingPointer(event: ReactPointerEvent<HTMLElement>) {
    if (!explanationActive || event.button !== 0 || !event.isPrimary) return
    readingPointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }

  function moveReadingPointer(event: ReactPointerEvent<HTMLElement>) {
    const start = readingPointerRef.current
    if (start && (start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)) start.moved = true
  }

  function finishReadingPointer(event: ReactPointerEvent<HTMLElement>) {
    const start = readingPointerRef.current
    readingPointerRef.current = null
    if (!explanationActive || !start || start.id !== event.pointerId || start.moved) return
    for (const node of boardRef.current?.querySelectorAll<HTMLElement>('[data-reading-step]') || []) {
      const bounds = node.getBoundingClientRect()
      if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) {
        setReadingStep(Number(node.dataset.readingStep))
        break
      }
    }
  }

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
    if (recording.busy) return Promise.resolve()
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
      if (event.target instanceof Element && event.target.closest('textarea, input, select, [contenteditable="true"]')) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (recording.busy && ['p', 'e', 'f', 'Escape'].includes(event.key === 'Escape' ? event.key : event.key.toLowerCase())) {
        event.preventDefault()
        return
      }
      if (event.key === 'Escape' && zenMode) {
        event.preventDefault()
        void exitZen()
      } else if (event.key === 'Escape' && (presenterActive || explanationActive)) {
        event.preventDefault()
        changeDisplayMode('normal')
      } else if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        togglePresenter()
      } else if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        toggleExplanation()
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (zenMode) void exitZen()
        else void enterZen()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        nextStep()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        previousStep()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [total, visibleCount, zenMode, presenterActive, explanationMode, explanationActive, readingStep, pageIndex, document.pages.length, recording.busy])

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
    setSourceFileName(file.name)
    setShowAll(false)
    setEditorOpen(!explanationActive)
    if (!explanationActive) setDisplayMode('normal')
    setMessage(`已导入 ${file.name}`)
    event.target.value = ''
  }

  async function importNotes(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setNotesSource(await file.text())
    setNotesFileName(file.name)
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
    const index = ++revealIndex
    const visible = index <= visibleCount
    return { 'data-visible': visible, 'aria-hidden': !visible, 'data-reading-step': index, 'data-reading-current': explanationActive && readingStep === index, role: explanationActive ? 'button' : undefined, tabIndex: explanationActive ? 0 : undefined, 'aria-pressed': explanationActive ? readingStep === index : undefined, onKeyDown: explanationActive ? (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setReadingStep(index) }
    } : undefined }
  }

  return (
    <div className={`app-shell ${zenMode ? 'zen-mode' : ''} ${presenterActive ? 'presenter-mode' : ''} ${explanationActive ? 'explanation-mode' : ''}`} data-recording-busy={recording.busy}>
      {!zenMode && <header className="app-header">
        <a className="brand" href="/" aria-label="Coach 首页"><span className="brand-symbol"><BookOpen size={19} strokeWidth={2} /></span><span>coach</span></a>
        <div className="header-divider" />
        <div className="document-name"><h1>{page?.title || sourceFileName || '我的画布'}</h1><span className="document-meta">{columns} 个栏目 · {blockCount} 个内容块</span></div>
        <div className="header-actions">
          <div className="reveal-controls">
            <div className="step-navigation"><button className="step-button" aria-label="上一个内容块" aria-description="上一个内容块（←）" disabled={navigationStep === 0 || (explanationActive && navigationStep <= 1 && !hasOutline && pageIndex === 0)} onClick={previousStep}><ChevronLeft size={18} /></button><span className="step-count">{opening ? '大纲' : navigationStep}<span> / {total}</span></span><button className="step-button" aria-label="下一个内容块" aria-description="下一个内容块（→）" disabled={navigationStep >= total && (!(presenterActive || explanationActive) || pageIndex >= document.pages.length - 1)} onClick={nextStep}><ChevronRight size={18} /></button></div>
            {!explanationActive && <button className={`ui-icon-button ${showAll ? 'is-active' : ''}`} aria-label="全部显示" data-tooltip="全部显示" aria-pressed={showAll} onClick={() => setShowAll(true)}><Eye size={18} /></button>}
            <button className="ui-icon-button" aria-label={explanationActive ? outline.length ? '返回大纲' : '返回首项' : '从头展示'} data-tooltip={explanationActive ? outline.length ? '返回大纲' : '返回首项' : '从头展示'} onClick={() => { if (explanationActive) selectExplanation(0); else { setShowAll(false); setStep(hasOutline ? 0 : 1); setRevision((value) => value + 1) } cameraRef.current?.reset() }}><RotateCcw size={18} /></button>
          </div>
          <div className="zoom-control"><button aria-label="缩小画布" onClick={() => cameraRef.current?.zoomOut()}><Minus size={16} strokeWidth={2.25} /></button><button className="zoom-value" aria-label="重置缩放" aria-description="重置缩放到 100%" onClick={() => cameraRef.current?.reset()}>{Math.round(scale / BASE_ZOOM * 100)}%</button><button aria-label="放大画布" onClick={() => cameraRef.current?.zoomIn()}><Plus size={16} strokeWidth={2.25} /></button><span /><button aria-label="适应窗口" aria-description="适应窗口" onClick={() => cameraRef.current?.fit()}><Maximize2 size={16} /></button></div>
          <button className={`ui-icon-button follow-button ${followContent ? 'is-active' : ''}`} aria-label="标准跟踪" data-tooltip="标准跟踪" aria-pressed={followContent} onClick={() => setFollowContent(!followContent)}><Scan size={18} /></button>
          <button className="ui-icon-button zen-button" aria-label="禅模式" data-tooltip="禅模式 · F" disabled={recording.busy} aria-description="禅模式（F），Esc 退出" onClick={() => void enterZen()}><Expand size={18} /></button>
          <button className={`ui-icon-button presenter-button ${presenterActive ? 'is-active' : ''}`} aria-label="演讲模式" data-tooltip="演讲模式 · P" disabled={recording.busy} aria-description="演讲模式（P），Esc 退出" aria-pressed={presenterActive} onClick={togglePresenter}><Presentation size={18} /></button>
          <button className={`ui-icon-button ${explanationActive ? 'is-active' : ''}`} aria-label="解释模式" data-tooltip="解释模式 · E" disabled={recording.busy} aria-description="解释模式（E），Esc 退出" aria-pressed={explanationActive} onClick={toggleExplanation}><Lightbulb size={18} /></button>
          <button className={`ui-icon-button ${editorOpen ? 'is-active' : ''}`} aria-label="编辑 Markdown" data-tooltip="编辑 Markdown" disabled={recording.busy} onClick={() => { changeDisplayMode('normal'); setEditorOpen(!editorOpen) }} aria-expanded={editorOpen}><Code2 size={18} /></button>
          <div className="export-control" ref={exportMenuRef}>
            <button className="ui-icon-button" aria-label={exporting ? '正在导出' : '导出画布'} data-tooltip={exporting ? '正在导出' : '导出画布'} disabled={!page || exporting} onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen}><Download size={18} /></button>
            {exportOpen && <div className="export-menu">
              <button onClick={() => void saveCanvas('pdf')}><FileText size={17} /><span>PDF</span></button>
              <button onClick={() => void saveCanvas('svg')}><ImagePlus size={17} /><span>SVG</span></button>
              <button onClick={() => { downloadMarkdown(source, page?.title || '画布'); setExportOpen(false) }}><Code2 size={17} /><span>Markdown</span></button>
            </div>}
          </div>
          {document.pages.length > 1 && <div className="page-switch"><button aria-label="上一张画布" disabled={pageIndex <= 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={15} /></button><span>{pageIndex + 1} / {document.pages.length}</span><button aria-label="下一张画布" disabled={pageIndex >= document.pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={15} /></button></div>}
        </div>
      </header>}

      <main ref={workspaceRef} className={`workspace ${editorOpen ? 'with-editor' : ''} ${presenterActive ? 'presenter-workspace' : ''} ${explanationActive ? 'explanation-workspace' : ''}`} style={presenterStyle}>
        {editorOpen && <aside className="editor-panel">
          <div className="editor-heading"><h2>内容编辑</h2><button className="icon-button" aria-label="收起编辑区" onClick={() => setEditorOpen(false)}><X size={18} /></button></div>
          <div className="editor-tools"><button onClick={() => fileRef.current?.click()}><FileText size={14} />导入 Markdown</button><button onClick={() => imageRef.current?.click()}><ImagePlus size={14} />添加图片</button></div>
          <label className="sr-only" htmlFor="markdown-editor">Markdown 内容</label>
          <textarea id="markdown-editor" ref={editorRef} value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} placeholder={'# 画布标题\n\n## 第一栏目\n\n在这里编写内容。'} />
          <div className="editor-help"><span><b>##</b> 创建栏目</span><span><b>###</b> 创建板块</span><span><b>![ ]( )</b> 插入图片</span></div>
          <details className="syntax-help"><summary>标记与图片语法 <ChevronDown size={12} /></summary><code>:circle[需要圈出的文字]</code><code>:shade[添加底部阴影]</code><code>:highlight[高亮文字]</code><code>**加粗文字**</code><code>![图片说明](https://网站/图片.svg)</code></details>
          <div className="editor-footer"><button onClick={() => { setSource(EXAMPLE_MARKDOWN); cameraRef.current?.fit() }}><RotateCcw size={13} />使用示例</button></div>
        </aside>}

        <section id="coach-recording-canvas" className="canvas-area" aria-label={presenterActive ? '录制画布（16:9）' : '画布预览'} onPointerDownCapture={beginReadingPointer} onPointerMoveCapture={moveReadingPointer} onPointerUpCapture={finishReadingPointer} onPointerCancel={() => { readingPointerRef.current = null }}>
          <div className="canvas-stage">
            {page ? <CameraCanvas width={boardWidth} height={boardHeight} ready={ready} overview={showAll && !explanationMode} focusIndex={focusIndex} cameraRef={cameraRef} onZoomChange={setScale}>
              <article key={sourceKey} ref={boardRef} className="canvas-board" data-ready={ready} aria-label={page.title || 'Markdown 画布'} style={{ width: boardWidth, '--column-count': layoutColumns } as CSSProperties}>
                <div className="board-columns">
                  {hasOutline && <section className="board-column board-outline" aria-label={explanationMode ? '内容大纲' : '课程大纲'} data-reveal data-visible="true" data-reading-step="0" data-reading-current={explanationActive && readingStep === 0}>
                    <h2 className="column-heading"><span>{explanationMode ? '内容大纲' : '课程大纲'}</span></h2>
                    <CourseOutline sections={outline} />
                  </section>}
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
        {presenterActive && <PresenterNotes document={narration} fileName={embedded ? sourceFileName || '当前 Markdown' : notesFileName} step={narrationStep} total={narrationTotal} embedded={embedded} hasCurrent={visibleCount > 0} opening={opening} showIntroduction={!hasOutline || opening} onImport={() => notesFileRef.current?.click()} recording={recording} />}
        {explanationActive && <ExplanationPanel document={explanations} current={pageOffset + navigationStep} opening={opening} hasOutline={outline.length > 0} canGoBack={pageOffset + navigationStep > (outline.length ? 0 : 1)} pageTitle={page?.title || ''} introduction={page?.explanation || page?.notes || ''} baseUrl={assetBase} onSelect={selectExplanation} onNext={nextStep} onPrevious={previousStep} onCopy={() => void copyExplanationPrompt()} onImport={() => fileRef.current?.click()} />}
      </main>

      {message && <div className="toast" role="status">{message}</div>}
      <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={(event) => void importMarkdown(event)} />
      <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(event) => void insertImages(event)} />
      <input ref={notesFileRef} type="file" aria-label="口播稿文件" accept=".md,.markdown,text/markdown,text/plain" hidden onChange={(event) => void importNotes(event)} />
      <span className="sr-only" aria-live="polite">{ready ? `画布已准备，包含 ${total} 个展示元素` : '正在排版画布'}</span>
    </div>
  )
}
