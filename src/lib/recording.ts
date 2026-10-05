import { useEffect, useRef, useState } from 'react'

export interface RecordingState {
  available: boolean
  status: 'idle' | 'preparing' | 'countdown' | 'recording' | 'stopping' | 'saved' | 'error'
  token?: string
  countdownEndsAt?: number
  startedAt?: number
  fileName?: string
  filePath?: string
  directory?: string
  defaultDirectory?: string
  directoryBusy?: boolean
  error?: string
}

const busyStatuses = new Set(['preparing', 'countdown', 'recording', 'stopping'])

export function useMacRecording() {
  const [state, setState] = useState<RecordingState>({ available: false, status: 'idle' })
  const [microphone, setMicrophone] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [settingsPending, setSettingsPending] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const refresh = async () => {
      try {
        const response = await fetch('/api/recording', { cache: 'no-store' })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return
        const value = await response.json()
        if (!cancelled && typeof value.available === 'boolean' && typeof value.status === 'string') setState(value)
      } catch {
        if (!cancelled && busyStatuses.has(latest.current.status)) setState((value) => ({ ...value, error: '录制服务连接中断，请检查运行 coach 的终端。' }))
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, busyStatuses.has(latest.current.status) ? 250 : 1500)
      }
    }
    void refresh()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (state.status !== 'countdown') return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    setNow(Date.now())
    return () => window.clearInterval(timer)
  }, [state.status])

  async function action(name: 'start' | 'stop' | 'open') {
    const previous = latest.current
    if (name === 'start') setState((value) => ({ ...value, status: 'preparing', error: '' }))
    try {
      const response = await fetch(`/api/recording/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Coach-Recording-Token': previous.token || '' },
        body: JSON.stringify({ microphone }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || '系统录制请求失败。')
      setState(value)
    } catch (error) { setState((value) => ({ ...value, status: 'error', error: error instanceof Error ? error.message : '系统录制请求失败。' })) }
  }

  async function directoryAction(name: 'directory' | 'choose-directory' | 'open-directory', directory?: string) {
    setSettingsPending(true)
    setSettingsError('')
    try {
      const response = await fetch(`/api/recording/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Coach-Recording-Token': latest.current.token || '' },
        body: JSON.stringify({ directory }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || '无法设置录像保存目录。')
      setState(value)
      return value.cancelled !== true
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : '录像目录操作失败。')
      return false
    } finally { setSettingsPending(false) }
  }

  return {
    state, microphone, setMicrophone,
    settingsBusy: settingsPending || state.directoryBusy === true, settingsError,
    busy: busyStatuses.has(state.status),
    frozen: state.status === 'recording' || state.status === 'stopping',
    seconds: Math.max(0, Math.ceil(((state.countdownEndsAt || 0) - now) / 1000)),
    start: () => action('start'), stop: () => action('stop'), open: () => action('open'),
    setDirectory: (directory: string) => directoryAction('directory', directory),
    chooseDirectory: () => directoryAction('choose-directory'),
    openDirectory: () => directoryAction('open-directory'),
  }
}

export type MacRecording = ReturnType<typeof useMacRecording>
