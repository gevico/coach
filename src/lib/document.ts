export interface InitialDocument {
  source: string
  assetBase: string
  fileName: string
  documentId: string
  notes?: { source: string; fileName: string }
}

export async function loadInitialDocument(): Promise<InitialDocument | undefined> {
  const response = await fetch('/api/document', { cache: 'no-store' })
  if (!response.headers.get('content-type')?.includes('application/json')) return
  if (!response.ok) throw new Error('无法读取指定的 Markdown 文件。')
  const document: unknown = await response.json()
  if (!document || typeof document !== 'object') throw new Error('Markdown 文件信息不完整。')
  const value = document as Partial<InitialDocument>
  if (typeof value.source !== 'string' || typeof value.assetBase !== 'string'
    || typeof value.fileName !== 'string' || typeof value.documentId !== 'string') {
    throw new Error('Markdown 文件信息不完整。')
  }
  if (value.notes !== undefined && (!value.notes || typeof value.notes !== 'object'
    || typeof value.notes.source !== 'string' || typeof value.notes.fileName !== 'string')) {
    throw new Error('口播稿文件信息不完整。')
  }
  return value as InitialDocument
}
