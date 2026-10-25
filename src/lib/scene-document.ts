import { fromHtml } from 'hast-util-from-html'
import { toHtml } from 'hast-util-to-html'
import type { Element } from 'hast'
import { visit } from 'unist-util-visit'
import type { MediaConfig } from './presentation'

// This function runs inside an opaque-origin iframe.
function sceneBridge() {
  const win = window as unknown as Window & {
    renderFrame?: (frame: number) => void | Promise<void>
    coachScene?: { render: (seconds: number) => void | Promise<void> }
    ready?: boolean
    __buildError?: string
  }
  let busy = false
  let pending: { time: number; fps: number } | null = null
  const send = (type: string, detail = '') => parent.postMessage({ type, detail }, '*')
  const fit = () => {
    const stage = document.getElementById('stage')
    const width = Number(document.documentElement.dataset.coachWidth)
    const height = Number(document.documentElement.dataset.coachHeight)
    if (stage) {
      stage.style.transformOrigin = '0 0'
      stage.style.transform = `scale(${Math.min(innerWidth / width, innerHeight / height)})`
    }
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  }
  const render = async () => {
    if (busy || !pending) return
    busy = true
    const state = pending
    pending = null
    try {
      if (win.coachScene) await win.coachScene.render(state.time)
      else if (win.renderFrame) await win.renderFrame(Math.round(state.time * state.fps))
      fit()
      send('coach:rendered')
    } catch (error) { send('coach:error', String(error)) }
    finally { busy = false; if (pending) void render() }
  }
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'coach:seek' || !Number.isFinite(event.data.time) || !Number.isFinite(event.data.fps)) return
    pending = { time: Math.max(0, event.data.time), fps: event.data.fps }
    void render()
  })
  addEventListener('resize', fit)
  const started = performance.now()
  const ready = () => {
    if (win.__buildError) return send('coach:error', win.__buildError)
    if ((win.renderFrame || win.coachScene?.render) && win.ready !== false) {
      fit(); send('coach:ready'); return
    }
    if (performance.now() - started > 30000) return send('coach:error', '场景需要提供 window.renderFrame(frame) 或 window.coachScene.render(seconds)。')
    setTimeout(ready, 100)
  }
  ready()
}

export function createSceneDocument(html: string, url: string, assetBase: string, config: MediaConfig): string {
  const tree = fromHtml(html)
  let head: Element | undefined
  let body: Element | undefined
  visit(tree, 'element', node => {
    if (node.tagName === 'html') { node.properties.dataCoachWidth = config.width; node.properties.dataCoachHeight = config.height }
    if (node.tagName === 'head') head = node
    if (node.tagName === 'body') body = node
  })
  if (!head || !body) throw new Error('场景 HTML 缺少文档结构。')
  const assetURL = new URL(assetBase)
  const allowed = `${assetURL.origin}${assetURL.pathname}`
  const policy = `default-src 'none'; script-src 'unsafe-inline' ${allowed} blob:; style-src 'unsafe-inline' ${allowed}; img-src data: blob: ${allowed}; font-src data: ${allowed}; media-src blob: ${allowed}; connect-src ${allowed}; worker-src blob: ${allowed}; base-uri ${allowed}; form-action 'none'; frame-src 'none'; object-src 'none'`
  head.children = head.children.filter(node => !(node.type === 'element' && (node.tagName === 'base' || (node.tagName === 'meta' && node.properties.httpEquiv))))
  head.children.unshift(
    { type: 'element', tagName: 'meta', properties: { httpEquiv: ['Content-Security-Policy'], content: policy }, children: [] },
    { type: 'element', tagName: 'base', properties: { href: url }, children: [] },
  )
  body.children.push({ type: 'element', tagName: 'script', properties: {}, children: [{ type: 'text', value: `(${sceneBridge.toString()})();` }] })
  return toHtml(tree)
}
