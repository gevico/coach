import { useContext, useEffect, useId, useRef, useState } from 'react'
import { gsap } from 'gsap'
import DOMPurify from 'dompurify'
import { PresentationContext, usePlayback } from '../../lib/presentation-context'
import { THEMES } from '../../lib/presentation'
import { imageExport, registerPluginExport } from '../../lib/plugin-export'
import type { BoardPluginProps } from './registry'

let queue = Promise.resolve()
export default function DiagramPlugin({ source }: BoardPluginProps) {
  const id = `diagram-${useId().replaceAll(':', '_')}`
  const ref = useRef<HTMLDivElement>(null)
  const drawing = useRef<HTMLDivElement>(null)
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const { settings } = useContext(PresentationContext)
  const [svg, setSVG] = useState('')
  const [error, setError] = useState('')
  const player = usePlayback(4, !!svg, { loop: true })
  useEffect(() => {
    let cancelled = false
    setSVG(''); setError('')
    const render = queue.then(async () => {
      const { default: mermaid } = await import('mermaid')
      const theme = THEMES[settings.theme]
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base', fontFamily: 'Noto Sans SC Variable, sans-serif',
        themeVariables: { darkMode: theme.dark, background: theme.background, primaryColor: theme.background, primaryTextColor: theme.foreground, primaryBorderColor: theme.accent, lineColor: theme.accent, secondaryColor: theme.background, tertiaryColor: theme.background, fontSize: '18px' },
        flowchart: { htmlLabels: false, useMaxWidth: true }, suppressErrorRendering: true,
      })
      const result = await mermaid.render(id, source)
      const clean = DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'] })
      if (!cancelled) setSVG(clean)
      return clean
    })
    queue = render.then(() => {}, () => {})
    render.catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : String(error)) })
    const unregister = ref.current && registerPluginExport(ref.current, async () => imageExport(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(await render)}`, 'Mermaid 图示'))
    return () => { cancelled = true; unregister?.() }
  }, [source, settings.theme, id])
  useEffect(() => {
    const root = drawing.current
    if (!root || !svg) return
    const paths = [...root.querySelectorAll<SVGPathElement>('.flowchart-link, .messageLine0, .messageLine1')]
    const context = gsap.context(() => {
      const tl = gsap.timeline({ paused: true })
      for (const [index, path] of paths.entries()) {
        const length = path.getTotalLength()
        tl.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: .8, ease: 'power2.out' }, paths.length > 1 ? index * 2.8 / paths.length : 0)
      }
      tl.fromTo(root.querySelectorAll('.node, .actor'), { opacity: .25 }, { opacity: 1, duration: 1, stagger: .08 }, 0)
      timeline.current = tl
    }, root)
    return () => { context.revert(); timeline.current = null }
  }, [svg])
  useEffect(() => { timeline.current?.progress(player.reduced ? 1 : Math.min(1, player.time / 3)) }, [player.time, player.reduced, svg])
  return <div ref={ref} className="board-plugin diagram-plugin" data-board-plugin="mermaid" data-plugin-ready={!!svg || !!error}>
    {error ? <div role="alert" className="plugin-error">图示无法显示：{error}</div> : <div ref={drawing} className="diagram-content" dangerouslySetInnerHTML={{ __html: svg }} />}
  </div>
}
