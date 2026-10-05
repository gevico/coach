import { useId } from 'react'
import type { AnimationEvent, ComponentProps, CSSProperties } from 'react'

const filters = [
  { name: 'frame', frequency: 0.035, seed: 3, scale: 2.2 },
  { name: 'grid', frequency: 0.045, seed: 8, scale: 1.9 },
  { name: 'alternate', frequency: 0.045, seed: 21, scale: 1.9 },
]

function finishFrame(event: AnimationEvent<HTMLTableElement>) {
  if (event.animationName === 'table-frame-draw' && event.target === event.currentTarget) {
    event.currentTarget.dataset.drawn = 'true'
  }
}

export default function MarkdownTable({ children, ...props }: ComponentProps<'table'>) {
  const id = `coach-table-${useId().replaceAll(':', '')}`
  const style = {
    '--table-frame-filter': `url("#${id}-frame")`,
    '--table-grid-filter': `url("#${id}-grid")`,
    '--table-alternate-filter': `url("#${id}-alternate")`,
  } as CSSProperties

  return (
    <div className="board-table" style={style}>
      <svg className="table-filters" aria-hidden="true" focusable="false" width="0" height="0">
        <defs>
          {filters.map((filter) => (
            <filter key={filter.name} id={`${id}-${filter.name}`} x="-15%" y="-15%" width="130%" height="130%">
              <feTurbulence type="fractalNoise" baseFrequency={filter.frequency} numOctaves="2" seed={filter.seed} result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={filter.scale} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          ))}
        </defs>
      </svg>
      <table {...props} onAnimationEnd={finishFrame}>{children}</table>
    </div>
  )
}
