import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, FileText, Minus, Plus } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NarrationDocument } from '../lib/narration'
import MacRecordingControls from './MacRecordingControls'
import type { MacRecording } from '../lib/recording'

interface PresenterNotesProps {
  document: NarrationDocument
  fileName: string
  step: number
  total: number
  embedded: boolean
  hasCurrent: boolean
  opening?: boolean
  showIntroduction?: boolean
  onImport(): void
  recording: MacRecording
}

const plugins = [remarkGfm]

export default function PresenterNotes({ document, fileName, step, total, embedded, hasCurrent, opening = false, showIntroduction = true, onImport, recording }: PresenterNotesProps) {
  const [fontSize, setFontSize] = useState(16)
  const speechRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  const current = hasCurrent ? document.steps.find((item) => item.number === step) : undefined
  const next = document.steps.find((item) => item.number === step + 1)
  const introduction = showIntroduction ? current?.introduction || (!hasCurrent ? next?.introduction : '') || (step <= 1 ? document.introduction : '') : ''
  const missing = Array.from({ length: total }, (_, index) => index + 1).filter((number) => !document.steps.some((item) => item.number === number))
  const extra = document.steps.some((item) => item.number > total)
  const issue = document.issues[0] || (!embedded && fileName && (missing.length || extra) ? `口播稿有 ${document.steps.length} 个步骤，画布有 ${total} 个步骤，请检查编号。` : '')

  useEffect(() => {
    speechRef.current?.scrollTo({ top: 0 })
    nextRef.current?.scrollTo({ top: 0 })
  }, [step, document])

  return <>
    <aside className="presenter-notes" aria-label="当前口播稿">
      <div className="presenter-notes-heading">
        <div><span className="presenter-eyebrow">当前口播</span><h2>{opening ? '课程大纲' : !hasCurrent ? '开场' : current?.title || `第 ${step} 项`}</h2></div>
        <span className="presenter-progress">{opening ? '开场' : `${step} / ${total}`}</span>
      </div>
      <div className="presenter-notes-tools">
        {!embedded && <button onClick={onImport}><FileText size={14} />导入口播稿</button>}
        <span className="presenter-file">{embedded ? '口播稿' : fileName || '导入讲稿'}</span>
        <div className="presenter-font-control">
          <button aria-label="缩小口播字体" disabled={fontSize <= 16} onClick={() => setFontSize(Math.max(16, fontSize - 2))}><Minus size={14} strokeWidth={2.25} /></button>
          <span aria-label="口播字体大小">{fontSize}</span>
          <button aria-label="放大口播字体" disabled={fontSize >= 32} onClick={() => setFontSize(Math.min(32, fontSize + 2))}><Plus size={14} strokeWidth={2.25} /></button>
        </div>
      </div>
      <MacRecordingControls recording={recording} />
      {issue && <p className="presenter-issue" role="status">{issue}</p>}
      <div className="presenter-speech presenter-copy" ref={speechRef} style={{ fontSize }}>
        {introduction && <div className="presenter-introduction"><span className="presenter-eyebrow">开场口播</span><Markdown skipHtml remarkPlugins={plugins}>{introduction}</Markdown></div>}
        {current?.speech ? <Markdown skipHtml remarkPlugins={plugins}>{current.speech}</Markdown> : opening && introduction ? null : <div className="presenter-empty">
          <p>{!hasCurrent ? '按右方向键开始展示板书。' : embedded ? '这一部分没有口播注释。' : fileName ? `第 ${step} 项暂无口播内容。` : '在板书内容后添加口播注释，展示时同步阅读。'}</p>
          {!fileName && <p><code>{'<!-- speaker: 这里写口播内容 -->'}</code></p>}
        </div>}
      </div>
      <div className="presenter-cue">{step >= total && !opening ? <Check size={14} /> : <ArrowRight size={14} />}<span>{opening ? '介绍完大纲，按 → 展示第一部分。' : current?.cue || (step < total ? '说完，按 → 展示下一部分。' : '口播结束，保持当前画面。')}</span></div>
    </aside>
    <section className="presenter-next" aria-label="下一步口播提示">
      <div className="presenter-next-heading"><div><span className="presenter-next-icon"><ArrowRight size={16} /></span><span className="presenter-eyebrow">下一步</span><h2>{next?.title || (step >= total ? '本节讲解结束' : `第 ${step + 1} 项`)}</h2></div></div>
      <div className="presenter-copy presenter-next-copy" ref={nextRef}>
        {next?.speech ? <Markdown skipHtml remarkPlugins={plugins}>{next.speech}</Markdown> : <p>{step >= total ? '保持画面即可结束录制。' : '下一部分展示后，这里的内容会成为当前口播。'}</p>}
      </div>
    </section>
  </>
}
