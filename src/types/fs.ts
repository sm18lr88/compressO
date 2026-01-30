export type FileMetadata = {
  path: string
  fileName: string
  mimeType: string
  extension: string
  size: number
}

export type ResolveVideoFilesResult = {
  files: FileMetadata[]
  invalidPaths: string[]
  skippedPaths: string[]
  ignoredCount: number
}
