import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { BoardPluginProps } from './registry'

export default function MathPlugin({ source }: BoardPluginProps) {
  const result = useMemo(() => {
    try { return { html: katex.renderToString(source, { displayMode: true, throwOnError: true, trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }) } }
    catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
  }, [source])
  return <div className="board-plugin math-plugin" data-board-plugin="math">
    {result.error ? <div className="plugin-error" role="alert">公式无法显示：{result.error}</div> : <div dangerouslySetInnerHTML={{ __html: result.html! }} />}
  </div>
}
