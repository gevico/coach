import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { mediaConfig, mediaURL } from '../../lib/presentation'
import { PresentationContext, usePlayback } from '../../lib/presentation-context'
import { imageExport, registerPluginExport } from '../../lib/plugin-export'
import PlayerControls from './PlayerControls'
import type { BoardPluginProps } from './registry'

export default function VideoPlugin({ source, assetBase }: BoardPluginProps) {
  const config = useMemo(() => mediaConfig(source, false), [source])
  const ref = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(config.duration)
  const { settings } = useContext(PresentationContext)
  const player = usePlayback(duration, ready)
  const target = useRef(0)
  const running = useRef(false)
  target.current = config.start + player.time
  running.current = player.running
  useEffect(() => {
    const element = video.current
    if (!element || !ready) return
    element.playbackRate = settings.speed
    if (player.running) void element.play().catch(() => setError('视频暂时无法播放，请重播或拖动进度。'))
    else element.pause()
  }, [player.running, ready, settings.speed])
  useEffect(() => {
    const element = video.current
    if (!element) return
    const synchronize = () => {
      const desired = Math.min(element.duration, target.current)
      if (!element.seeking && Number.isFinite(desired) && Math.abs(element.currentTime - desired) > (running.current ? .3 : .02)) element.currentTime = desired
    }
    element.addEventListener('seeked', synchronize)
    return () => element.removeEventListener('seeked', synchronize)
  }, [])
  useEffect(() => {
    const element = video.current
    if (!element || !ready || element.seeking) return
    const desired = Math.min(element.duration, target.current)
    if (Math.abs(element.currentTime - desired) > (player.running ? .3 : .02)) element.currentTime = desired
  }, [player.time, config.start, ready, player.running])
  useEffect(() => ref.current ? registerPluginExport(ref.current, async () => {
    const element = video.current
    if (!element || element.readyState < 2) {
      if (config.poster) return imageExport(mediaURL(config.poster, assetBase), config.title)
      throw new Error(`视频尚未加载：${config.title}`)
    }
    const canvas = document.createElement('canvas')
    canvas.width = element.videoWidth; canvas.height = element.videoHeight
    canvas.getContext('2d')!.drawImage(element, 0, 0)
    return imageExport(canvas.toDataURL('image/png'), config.title)
  }) : undefined, [config, assetBase])
  return <div ref={ref} className="board-plugin video-plugin" data-board-plugin="video" role="group" aria-label={config.title}>
    <video ref={video} src={mediaURL(config.src, assetBase)} poster={config.poster ? mediaURL(config.poster, assetBase) : undefined} muted playsInline preload="auto" crossOrigin="anonymous" onLoadedData={event => {
      const length = event.currentTarget.duration
      if (config.start >= length) { setError('片段起点超过了视频长度。'); return }
      setDuration(Math.min(config.duration, length - config.start)); setReady(true)
    }} onError={() => setError('视频加载失败，请检查路径与媒体格式。')} />
    {error && <div role="alert" className="plugin-error">{error}</div>}
    <PlayerControls player={player} duration={duration} title={config.title} />
  </div>
}
