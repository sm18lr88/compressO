import { core } from '@tauri-apps/api'

import {
  CompressionResult,
  QualityPreviewResult,
  VideoInfo,
  VideoThumbnail,
  VideoTransformsHistory,
} from '@/types/compression'
import { FileMetadata } from '@/types/fs'

export function compressVideo({
  videoPath,
  convertToExtension,
  presetName,
  videoId,
  shouldMuteVideo = false,
  quality = 101, // quality should be within 0-100, but if you supply out of bound value, backend will automatically select optimum quality
  dimensions,
  fps,
  transformsHistory,
}: {
  videoPath: string
  convertToExtension?: string
  presetName?: string | null
  videoId?: string | null
  shouldMuteVideo?: boolean
  quality?: number
  dimensions?: readonly [number, number]
  fps?: string
  transformsHistory?: VideoTransformsHistory[]
}): Promise<CompressionResult> {
  return core.invoke('compress_video', {
    videoPath,
    convertToExtension: convertToExtension ?? 'mp4',
    presetName,
    videoId,
    shouldMuteVideo,
    quality,
    fps,
    ...(dimensions
      ? { dimensions: [Math.round(dimensions[0]), Math.round(dimensions[1])] }
      : {}),
    transformsHistory,
  })
}

export function generateVideoThumbnail(
  videoPath: string,
): Promise<VideoThumbnail> {
  return core.invoke('generate_video_thumbnail', { videoPath })
}

export function getFileMetadata(filePath: string): Promise<FileMetadata> {
  return core.invoke('get_file_metadata', { filePath })
}

export function getVideoInfo(videoPath: string): Promise<VideoInfo | null> {
  return core.invoke('get_video_info', { videoPath })
}

export function generateQualityPreview({
  videoPath,
  convertToExtension,
  presetName,
  shouldMuteVideo = false,
  quality = 101,
  dimensions,
  fps,
  transformsHistory,
  previewSeconds = 20,
}: {
  videoPath: string
  convertToExtension?: string
  presetName?: string | null
  shouldMuteVideo?: boolean
  quality?: number
  dimensions?: readonly [number, number]
  fps?: string
  transformsHistory?: VideoTransformsHistory[]
  previewSeconds?: number
}): Promise<QualityPreviewResult> {
  return core.invoke('generate_quality_preview', {
    videoPath,
    convertToExtension: convertToExtension ?? 'mp4',
    presetName,
    shouldMuteVideo,
    quality,
    fps,
    previewSeconds,
    ...(dimensions
      ? { dimensions: [Math.round(dimensions[0]), Math.round(dimensions[1])] }
      : {}),
    transformsHistory,
  })
}
