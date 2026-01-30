import type { BatchItem } from '@/routes/(root)/-types'
import type { FileMetadata } from '@/types/fs'
import { formatBytes } from '@/utils/fs'

function createBatchId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `batch_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function createBatchItems(files: FileMetadata[]): BatchItem[] {
  return files.map((file) => ({
    id: createBatchId(),
    path: file.path,
    fileName: file.fileName,
    extension: file.extension?.toLowerCase?.() ?? file.extension,
    sizeInBytes: file.size,
    size: formatBytes(file.size ?? 0),
    status: 'pending',
    progress: 0,
    durationMilliseconds: null,
    durationRaw: null,
    error: null,
    output: null,
  }))
}

export function mergeBatchItems(existing: BatchItem[], incoming: BatchItem[]) {
  const existingPaths = new Set(existing.map((item) => item.path))
  const merged = [...existing]

  for (const item of incoming) {
    if (!existingPaths.has(item.path)) {
      merged.push(item)
      existingPaths.add(item.path)
    }
  }

  return merged
}
