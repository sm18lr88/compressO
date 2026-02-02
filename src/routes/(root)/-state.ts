import cloneDeep from 'lodash/cloneDeep'
import { proxy } from 'valtio'

import { BatchConfig, BatchState, Video, VideoConfig } from './-types'

const videoConfigInitialState: VideoConfig = {
  convertToExtension: 'mp4',
  presetName: 'ironclad',
  shouldDisableCompression: false,
  shouldMuteVideo: false,
  quality: 50,
  shouldEnableQuality: false,
}

const batchConfigInitialState: BatchConfig = {
  namingMode: 'suffix',
  prefix: '',
  suffix: '_compressed',
  outputFolderMode: 'source',
  outputFolder: null,
  includeSubfolders: true,
  shutdownTimer: {
    delaySeconds: 0,
  },
}

const batchInitialState: BatchState = {
  items: [],
  isCompressing: false,
  isCompleted: false,
  cancelRequested: false,
  currentItemId: null,
  completedCount: 0,
  failedCount: 0,
  skippedCount: 0,
  config: batchConfigInitialState,
  shutdownTimerState: {
    isPending: false,
    secondsRemaining: null,
    timerId: null,
  },
}

const videoInitialState: Video = {
  mode: 'single',
  id: null,
  isFileSelected: false,
  pathRaw: null,
  path: null,
  fileName: null,
  mimeType: null,
  sizeInBytes: null,
  size: null,
  extension: null,
  thumbnailPathRaw: null,
  thumbnailPath: null,
  isThumbnailGenerating: false,
  videoDurationMilliseconds: null,
  videDurationRaw: null,
  isCompressing: false,
  isCompressionSuccessful: false,
  compressedVideo: null,
  compressionProgress: 0,
  config: videoConfigInitialState,
  batch: batchInitialState,
}

const snapshotMoment: {
  readonly beforeCompressionStarted: 'beforeCompressionStarted'
} = {
  beforeCompressionStarted: 'beforeCompressionStarted',
}

type SnapshotMoment = keyof typeof snapshotMoment

type VideoProxy = {
  state: Video
  snapshots: Record<SnapshotMoment, Video>
  takeSnapshot: (moment: SnapshotMoment) => void
  timeTravel: (to: SnapshotMoment) => void
  resetProxy: () => void
}

const snapshotsInitialState = {
  [snapshotMoment.beforeCompressionStarted]: cloneDeep(videoInitialState),
}

export const videoProxy: VideoProxy = proxy({
  state: videoInitialState,
  snapshots: snapshotsInitialState,
  takeSnapshot(moment: SnapshotMoment) {
    if (moment in snapshotMoment) {
      videoProxy.snapshots[moment] = cloneDeep(videoProxy.state)
    }
  },
  timeTravel(to: SnapshotMoment) {
    if (to in snapshotMoment) {
      videoProxy.state = cloneDeep(videoProxy.snapshots[to])
    }
  },
  resetProxy() {
    videoProxy.state = cloneDeep(videoInitialState)
    videoProxy.snapshots = cloneDeep(snapshotsInitialState)
  },
})
