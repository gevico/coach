type ExportAdapter = () => Promise<HTMLElement>
const adapters = new WeakMap<HTMLElement, ExportAdapter>()

export function registerPluginExport(element: HTMLElement, adapter: ExportAdapter): () => void {
  adapters.set(element, adapter)
  return () => { adapters.delete(element) }
}

export async function replacePluginExports(source: HTMLElement, clone: HTMLElement) {
  const originals = [...source.querySelectorAll<HTMLElement>('[data-board-plugin]')]
  const copies = [...clone.querySelectorAll<HTMLElement>('[data-board-plugin]')]
  await Promise.all(originals.map(async (element, index) => {
    const adapter = adapters.get(element)
    if (adapter) copies[index].replaceWith(await adapter())
    else if (element.dataset.pluginReady === 'false') throw new Error('演示仍在加载，请等待后再导出。')
  }))
  clone.querySelectorAll('[data-player-controls]').forEach(element => element.remove())
}

export function imageExport(src: string, title: string): HTMLElement {
  const figure = document.createElement('figure')
  figure.style.margin = '0'
  const image = document.createElement('img')
  image.src = src
  image.alt = title
  image.style.cssText = 'display:block;width:100%;height:auto'
  figure.append(image)
  return figure
}
