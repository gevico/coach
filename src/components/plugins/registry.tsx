import { Component, lazy, Suspense } from 'react'
import type { ComponentType, ReactNode } from 'react'

export interface BoardPluginProps { source: string; assetBase: string }
export interface BoardPlugin { language: string; label: string; render: ComponentType<BoardPluginProps> }
const registry = new Map<string, BoardPlugin>()

export function registerBoardPlugin(plugin: BoardPlugin): () => void {
  if (!/^[a-z][a-z0-9-]*$/.test(plugin.language) || registry.has(plugin.language)) throw new Error(`插件名称无效或已注册：${plugin.language}`)
  registry.set(plugin.language, plugin)
  return () => { registry.delete(plugin.language) }
}
export function hasBoardPlugin(language: string) { return registry.has(language) }
export function boardPlugins() { return [...registry.values()].map(({ language, label }) => ({ language, label })) }

registerBoardPlugin({ language: 'mermaid', label: '动态图示', render: lazy(() => import('./DiagramPlugin')) })
registerBoardPlugin({ language: 'math', label: '数学公式', render: lazy(() => import('./MathPlugin')) })
registerBoardPlugin({ language: 'coach-scene', label: 'HTML / WebGL 场景', render: lazy(() => import('./ScenePlugin')) })
registerBoardPlugin({ language: 'coach-video', label: '视频片段', render: lazy(() => import('./VideoPlugin')) })

class PluginBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) } }
  render() { return this.state.error ? <div role="alert" className="plugin-error">演示配置有误：{this.state.error}</div> : this.props.children }
}

export function BoardPluginView({ language, ...props }: BoardPluginProps & { language: string }) {
  const plugin = registry.get(language)
  if (!plugin) return null
  const Render = plugin.render
  return <PluginBoundary key={`${language}:${props.source}`}><Suspense fallback={<div className="board-plugin" data-board-plugin={language} data-plugin-ready="false">正在加载演示…</div>}><Render {...props} /></Suspense></PluginBoundary>
}
