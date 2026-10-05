import { memo, useId, useLayoutEffect, useRef, useState } from 'react'
import type { AnimationEvent, CSSProperties } from 'react'
import type { OutlineSection } from '../lib/outline'

interface Connections {
  width: number
  height: number
  paths: string[]
}

const CourseOutline = memo(function CourseOutline({ sections }: { sections: OutlineSection[] }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const filterId = `outline-sketch-${useId().replaceAll(':', '')}`
  const [connections, setConnections] = useState<Connections>({ width: 470, height: 1, paths: [] })

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    function measure() {
      const bounds = host!.getBoundingClientRect()
      if (!bounds.width || !host!.offsetWidth) return
      const scale = bounds.width / host!.offsetWidth
      const paths: string[] = []
      for (const section of host!.querySelectorAll<HTMLElement>('.outline-section')) {
        const parent = section.querySelector<HTMLElement>('.outline-parent')
        const children = [...section.querySelectorAll<HTMLElement>('.outline-child')]
        if (!parent || !children.length) continue
        const parentBounds = parent.getBoundingClientRect()
        const x = (parentBounds.left - bounds.left) / scale + 20
        const startY = (parentBounds.bottom - bounds.top) / scale
        const targets = children.map((child) => {
          const childBounds = child.getBoundingClientRect()
          return { x: (childBounds.left - bounds.left) / scale, y: (childBounds.top + childBounds.height / 2 - bounds.top) / scale }
        })
        paths.push(`M ${x} ${startY} L ${x} ${targets[targets.length - 1].y - 12}`)
        for (const target of targets) paths.push(`M ${x} ${target.y - 12} Q ${x} ${target.y} ${x + 12} ${target.y} L ${target.x} ${target.y}`)
      }
      const next = { width: host!.offsetWidth, height: host!.offsetHeight, paths }
      setConnections((previous) => previous.width === next.width && previous.height === next.height && previous.paths.join() === next.paths.join() ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    for (const node of host.querySelectorAll<HTMLElement>('.outline-parent, .outline-child')) observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [sections])

  function finishDrawing(event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName === 'outline-line-draw') event.currentTarget.dataset.drawn = 'true'
  }

  return <div className="outline-tree" ref={hostRef} onAnimationEnd={finishDrawing} style={{ '--outline-filter': `url(#${filterId})` } as CSSProperties}>
    <svg className="outline-connections" viewBox={`0 0 ${connections.width} ${connections.height}`} width={connections.width} height={connections.height} aria-hidden="true">
      <defs><filter id={filterId} x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency=".018 .05" numOctaves="2" seed="6" /><feDisplacementMap in="SourceGraphic" scale="1.2" xChannelSelector="R" yChannelSelector="G" /></filter></defs>
      <g filter={`url(#${filterId})`}>{connections.paths.map((path, index) => <path key={index} d={path} pathLength="1" />)}</g>
    </svg>
    {sections.map((section) => <section className="outline-section" key={section.id} aria-label={section.title || '二级标题'}>
      {section.title && <div className="outline-parent" aria-label={`一级标题：${section.title}`}><span>{section.title}</span></div>}
      {section.children.length > 0 && <ol className={`outline-children ${section.title ? '' : 'without-parent'}`}>
        {section.children.map((child) => <li className="outline-child" key={child.id} aria-label={`二级标题：${child.title}`}><span>{child.title}</span></li>)}
      </ol>}
    </section>)}
  </div>
})

export default CourseOutline
