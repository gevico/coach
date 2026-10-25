import { useContext, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { PresentationContext } from '../lib/presentation-context'

export default function BoardEntranceEffects({ step, ready, overview }: { step: number; ready: boolean; overview: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const seen = useRef(new WeakSet<Element>())
  const animation = useRef<gsap.core.Timeline | null>(null)
  const { settings, paused, reduced } = useContext(PresentationContext)
  useEffect(() => {
    const board = anchor.current?.closest('.canvas-board')
    const finish = () => { animation.current?.progress(1) }
    board?.addEventListener('coach:before-export', finish)
    return () => board?.removeEventListener('coach:before-export', finish)
  }, [])
  useEffect(() => {
    const board = anchor.current?.closest('.canvas-board')
    if (!board || !ready) return
    if (overview || reduced || ['write', 'none'].includes(settings.motion)) {
      board.querySelectorAll('[data-visible="true"]').forEach(node => seen.current.add(node))
      return
    }
    const block = board.querySelector<HTMLElement>(`[data-reading-step="${step}"]`)
    if (!block || seen.current.has(block) || block.querySelector('[data-board-plugin]')) return
    seen.current.add(block)
    block.dataset.entrance = 'true'
    const context = gsap.context(() => {
      const tl = gsap.timeline({ paused })
      const targets = settings.motion === 'slide' ? [...block.children] : [block]
      const from = settings.motion === 'cinematic' ? { clipPath: 'inset(0 100% 0 0)', opacity: .3 } : settings.motion === 'slide' ? { y: 18, opacity: 0 } : { opacity: 0, filter: 'blur(5px)' }
      tl.fromTo(targets, from, { opacity: 1, filter: 'blur(0px)', y: 0, clipPath: 'inset(0 0% 0 0)', duration: settings.motion === 'cinematic' ? .95 : .65, stagger: .08, ease: 'power3.out', clearProps: 'transform,filter,clipPath,opacity' })
      tl.timeScale(settings.speed)
      animation.current = tl
    }, block)
    return () => { context.revert(); delete block.dataset.entrance; animation.current = null }
  }, [step, ready, overview, reduced, settings.motion])
  useEffect(() => { animation.current?.paused(paused).timeScale(settings.speed) }, [paused, settings.speed])
  return <span ref={anchor} hidden aria-hidden="true" />
}
