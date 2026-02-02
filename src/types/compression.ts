export const extensions: {
  video: { mp4: 'mp4'; mov: 'mov'; mkv: 'mkv'; webm: 'webm'; avi: 'avi' }
} = {
  video: { mp4: 'mp4', mov: 'mov', mkv: 'mkv', webm: 'webm', avi: 'avi' },
}

export const compressionPresets: {
  ironclad: 'ironclad'
  thunderbolt: 'thunderbolt'
} = {
  ironclad: 'ironclad',
  thunderbolt: 'thunderbolt',
}

export type CompressionResult = {
  fileName: string
  filePath: string
}

export type QualityPreviewResult = {
  sourceFileName: string
  sourceFilePath: string
  compressedFileName: string
  compressedFilePath: string
}

export enum CustomEvents {
  VideoCompressionProgress = 'VideoCompressionProgress',
  CancelInProgressCompression = 'CancelInProgressCompression',
}

export type VideoCompressionProgress = {
  videoId: string
  fileName: string
  currentDuration: string
}

export type VideoThumbnail = {
  id: string
  fileName: string
  filePath: string
}

export type VideoInfo = {
  duration: string
  dimensions: [number, number]
  fps: number
}

export type VideoTransforms = {
  crop: { top: number; left: number; width: number; height: number }
  rotate: number
  flip: { horizontal: boolean; vertical: boolean }
}

export type VideoTransformsHistory =
  | {
      type: 'crop'
      value: { top: number; left: number; width: number; height: number }
    }
  | { type: 'rotate'; value: number }
  | { type: 'flip'; value: { horizontal: boolean; vertical: boolean } }
