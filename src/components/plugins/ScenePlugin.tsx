import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { BlockContext, usePlayback } from '../../lib/presentation-context'
import { mediaConfig, mediaURL } from '../../lib/presentation'
import { createSceneDocument } from '../../lib/scene-document'
import { imageExport, registerPluginExport } from '../../lib/plugin-export'
import type { BoardPluginProps } from './registry'

export default function ScenePlugin({ source, assetBase }: BoardPluginProps) {
  const config = useMemo(() => mediaConfig(source, true), [source])
  const url = useMemo(() => mediaURL(config.src, assetBase, true), [config.src, assetBase])
  const poster = mediaURL(config.poster!, assetBase)
  const ref = useRef<HTMLDivElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
  const { visible } = useContext(BlockContext)
  const [visited, setVisited] = useState(visible)
  const [html, setHTML] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const player = usePlayback(config.duration, ready && !error, { loop: true })
  useEffect(() => { if (visible) setVisited(true) }, [visible])
  useEffect(() => {
    if (!visited) return
    const controller = new AbortController()
    setReady(false); setError(''); setHTML('')
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('无法读取 HTML 场景，请通过 coach 命令打开课程。')
      const text = await response.text()
      if (!controller.signal.aborted) setHTML(createSceneDocument(text, url, assetBase, config))
    }).catch(error => { if (!controller.signal.aborted) setError(String(error)) })
    return () => controller.abort()
  }, [url, config, assetBase, visited])
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow) return
      if (event.data?.type === 'coach:ready') setReady(true)
      if (event.data?.type === 'coach:error') setError(String(event.data.detail))
    }
    addEventListener('message', receive)
    return () => removeEventListener('message', receive)
  }, [])
  useEffect(() => {
    if (ready) iframe.current?.contentWindow?.postMessage({ type: 'coach:seek', time: config.start + player.time, fps: config.fps }, '*')
  }, [ready, player.time, config.start, config.fps])
  useEffect(() => ref.current ? registerPluginExport(ref.current, async () => imageExport(poster, `${config.title} · 静态封面`)) : undefined, [poster, config.title])
  return <div ref={ref} className="board-plugin scene-plugin" data-board-plugin="scene" data-scene-ready={ready} role="group" aria-label={config.title}>
    <div className="scene-viewport" style={{ aspectRatio: `${config.width}/${config.height}` }}>
      <img src={poster} alt={`${config.title} · 静态封面`} hidden={ready && !error && !player.reduced} />
      {html && !error && <iframe ref={iframe} title={config.title} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer" aria-hidden={player.reduced} style={{ opacity: ready && !player.reduced ? 1 : 0, pointerEvents: player.reduced ? 'none' : undefined }} />}
    </div>
    {error && <div role="alert" className="plugin-error">{error}</div>}
    {!ready && !error && visited && <div className="plugin-status">正在准备场景…</div>}
  </div>
}
