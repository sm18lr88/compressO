import { core } from '@tauri-apps/api'

import { FileMetadata, ResolveVideoFilesResult } from '@/types/fs'

export function getFileMetadata(filePath: string): Promise<FileMetadata> {
  return core.invoke('get_file_metadata', { filePath })
}

export function getImageDimension(
  imagePath: string,
): Promise<[number, number]> {
  return core.invoke('get_image_dimension', { imagePath })
}

export function moveFile(from: string, to: string): Promise<void> {
  return core.invoke('move_file', { from, to })
}

export function deleteFile(path: string): Promise<void> {
  return core.invoke('delete_file', { path })
}

export function showItemInFileManager(path: string): Promise<void> {
  return core.invoke('show_item_in_file_manager', { path })
}

export function deleteCache(): Promise<void> {
  return core.invoke('delete_cache')
}

export function resolveVideoFiles(
  paths: string[],
  recursive = true,
): Promise<ResolveVideoFilesResult> {
  return core.invoke('resolve_video_files', { paths, recursive })
}
