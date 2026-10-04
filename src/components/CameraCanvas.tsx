import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { CaptureUpdateAction, Excalidraw, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'

export interface CanvasCamera {
  zoomIn(): void
  zoomOut(): void
  reset(): void
  fit(): void
}

interface CameraCanvasProps {
  children: ReactNode
  width: number
  height: number
  ready: boolean
  focusIndex: number | null
  overview: boolean
  cameraRef: RefObject<CanvasCamera | null>
  onZoomChange: (scale: number) => void
}

interface CameraPosition {
  zoom: number
  scrollX: number
  scrollY: number
}

interface FocusOptions {
  forceTop?: boolean
  alignHeading?: boolean
  animate?: boolean
}

export const BASE_ZOOM = 0.7
const CAMERA_DURATION = 600
const ZOOM_DURATION = 180
const CAMERA_PADDING = 40
const MIN_FIT_ZOOM = 0.1
const MIN_BUTTON_ZOOM = 0.28
const MAX_BUTTON_ZOOM = 2.1

export default function CameraCanvas({ children, width, height, ready, focusIndex, overview, cameraRef, onZoomChange }: CameraCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const animationRef = useRef(0)
  const zoomCallbackRef = useRef(onZoomChange)
  const lastZoomRef = useRef<number | null>(null)
  const initializedRef = useRef(false)
  const dimensionsRef = useRef({ width, height })
  const lastFocusRef = useRef<number | null | undefined>(undefined)
  const lastOverviewRef = useRef(false)
  const hostSizeRef = useRef({ width: 0, height: 0 })
  const zoomTargetRef = useRef<{ value: number; at: number } | null>(null)
  const viewportRef = useRef<CameraPosition>({ zoom: BASE_ZOOM, scrollX: 0, scrollY: 0 })
  zoomCallbackRef.current = onZoomChange

  const initialData = useMemo<ExcalidrawProps['initialData']>(() => ({
    elements: [],
    appState: {
      viewBackgroundColor: 'transparent',
      theme: 'light',
      scrollX: 0,
      scrollY: 0,
      zoom: { value: BASE_ZOOM as AppState['zoom']['value'] },
      activeTool: { type: 'hand', customType: null, lastActiveTool: null, locked: false },
    },
  }), [])

  const cancelAnimation = useCallback(() => {
    cancelAnimationFrame(animationRef.current)
    animationRef.current = 0
    zoomTargetRef.current = null
  }, [])

  const syncViewport = useCallback((position: CameraPosition) => {
    viewportRef.current = position
    if (sceneRef.current) {
      sceneRef.current.style.transform = `translate(${position.scrollX * position.zoom}px, ${position.scrollY * position.zoom}px) scale(${position.zoom})`
    }
    if (lastZoomRef.current !== position.zoom) {
      lastZoomRef.current = position.zoom
      zoomCallbackRef.current(position.zoom)
    }
  }, [])

  const onChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((_elements, state) => {
    syncViewport({ zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY })
  }, [syncViewport])

  const applyPosition = useCallback((position: CameraPosition) => {
    const editor = apiRef.current
    if (!editor) return
    editor.updateScene({
      appState: {
        zoom: { value: position.zoom as AppState['zoom']['value'] },
        scrollX: position.scrollX,
        scrollY: position.scrollY,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    })
    syncViewport(position)
  }, [syncViewport])

  const moveCamera = useCallback((target: CameraPosition, animate = true) => {
    cancelAnimation()
    const editor = apiRef.current
    if (!editor) return
    const state = editor.getAppState()
    const start = { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY }
    if (Math.abs(start.zoom - target.zoom) < 0.0001 && Math.abs((start.scrollX - target.scrollX) * start.zoom) < 0.5 && Math.abs((start.scrollY - target.scrollY) * start.zoom) < 0.5) return
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyPosition(target)
      return
    }
    const startedAt = performance.now()
    const advance = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / CAMERA_DURATION)
      const eased = 1 - (1 - progress) ** 3
      applyPosition({
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
        scrollX: start.scrollX + (target.scrollX - start.scrollX) * eased,
        scrollY: start.scrollY + (target.scrollY - start.scrollY) * eased,
      })
      animationRef.current = progress < 1 ? requestAnimationFrame(advance) : 0
    }
    animationRef.current = requestAnimationFrame(advance)
  }, [applyPosition, cancelAnimation])

  const fitCanvas = useCallback((animate = true) => {
    const host = hostRef.current
    if (!host || !apiRef.current || !ready || width <= 0 || height <= 0) return
    const padding = Math.min(CAMERA_PADDING, host.clientWidth / 8, host.clientHeight / 8)
    const zoom = Math.max(MIN_FIT_ZOOM, Math.min(1, (host.clientWidth - padding * 2) / width, (host.clientHeight - padding * 2) / height))
    moveCamera({
      zoom,
      scrollX: host.clientWidth / (2 * zoom) - width / 2,
      scrollY: host.clientHeight / (2 * zoom) - height / 2,
    }, animate)
  }, [height, moveCamera, ready, width])

  const zoomToCenter = useCallback((requestedZoom: number) => {
    const editor = apiRef.current
    const host = hostRef.current
    if (!editor || !host || !ready) return
    const state = editor.getAppState()
    const zoom = Math.max(MIN_BUTTON_ZOOM, Math.min(MAX_BUTTON_ZOOM, requestedZoom))
    const centerX = host.clientWidth / 2
    const centerY = host.clientHeight / 2
    const anchor = viewportCoordsToSceneCoords({
      clientX: state.offsetLeft + centerX,
      clientY: state.offsetTop + centerY,
    }, state)
    cancelAnimation()
    const startedAt = performance.now()
    zoomTargetRef.current = { value: zoom, at: startedAt }
    const startZoom = state.zoom.value
    const advance = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ZOOM_DURATION)
      const currentZoom = startZoom + (zoom - startZoom) * (1 - (1 - progress) ** 3)
      applyPosition({ zoom: currentZoom, scrollX: centerX / currentZoom - anchor.x, scrollY: centerY / currentZoom - anchor.y })
      animationRef.current = progress < 1 ? requestAnimationFrame(advance) : 0
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyPosition({ zoom, scrollX: centerX / zoom - anchor.x, scrollY: centerY / zoom - anchor.y })
    } else {
      animationRef.current = requestAnimationFrame(advance)
    }
  }, [applyPosition, cancelAnimation, ready])

  const zoomBy = useCallback((multiplier: number) => {
    const target = zoomTargetRef.current
    const currentZoom = target && performance.now() - target.at < 350
      ? target.value
      : apiRef.current?.getAppState().zoom.value ?? BASE_ZOOM
    zoomToCenter(currentZoom * multiplier)
  }, [zoomToCenter])

  const focusBlock = useCallback((index: number, { forceTop = false, alignHeading = true, animate = true }: FocusOptions = {}) => {
    const editor = apiRef.current
    const host = hostRef.current
    const scene = sceneRef.current
    const block = scene?.querySelectorAll<HTMLElement>('[data-reveal]')[index]
    if (!editor || !host || !scene || !block) return
    const position = viewportRef.current
    const zoom = position.zoom
    const sceneRect = scene.getBoundingClientRect()
    const blockRect = block.getBoundingClientRect()
    const x = (blockRect.left - sceneRect.left) / zoom
    const y = (blockRect.top - sceneRect.top) / zoom
    const blockWidth = blockRect.width / zoom
    const padding = Math.min(CAMERA_PADDING, host.clientWidth / 8, host.clientHeight / 8)
    const topMargin = Math.min(112, Math.max(48, host.clientHeight * 0.11))
    const left = (x + position.scrollX) * zoom
    const top = (y + position.scrollY) * zoom
    const right = left + blockRect.width
    const bottom = top + blockRect.height
    const horizontalVisible = left >= padding && right <= host.clientWidth - padding
    const verticalVisible = top >= topMargin && bottom <= host.clientHeight - padding
    const heading = block.matches('.column-heading, .block-heading')
    const placeAtTop = forceTop || (alignHeading && heading) || !verticalVisible
    if (horizontalVisible && !placeAtTop) return
    moveCamera({
      zoom,
      scrollX: horizontalVisible ? position.scrollX : host.clientWidth / (2 * zoom) - x - blockWidth / 2,
      scrollY: placeAtTop ? topMargin / zoom - y : position.scrollY,
    }, animate)
  }, [moveCamera])

  const receiveApi = useCallback((editor: ExcalidrawImperativeAPI) => {
    apiRef.current = editor
    setApi(editor)
  }, [])

  useImperativeHandle(cameraRef, () => ({
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
    reset: () => zoomToCenter(BASE_ZOOM),
    fit: () => fitCanvas(),
  }), [fitCanvas, zoomBy, zoomToCenter])

  useLayoutEffect(() => {
    syncViewport(viewportRef.current)
  }, [syncViewport])

  useEffect(() => {
    if (!ready) {
      initializedRef.current = false
      lastFocusRef.current = undefined
      cancelAnimation()
      return
    }
    if (!api) return
    let frame = 0
    const positionCanvas = () => {
      const host = hostRef.current
      if (!host || host.clientWidth === 0 || host.clientHeight === 0 || api.getAppState().isLoading) {
        frame = requestAnimationFrame(positionCanvas)
        return
      }
      const initial = !initializedRef.current
      const dimensionsChanged = dimensionsRef.current.width !== width || dimensionsRef.current.height !== height
      const focusChanged = lastFocusRef.current !== focusIndex
      const overviewChanged = lastOverviewRef.current !== overview
      dimensionsRef.current = { width, height }
      initializedRef.current = true
      lastFocusRef.current = focusIndex
      lastOverviewRef.current = overview
      if (overview && (initial || dimensionsChanged || overviewChanged)) {
        fitCanvas(!initial)
      } else if (!overview && (initial || dimensionsChanged || overviewChanged)) {
        cancelAnimation()
        applyPosition({ zoom: BASE_ZOOM, scrollX: 0, scrollY: 0 })
        focusBlock(focusIndex ?? 0, { forceTop: true, animate: false })
      } else if (focusChanged && focusIndex !== null) {
        focusBlock(focusIndex)
      }
    }
    frame = requestAnimationFrame(positionCanvas)
    return () => cancelAnimationFrame(frame)
  }, [api, applyPosition, cancelAnimation, fitCanvas, focusBlock, focusIndex, height, overview, ready, width])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !api) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      const nextSize = { width: host.clientWidth, height: host.clientHeight }
      const previous = hostSizeRef.current
      hostSizeRef.current = nextSize
      if (nextSize.width === previous.width && nextSize.height === previous.height) return
      if (!ready || !initializedRef.current || api.getAppState().isLoading) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (overview) fitCanvas()
        else if (focusIndex !== null) focusBlock(focusIndex, { alignHeading: false })
      })
    })
    observer.observe(host)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [api, fitCanvas, focusBlock, focusIndex, overview, ready])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const wheel = (event: WheelEvent) => {
      cancelAnimation()
      if (event.ctrlKey || event.metaKey) event.preventDefault()
    }
    host.addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => host.removeEventListener('wheel', wheel, { capture: true })
  }, [cancelAnimation])

  useEffect(() => () => cancelAnimation(), [cancelAnimation])

  return (
    <div ref={hostRef} className="camera-canvas" onPointerDownCapture={cancelAnimation} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Excalidraw
        excalidrawAPI={receiveApi}
        initialData={initialData}
        onChange={onChange}
        onPointerDown={cancelAnimation}
        viewModeEnabled
        zenModeEnabled
        gridModeEnabled={false}
        theme="light"
        UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false }, tools: { image: false } }}
      />
      <div className="camera-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div ref={sceneRef} className="camera-scene" style={{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: 'top left' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
