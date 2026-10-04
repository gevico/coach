import { createRoot } from 'react-dom/client'
import '@fontsource-variable/noto-sans-sc/index.css'
import App from './App'
import { loadInitialDocument } from './lib/document'
import './styles.css'

const root = document.getElementById('root')!
loadInitialDocument().then((initialDocument) => {
  createRoot(root).render(<App initialDocument={initialDocument} />)
}).catch((error: unknown) => {
  root.textContent = error instanceof Error ? error.message : '无法读取 Markdown 文件。'
})
