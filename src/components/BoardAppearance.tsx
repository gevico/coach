import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Palette, Pause, Play, X } from 'lucide-react'
import { MOTIONS, THEMES, resolvePresentation } from '../lib/presentation'
import type { PresentationSettings } from '../lib/presentation'
import { boardPlugins } from './plugins/registry'

interface Props { settings: PresentationSettings; paused: boolean; disabled: boolean; onChange: (value: PresentationSettings) => void; onPause: () => void }
export default function BoardAppearance({ settings, paused, disabled, onChange, onPause }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', outside)
    ref.current?.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); ref.current?.removeEventListener('keydown', escape) }
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <div ref={ref} className="appearance-control">
    <button className="ui-icon-button" aria-label="课堂外观与动效" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)}><Palette size={18} /></button>
    <button className="ui-icon-button" aria-label={paused ? '继续动效' : '暂停动效'} aria-pressed={paused} onClick={onPause}>{paused ? <Play size={18} /> : <Pause size={18} />}</button>
    {open && <section className="appearance-panel" aria-label="课堂外观与动效设置">
      <header><strong>课堂外观</strong><button aria-label="关闭外观设置" onClick={() => setOpen(false)}><X size={17} /></button></header>
      <div className="theme-options">{Object.entries(THEMES).map(([id, theme]) => <button key={id} aria-label={`选择主题：${theme.label}`} aria-pressed={settings.theme === id} onClick={() => onChange(resolvePresentation(settings, { theme: id as PresentationSettings['theme'] }))}>
        <span className={`theme-preview theme-preview-${id}`} style={{ backgroundColor: theme.background, color: theme.accent }}>Aa<span style={{ color: theme.foreground }}>讲解</span></span>
        <strong>{theme.label}</strong><small>{theme.description}</small>
      </button>)}</div>
      <p className="theme-hint">选择主题会同时设置入场效果，下面可以单独调整。</p>
      <label>入场效果<span className="appearance-select"><select value={settings.motion} onChange={event => onChange({ ...settings, motion: event.target.value as PresentationSettings['motion'] })}>{Object.entries(MOTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
      <label>播放速度<span className="appearance-select"><select value={settings.speed} onChange={event => onChange({ ...settings, speed: Number(event.target.value) })}>{[.25, .5, 1, 1.5, 2, 3].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
      <label className="appearance-checkbox"><input type="checkbox" checked={settings.autoplay} onChange={event => onChange({ ...settings, autoplay: event.target.checked })} />进入视频步骤时自动播放</label>
      <div className="plugin-catalog"><strong>内容插件</strong>{boardPlugins().map(plugin => <span key={plugin.language}>{plugin.label}<code>{plugin.language}</code></span>)}</div>
    </section>}
  </div>
}
