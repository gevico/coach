import { useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

export function usePresenterLayout(hostRef: RefObject<HTMLElement | null>, enabled: boolean, frozen = false): CSSProperties | undefined {
  const [width, setWidth] = useState(960)
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!enabled || !host || frozen) return
    const measure = () => {
      const notesWidth = Math.min(360, Math.max(Math.min(260, host.clientWidth * .4), host.clientWidth * .18))
      const bottomHeight = Math.min(120, Math.max(96, host.clientHeight * .09), host.clientHeight * .35)
      const next = Math.max(1, Math.floor(Math.min(1920, host.clientWidth - notesWidth, (host.clientHeight - bottomHeight) * 16 / 9)))
      setWidth((previous) => previous === next ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    measure()
    return () => observer.disconnect()
  }, [enabled, frozen, hostRef])
  if (!enabled) return
  return { '--presenter-width': `${width}px`, '--presenter-height': `${width * 9 / 16}px` } as CSSProperties
}
