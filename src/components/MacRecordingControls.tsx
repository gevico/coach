import { useEffect, useState } from 'react'
import { Circle, FolderOpen, Mic, Settings, Square, X } from 'lucide-react'
import type { MacRecording } from '../lib/recording'

export default function MacRecordingControls({ recording }: { recording: MacRecording }) {
  const { state, busy, seconds, settingsBusy } = recording
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [directory, setDirectory] = useState(state.directory || '')
  useEffect(() => { setDirectory(state.directory || '') }, [state.directory])
  useEffect(() => { if (busy) setSettingsOpen(false) }, [busy])
  if (!state.available) return null
  const label = state.status === 'preparing' ? '正在定位画布' : state.status === 'countdown' ? seconds ? `${seconds} 秒后开始` : '即将开始' : state.status === 'recording' ? '停止录制' : state.status === 'stopping' ? '正在保存' : 'Mac 录制'
  return <div className="mac-recording-controls">
    <div className="mac-recording-actions">
      <button className={`mac-record-button ${state.status === 'recording' ? 'is-recording' : ''}`} disabled={settingsBusy || state.status === 'preparing' || state.status === 'stopping'} onClick={() => void (busy ? recording.stop() : recording.start())} aria-description={busy ? '停止当前录制' : '自动定位画布，准备 5 秒；成片自动移除准备画面和音频'}>
        {state.status === 'recording' ? <Square size={14} /> : state.status === 'countdown' ? <X size={16} /> : <Circle size={14} />}<span>{label}</span>
      </button>
      <label className={`mac-microphone ${recording.microphone ? 'is-active' : ''}`}><input className="sr-only" type="checkbox" checked={recording.microphone} disabled={busy || settingsBusy} onChange={(event) => recording.setMicrophone(event.target.checked)} /><Mic size={16} /><span>麦克风</span></label>
      <button className="mac-directory-toggle" aria-label="录像保存设置" aria-expanded={settingsOpen} disabled={busy || settingsBusy} onClick={() => { setDirectory(state.directory || ''); setSettingsOpen(!settingsOpen) }}><Settings size={18} /></button>
    </div>
    {state.directory && <div className="mac-directory-location"><span>保存至</span><span className="mac-directory-path">{state.directory}</span><button aria-label="打开录像保存文件夹" disabled={busy || settingsBusy} onClick={() => void recording.openDirectory()}><FolderOpen size={13} /></button></div>}
    {settingsOpen && <form className="mac-directory-settings" onSubmit={(event) => { event.preventDefault(); void recording.setDirectory(directory).then((saved) => { if (saved) setSettingsOpen(false) }) }}>
      <label htmlFor="mac-recording-directory">录像保存目录</label>
      <input id="mac-recording-directory" value={directory} disabled={busy || settingsBusy} required placeholder="~/Movies/Coach" onChange={(event) => setDirectory(event.target.value)} />
      <div className="mac-directory-buttons">
        <button type="button" disabled={busy || settingsBusy} onClick={() => void recording.chooseDirectory().then((saved) => { if (saved) setSettingsOpen(false) })}><FolderOpen size={12} />选择文件夹</button>
        <button type="button" disabled={busy || settingsBusy} onClick={() => setDirectory(state.defaultDirectory || '')}>默认目录</button>
        <button type="submit" disabled={busy || settingsBusy || !directory.trim()}>保存</button>
      </div>
    </form>}
    {recording.settingsError && <p className="mac-recording-error" role="status">{recording.settingsError}</p>}
    {state.error && <p className="mac-recording-error" role="status">{state.error}</p>}
    {state.status === 'saved' && state.fileName && <button className="mac-open-recording" aria-description={state.filePath} onClick={() => void recording.open()}><FolderOpen size={13} />打开录像</button>}
  </div>
}
