import { useContext, useEffect, useState } from 'react'
import { Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react'
import type { usePlayback } from '../../lib/presentation-context'
import { PresentationContext } from '../../lib/presentation-context'

export default function PlayerControls({ player, duration, title }: { player: ReturnType<typeof usePlayback>; duration: number; title: string }) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const { recording } = useContext(PresentationContext)
  useEffect(() => {
    const change = () => setExpanded(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])
  return <div className="player-controls" data-player-controls onPointerDown={event => event.stopPropagation()}>
    <button aria-label={`播放或暂停：${title}`} disabled={!player.active || player.reduced} onClick={player.toggle}>{player.running ? <Pause size={15} /> : <Play size={15} />}</button>
    <button aria-label={`重播：${title}`} disabled={!player.active} onClick={player.replay}><RotateCcw size={15} /></button>
    <input aria-label={`进度：${title}`} type="range" min="0" max={duration} step="0.01" value={player.time} onChange={event => player.seek(Number(event.target.value))} />
    <output>{player.time.toFixed(1)} / {duration.toFixed(1)}s</output>
    <button aria-label={`${expanded ? '退出放大' : '放大演示'}：${title}`} disabled={recording || !document.fullscreenEnabled} onClick={async event => {
      const element = event.currentTarget.closest<HTMLElement>('[data-board-plugin]')
      try {
        if (document.fullscreenElement) await document.exitFullscreen()
        else await element?.requestFullscreen()
      } catch { setError('无法进入全屏，请使用画布缩放。') }
    }}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
    {error && <span role="status">{error}</span>}
  </div>
}
