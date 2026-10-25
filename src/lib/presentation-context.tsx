import { createContext, useContext, useEffect, useState } from 'react'
import { DEFAULT_PRESENTATION, presentationSettings, resolvePresentation } from './presentation'
import type { PresentationSettings } from './presentation'

export const PresentationContext = createContext({ settings: DEFAULT_PRESENTATION, paused: false, reduced: false, recording: false })
export const BlockContext = createContext({ active: false, visible: true })
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  return reduced
}

export function usePlayback(duration: number, ready = true, { loop = false }: { loop?: boolean } = {}) {
  const block = useContext(BlockContext)
  const active = loop ? block.visible : block.active
  const { settings, paused, reduced } = useContext(PresentationContext)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(loop || settings.autoplay)
  useEffect(() => { setPlaying(loop || settings.autoplay) }, [loop, settings.autoplay])
  const running = ready && active && playing && !paused && !reduced
  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = Math.min(.1, (now - last) / 1000) * settings.speed
      last = now
      setTime(value => loop ? (value + elapsed) % duration : Math.min(duration, value + elapsed))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, duration, settings.speed, loop])
  useEffect(() => { if (!loop && time >= duration) setPlaying(false) }, [time, duration, loop])
  return {
    time, running, active, reduced,
    seek: (value: number) => { setPlaying(false); setTime(Math.max(0, Math.min(duration, value))) },
    toggle: () => { if (time >= duration) setTime(0); setPlaying(value => !value) },
    replay: () => { setTime(0); setPlaying(true) },
  }
}

export function loadPresentation(): PresentationSettings {
  try { return resolvePresentation(presentationSettings(JSON.parse(localStorage.getItem('coach-presentation-v1') || '{}'))) }
  catch { return DEFAULT_PRESENTATION }
}
