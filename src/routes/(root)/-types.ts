import {
  compressionPresets,
  extensions,
  VideoTransforms,
  VideoTransformsHistory,
} from '@/types/compression'

export type ConvertToExtension = keyof typeof extensions.video | 'source'

const validConvertToExtensions: readonly string[] = [
  'source',
  ...Object.keys(extensions.video),
]

export function isConvertToExtension(
  value: string,
): value is ConvertToExtension {
  return validConvertToExtensions.includes(value)
}

export type VideoConfig = {
  convertToExtension: ConvertToExtension
  presetName: keyof typeof compressionPresets
  shouldDisableCompression: boolean
  shouldMuteVideo: boolean
  shouldEnableQuality?: boolean
  quality?: number | null
  shouldEnableCustomDimensions?: boolean
  customDimensions?: [number, number]
  shouldEnableCustomFPS?: boolean
  customFPS?: number
  shouldTransformVideo?: boolean
  transformVideoConfig?: {
    transforms: VideoTransforms
    transformsHistory: VideoTransformsHistory[]
    previewUrl?: string
  }
}

export type BatchNamingMode = 'suffix' | 'prefix' | 'replace'
export type BatchOutputFolderMode = 'source' | 'custom'

export type ShutdownTimerConfig = {
  delaySeconds: number
}

export type ShutdownTimerState = {
  isPending: boolean
  secondsRemaining: number | null
  timerId: NodeJS.Timeout | null
}

export type BatchConfig = {
  namingMode: BatchNamingMode
  prefix: string
  suffix: string
  outputFolderMode: BatchOutputFolderMode
  outputFolder: string | null
  includeSubfolders: boolean
  shutdownTimer: ShutdownTimerConfig
}

export type BatchItemStatus =
  | 'pending'
  | 'compressing'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'cancelled'

export type BatchItem = {
  id: string
  path: string
  fileName: string
  extension: string
  sizeInBytes: number
  size: string
  status: BatchItemStatus
  progress?: number
  durationMilliseconds?: number | null
  durationRaw?: string | null
  error?: string | null
  output?: {
    pathRaw?: string | null
    path?: string | null
    fileName?: string | null
    sizeInBytes?: number | null
    size?: string | null
    extension?: string | null
    savedPath?: string | null
  } | null
}

export type BatchState = {
  items: BatchItem[]
  isCompressing: boolean
  isCompleted: boolean
  cancelRequested: boolean
  currentItemId: string | null
  completedCount: number
  failedCount: number
  skippedCount: number
  config: BatchConfig
  shutdownTimerState: ShutdownTimerState
}

export type Video = {
  mode: 'single' | 'batch'
  id?: string | null
  isFileSelected: boolean
  pathRaw?: string | null
  path?: string | null
  fileName?: string | null
  mimeType?: string | null
  sizeInBytes?: number | null
  size?: string | null
  extension?: null | string
  thumbnailPathRaw?: string | null
  thumbnailPath?: string | null
  isThumbnailGenerating?: boolean
  videoDurationMilliseconds?: number | null
  videDurationRaw?: string | null
  isCompressing?: boolean
  isCompressionSuccessful?: boolean
  compressedVideo?: {
    pathRaw?: string | null
    path?: string | null
    fileName?: string | null
    fileNameToDisplay?: string | null
    mimeType?: string | null
    sizeInBytes?: number | null
    size?: string | null
    extension?: null | string
    isSaved?: boolean
    isSaving?: boolean
    savedPath?: string
  } | null
  compressionProgress?: number
  config: VideoConfig
  dimensions?: { width: number; height: number }
  fps?: number
  batch: BatchState
}
