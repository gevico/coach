import { parseDocument } from 'yaml'

export const THEMES = {
  paper: { label: '默认板书', description: '白纸、紫色标题、逐行书写', background: '#fcfcfc', foreground: '#262626', accent: '#6741d9', dark: false, motion: 'write' },
  editorial: { label: '现代排版', description: '青色强调、醒目标题、面板推进', background: '#f4f8f9', foreground: '#141a1f', accent: '#0b7080', dark: false, motion: 'slide' },
  particles: { label: '暗色光点', description: '深色背景、冷暖光线、幕布展开', background: '#030305', foreground: '#f4efe8', accent: '#ff6a2b', dark: true, motion: 'cinematic' },
  studio: { label: '纸色演播室', description: '暖色纸面、青色标记', background: '#f4f1e9', foreground: '#202b32', accent: '#087f8c', dark: false, motion: 'cinematic' },
  night: { label: '深色演示', description: '蓝黑底色、柔和渐显', background: '#101923', foreground: '#e4edf4', accent: '#63d8e5', dark: true, motion: 'fade' },
  chalk: { label: '墨绿黑板', description: '墨绿底色、浅色文字', background: '#17352e', foreground: '#f0f2df', accent: '#f1d78c', dark: true, motion: 'write' },
} as const
export type BoardTheme = keyof typeof THEMES
export const MOTIONS = { write: '逐行书写', fade: '柔和渐显', slide: '错位推进', cinematic: '幕布展开', none: '直接显示' } as const
export type BoardMotion = keyof typeof MOTIONS
export interface PresentationSettings { theme: BoardTheme; motion: BoardMotion; speed: number; autoplay: boolean }
export const DEFAULT_PRESENTATION: PresentationSettings = { theme: 'paper', motion: 'write', speed: 1, autoplay: true }

export function resolvePresentation(...settings: (Partial<PresentationSettings> | undefined)[]): PresentationSettings {
  const result = { ...DEFAULT_PRESENTATION }
  for (const value of settings) {
    if (!value) continue
    if (value.theme && value.motion === undefined) result.motion = THEMES[value.theme].motion
    Object.assign(result, value)
  }
  return result
}

export function parseMapping(source: string): Record<string, unknown> {
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length) throw new Error(document.errors[0].message)
  const value: unknown = document.toJS({ maxAliasCount: 30 })
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置需要使用键值形式。')
  return value as Record<string, unknown>
}

export function presentationSettings(value: unknown): Partial<PresentationSettings> {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('presentation 需要使用键值形式。')
  const config = value as Record<string, unknown>
  const result: Partial<PresentationSettings> = {}
  for (const key of Object.keys(config)) if (!['theme', 'motion', 'speed', 'autoplay'].includes(key)) throw new Error(`未知展示设置：${key}`)
  if (config.theme !== undefined) {
    if (typeof config.theme !== 'string' || !Object.hasOwn(THEMES, config.theme)) throw new Error(`theme 可选 ${Object.keys(THEMES).join('、')}。`)
    result.theme = config.theme as BoardTheme
  }
  if (config.motion !== undefined) {
    if (typeof config.motion !== 'string' || !Object.hasOwn(MOTIONS, config.motion)) throw new Error('motion 可选 write、fade、slide、cinematic、none。')
    result.motion = config.motion as BoardMotion
  }
  if (config.speed !== undefined) result.speed = numberInRange(config.speed, 'speed', .25, 3)
  if (config.autoplay !== undefined) {
    if (typeof config.autoplay !== 'boolean') throw new Error('autoplay 需要填写 true 或 false。')
    result.autoplay = config.autoplay
  }
  return result
}

function numberInRange(value: unknown, key: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} 需要在 ${min} 到 ${max} 之间。`)
  return value
}

export interface MediaConfig { src: string; title: string; width: number; height: number; duration: number; start: number; fps: number; poster?: string }
export function mediaConfig(source: string, scene: boolean): MediaConfig {
  const config = parseMapping(source)
  for (const key of Object.keys(config)) if (!['src', 'title', 'width', 'height', 'duration', 'start', 'fps', 'poster'].includes(key)) throw new Error(`未知媒体设置：${key}`)
  if (typeof config.src !== 'string' || !config.src.trim()) throw new Error('请填写媒体 src。')
  if (typeof config.title !== 'string' || !config.title.trim()) throw new Error('请填写演示 title。')
  if (scene && (typeof config.poster !== 'string' || !config.poster.trim())) throw new Error('HTML 场景需要 poster，供加载期间和静态导出使用。')
  if (config.poster !== undefined && typeof config.poster !== 'string') throw new Error('poster 需要填写图片路径。')
  return {
    src: config.src, title: config.title,
    width: numberInRange(config.width ?? 1280, 'width', 240, 3840),
    height: numberInRange(config.height ?? 720, 'height', 120, 2160),
    duration: numberInRange(config.duration ?? 12, 'duration', .1, 3600),
    start: numberInRange(config.start ?? 0, 'start', 0, 86400),
    fps: numberInRange(config.fps ?? 60, 'fps', 1, 120),
    poster: config.poster as string | undefined,
  }
}

export function mediaURL(source: string, base: string, localOnly = false): string {
  const url = new URL(source, base)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('媒体路径只支持本地服务或 HTTP(S) 地址。')
  if (localOnly && (url.origin !== new URL(base).origin || !url.pathname.startsWith(new URL(base).pathname))) throw new Error('HTML 场景必须位于课程素材目录内。')
  return url.href
}
