import { useEffect, useRef } from 'react'

interface Props {
  step: number
  ready: boolean
  overview: boolean
}

interface Line { left: number; right: number; top: number; bottom: number }

function writingLines(block: HTMLElement, scale: number): Line[] {
  const origin = block.getBoundingClientRect()
  const rectangles: DOMRect[] = []
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.textContent?.trim() && !node.parentElement?.closest('svg, .image-error')
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  })
  while (walker.nextNode()) {
    const range = document.createRange()
    range.selectNodeContents(walker.currentNode)
    rectangles.push(...range.getClientRects())
  }
  for (const image of block.querySelectorAll('img')) rectangles.push(image.getBoundingClientRect())
  const lines: Line[] = []
  for (const rect of rectangles.sort((a, b) => a.top - b.top || a.left - b.left)) {
    if (!rect.width || !rect.height) continue
    const next = { left: (rect.left - origin.left) / scale, right: (rect.right - origin.left) / scale,
      top: (rect.top - origin.top) / scale, bottom: (rect.bottom - origin.top) / scale }
    const previous = lines.at(-1)
    if (previous && next.top < previous.bottom - Math.min(4, (next.bottom - next.top) / 2)) {
      previous.left = Math.min(previous.left, next.left)
      previous.right = Math.max(previous.right, next.right)
      previous.bottom = Math.max(previous.bottom, next.bottom)
    } else lines.push(next)
  }
  return lines
}

export default function BoardWritingEffects({ step, ready, overview }: Props) {
  const toolRef = useRef<HTMLDivElement>(null)
  const seen = useRef(new WeakSet<Element>())

  useEffect(() => {
    const tool = toolRef.current
    const board = tool?.closest<HTMLElement>('.canvas-board')
    if (!tool || !board || !ready) return
    const host = board.closest<HTMLElement>('.camera-canvas') || board
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let active: HTMLElement | null = null
    const stop = () => {
      cancelAnimationFrame(frame)
      tool.hidden = true
      if (active) {
        active.style.removeProperty('clip-path')
        delete active.dataset.writing
        active.dataset.written = 'true'
        active = null
      }
    }
    const place = (x: number, y: number, kind: 'pencil' | 'pen') => {
      tool.hidden = false
      tool.dataset.tool = kind
      tool.style.transform = `translate(${x}px, ${y}px)`
    }
    const tap = (target: Element, after = () => {}) => {
      const start = performance.now()
      const animate = (now: number) => {
        const rect = target.getBoundingClientRect()
        const origin = board.getBoundingClientRect()
        const scale = origin.width / board.offsetWidth
        const progress = Math.min(1, (now - start) / 650)
        place((rect.right - origin.left) / scale + 5, (rect.bottom - origin.top) / scale - 3, 'pen')
        tool.style.opacity = String(Math.min(1, (1 - progress) * 4))
        tool.style.setProperty('--tap-scale', String(1 - Math.sin(progress * Math.PI) * .18))
        if (progress < 1) frame = requestAnimationFrame(animate)
        else { tool.hidden = true; after() }
      }
      frame = requestAnimationFrame(animate)
    }
    const block = board.querySelector<HTMLElement>(`[data-reading-step="${step}"]`)
    if (overview || media.matches) {
      for (const visible of board.querySelectorAll('[data-visible="true"]')) seen.current.add(visible)
    } else if (block && !seen.current.has(block) && block.dataset.visible === 'true') {
      seen.current.add(block)
      active = block
      const origin = board.getBoundingClientRect()
      const scale = origin.width / board.offsetWidth
      const rect = block.getBoundingClientRect()
      const offset = { x: (rect.left - origin.left) / scale, y: (rect.top - origin.top) / scale }
      const lines = writingLines(block, scale)
      const duration = Math.min(380, 5000 / Math.max(1, lines.length))
      const start = performance.now() + 100
      block.dataset.writing = 'true'
      block.style.setProperty('--writing-emphasis-delay', `${lines.length * duration + 100}ms`)
      const animate = (now: number) => {
        const elapsed = Math.max(0, now - start)
        const index = Math.floor(elapsed / duration)
        const line = lines[index]
        if (!line) {
          stop()
          const emphases = Array.from(block.querySelectorAll('.board-circle, .board-highlight'))
          const next = () => { const emphasis = emphases.shift(); if (emphasis) tap(emphasis, next) }
          next()
          return
        }
        const progress = Math.min(1, (elapsed % duration) / duration)
        const x = line.left + (line.right - line.left) * progress
        const top = index ? (lines[index - 1].bottom + line.top) / 2 : 0
        const bottom = index + 1 < lines.length ? (line.bottom + lines[index + 1].top) / 2 : block.offsetHeight + 8
        block.style.clipPath = `polygon(-8px -8px, calc(100% + 8px) -8px, calc(100% + 8px) ${top}px, ${x}px ${top}px, ${x}px ${bottom}px, -8px ${bottom}px)`
        place(offset.x + x, offset.y + line.bottom - 3, 'pencil')
        tool.style.opacity = '1'
        frame = requestAnimationFrame(animate)
      }
      animate(start)
    }
    let down: { x: number; y: number } | null = null
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const pointerUp = (event: PointerEvent) => {
      if (media.matches || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return
      const target = Array.from(board.querySelectorAll('[data-visible="true"] .board-circle, [data-visible="true"] .board-highlight, [data-visible="true"] strong')).find(element =>
        Array.from(element.getClientRects()).some(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom))
      if (target) { stop(); tap(target) }
      down = null
    }
    host.addEventListener('pointerdown', pointerDown)
    host.addEventListener('pointerup', pointerUp)
    media.addEventListener('change', stop)
    return () => {
      stop()
      host.removeEventListener('pointerdown', pointerDown)
      host.removeEventListener('pointerup', pointerUp)
      media.removeEventListener('change', stop)
    }
  }, [step, ready, overview])

  return <div ref={toolRef} className="board-writing-tool" aria-hidden="true" hidden>
    <span className="board-writing-tip"><svg width="36" height="42" viewBox="0 0 36 42" fill="none">
      <g className="writing-pencil"><path d="M1 40 4 27 23 3q2-3 5-1l4 3q3 2 0 5L13 34Z" fill="#f8d477" stroke="#9a6a25" strokeWidth="1.3" /><path d="m4 27 9 7-12 6Z" fill="#f4e9d5" /><path d="m1 40 2-6 3 3Z" fill="#44403c" /><path d="m8 29 19-24" stroke="#fff3c9" strokeWidth="2" /></g>
      <g className="writing-pen"><path d="m1 40 3-17 10-8 9 8-8 12Z" fill="#edf1f5" stroke="#475569" strokeWidth="1.4" /><path d="m1 40 11-14" stroke="#475569" /><circle cx="12" cy="26" r="2" fill="#475569" /><path d="m14 15 9-12q2-2 5 0l4 3q2 2 0 4L23 23Z" fill="#667b91" stroke="#475569" /></g>
    </svg><i /></span>
  </div>
}
