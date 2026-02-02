import { SelectItem } from '@heroui/select'
import { core, event } from '@tauri-apps/api'
import { emitTo } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import React from 'react'
import { snapshot, useSnapshot } from 'valtio'

import Button from '@/components/Button'
import Divider from '@/components/Divider'
import Icon from '@/components/Icon'
import Layout from '@/components/Layout'
import Select from '@/components/Select'
import Spinner from '@/components/Spinner'
import Switch from '@/components/Switch'
import { toast } from '@/components/Toast'
import { compressVideo, getVideoInfo } from '@/tauri/commands/ffmpeg'
import {
  getFileMetadata,
  moveFile,
  resolveVideoFiles,
} from '@/tauri/commands/fs'
import { scheduleSystemShutdown } from '@/tauri/commands/system'
import {
  CustomEvents,
  extensions,
  VideoCompressionProgress,
} from '@/types/compression'
import { createBatchItems, mergeBatchItems } from '@/utils/batch-utils'
import { formatBytes } from '@/utils/fs'
import { convertDurationToMilliseconds } from '@/utils/string'
import { cn } from '@/utils/tailwind'
import BatchDimensions from './BatchDimensions'
import BatchFPS from './BatchFPS'
import CompressionPreset from './CompressionPreset'
import CompressionQuality from './CompressionQuality'
import DragAndDrop from './DragAndDrop'
import QualityPreviewAction from './QualityPreviewAction'
import ShutdownCountdownModal from './ShutdownCountdownModal'
import ShutdownTimer from './ShutdownTimer'
import styles from './styles.module.css'
import { videoProxy } from '../-state'
import {
  BatchNamingMode,
  BatchOutputFolderMode,
  isConvertToExtension,
} from '../-types'

const videoExtensions = Object.keys(extensions?.video)
const extensionOptions = ['source', ...videoExtensions] as readonly string[]

const namingOptions: Record<BatchNamingMode, string> = {
  suffix: 'Add suffix',
  prefix: 'Add prefix',
  replace: 'Replace original',
}

const outputFolderOptions: Record<BatchOutputFolderMode, string> = {
  source: 'Same as source',
  custom: 'Choose folder',
}

function sanitizeNamePart(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, '').trim()
}

function getSeparator(path: string) {
  return path.includes('\\') ? '\\' : '/'
}

function joinPath(dir: string, fileName: string) {
  if (!dir) return fileName
  const separator = getSeparator(dir)
  const normalized =
    dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir
  return `${normalized}${separator}${fileName}`
}

function getDirname(path: string) {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (idx <= 0) return ''
  return path.slice(0, idx)
}

function getFileStem(fileName: string, extension: string) {
  if (!extension) {
    const dotIndex = fileName.lastIndexOf('.')
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  }
  const suffix = `.${extension}`
  if (fileName.toLowerCase().endsWith(suffix.toLowerCase())) {
    return fileName.slice(0, -suffix.length)
  }
  return fileName
}

function appendIndexToPath(path: string, index: number) {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dir = separatorIndex >= 0 ? path.slice(0, separatorIndex) : ''
  const fileName = separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path
  const dotIndex = fileName.lastIndexOf('.')
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  const ext = dotIndex > 0 ? fileName.slice(dotIndex + 1) : ''
  const newName = ext ? `${stem}_${index}.${ext}` : `${stem}_${index}`
  return dir ? joinPath(dir, newName) : newName
}

function BatchConfig() {
  const {
    state: { batch, config, isCompressing: isSingleCompressing },
  } = useSnapshot(videoProxy)

  const [confirmCancel, setConfirmCancel] = React.useState(false)
  const [isCancelling, setIsCancelling] = React.useState(false)
  const [isResolving, setIsResolving] = React.useState(false)
  const [showCountdownModal, setShowCountdownModal] = React.useState(false)

  const totalSize = React.useMemo(() => {
    return batch.items.reduce((sum, item) => sum + (item.sizeInBytes ?? 0), 0)
  }, [batch.items])

  React.useEffect(() => {
    if (batch.config.namingMode === 'replace') {
      if (config.convertToExtension !== 'source') {
        videoProxy.state.config.convertToExtension = 'source'
      }
      if (batch.config.outputFolderMode !== 'source') {
        videoProxy.state.batch.config.outputFolderMode = 'source'
      }
    }
  }, [
    batch.config.namingMode,
    config.convertToExtension,
    batch.config.outputFolderMode,
  ])

  React.useEffect(() => {
    if (!batch.isCompressing) {
      return
    }

    let unlisten: event.UnlistenFn | undefined

    const setupListener = async () => {
      if (unlisten) {
        unlisten()
      }
      unlisten = await event.listen<VideoCompressionProgress>(
        CustomEvents.VideoCompressionProgress,
        (evt) => {
          const payload = evt?.payload
          if (!payload?.videoId) return
          if (!payload?.currentDuration) return
          const items = videoProxy.state.batch.items
          const index = items.findIndex((item) => item.id === payload.videoId)
          if (index === -1) return
          const current = items[index]
          const durationMs = current.durationMilliseconds ?? 0
          if (durationMs <= 0) return
          const currentDurationMs = convertDurationToMilliseconds(
            payload.currentDuration,
          )
          if (currentDurationMs <= 0) return
          const progress = Math.min(100, (currentDurationMs * 100) / durationMs)
          items[index] = { ...current, progress }
        },
      )
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [batch.isCompressing])

  const handleAddPaths = async (paths: string[]) => {
    if (!paths.length) return
    if (batch.isCompressing) {
      toast.error('Batch is running. Please wait.')
      return
    }
    setIsResolving(true)
    try {
      const result = await resolveVideoFiles(
        paths,
        batch.config.includeSubfolders,
      )
      if (result.files.length === 0) {
        toast.error('No supported video files were found.')
      }
      const incoming = createBatchItems(result.files)
      const merged = mergeBatchItems(videoProxy.state.batch.items, incoming)
      videoProxy.state.batch.items = merged

      if (result.invalidPaths.length > 0) {
        toast.error('Some paths could not be read.')
      } else if (result.skippedPaths.length > 0 || result.ignoredCount > 0) {
        toast.success('Non-video files were ignored.')
      }
    } catch {
      toast.error('Could not read dropped items.')
    }
    setIsResolving(false)
  }

  const handleAddFiles = async () => {
    try {
      const result = await open({
        directory: false,
        multiple: true,
        title: 'Select videos to compress',
        filters: [{ name: 'video', extensions: videoExtensions }],
      })
      if (Array.isArray(result)) {
        await handleAddPaths(result)
      } else if (typeof result === 'string') {
        await handleAddPaths([result])
      }
    } catch {
      toast.error('Could not select files.')
    }
  }

  const handleAddFolders = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: true,
        title: 'Select folder(s) to scan',
      })
      if (Array.isArray(result)) {
        await handleAddPaths(result)
      } else if (typeof result === 'string') {
        await handleAddPaths([result])
      }
    } catch {
      toast.error('Could not select folders.')
    }
  }

  const handleChooseOutputFolder = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: false,
        title: 'Select output folder',
      })
      if (typeof result === 'string') {
        videoProxy.state.batch.config.outputFolder = result
      }
    } catch {
      toast.error('Could not select output folder.')
    }
  }

  const handleClearList = () => {
    if (batch.isCompressing) return
    videoProxy.state.batch.items = []
    videoProxy.state.batch.completedCount = 0
    videoProxy.state.batch.failedCount = 0
    videoProxy.state.batch.skippedCount = 0
    videoProxy.state.batch.currentItemId = null
    videoProxy.state.batch.isCompleted = false
  }

  const handleRemoveItem = (id: string) => {
    if (batch.isCompressing) return
    videoProxy.state.batch.items = videoProxy.state.batch.items.filter(
      (item) => item.id !== id,
    )
  }

  const pathExists = async (path: string) => {
    try {
      await getFileMetadata(path)
      return true
    } catch {
      return false
    }
  }

  const resolveUniquePath = async (path: string) => {
    let candidate = path
    let index = 1
    while (await pathExists(candidate)) {
      candidate = appendIndexToPath(path, index)
      index += 1
      if (index > 1000) {
        throw new Error('Too many files with the same name.')
      }
    }
    return candidate
  }

  const buildOutputPath = async (item: (typeof batch.items)[number]) => {
    const namingMode = batch.config.namingMode

    if (namingMode === 'replace') {
      return item.path
    }

    const outputExt =
      config.convertToExtension === 'source'
        ? item.extension
        : (config.convertToExtension ?? item.extension)

    const stem = getFileStem(item.fileName, item.extension)
    const safePrefix = sanitizeNamePart(batch.config.prefix)
    const safeSuffix = sanitizeNamePart(batch.config.suffix)

    let baseName = stem
    if (namingMode === 'prefix') {
      baseName = `${safePrefix}${stem}`
    } else if (namingMode === 'suffix') {
      baseName = `${stem}${safeSuffix}`
    }

    if (!baseName || baseName.trim().length === 0) {
      baseName = stem
    }

    const fileName = outputExt ? `${baseName}.${outputExt}` : baseName

    const outputDir =
      batch.config.outputFolderMode === 'custom'
        ? batch.config.outputFolder
        : getDirname(item.path)

    if (!outputDir) {
      throw new Error('Output folder is not set.')
    }

    const fullPath = joinPath(outputDir, fileName)
    return resolveUniquePath(fullPath)
  }

  const handleStartBatch = async () => {
    const snapshotState = snapshot(videoProxy).state
    if (snapshotState.batch.isCompressing || snapshotState.isCompressing) return

    if (snapshotState.batch.items.length === 0) {
      toast.error('Add some videos first.')
      return
    }

    if (
      snapshotState.batch.config.outputFolderMode === 'custom' &&
      !snapshotState.batch.config.outputFolder
    ) {
      toast.error('Choose an output folder first.')
      return
    }

    videoProxy.state.batch.isCompressing = true
    videoProxy.state.isCompressing = true
    videoProxy.state.batch.cancelRequested = false
    videoProxy.state.batch.isCompleted = false
    videoProxy.state.batch.completedCount = 0
    videoProxy.state.batch.failedCount = 0
    videoProxy.state.batch.skippedCount = 0
    videoProxy.state.batch.currentItemId = null

    videoProxy.state.batch.items = videoProxy.state.batch.items.map((item) => ({
      ...item,
      status: 'pending',
      progress: 0,
      error: null,
      output: null,
    }))

    try {
      const items = [...videoProxy.state.batch.items]
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        if (videoProxy.state.batch.cancelRequested) {
          videoProxy.state.batch.items = videoProxy.state.batch.items.map(
            (entry) =>
              entry.status === 'pending'
                ? { ...entry, status: 'cancelled' }
                : entry,
          )
          break
        }

        videoProxy.state.batch.currentItemId = item.id
        videoProxy.state.batch.items[index] = { ...item, status: 'compressing' }

        try {
          const info = await getVideoInfo(item.path)
          if (info?.duration) {
            const durationMs = convertDurationToMilliseconds(info.duration)
            videoProxy.state.batch.items[index] = {
              ...videoProxy.state.batch.items[index],
              durationMilliseconds: durationMs,
              durationRaw: info.duration,
            }
          }

          const outputPath = await buildOutputPath(item)

          const convertToExtension =
            batch.config.namingMode === 'replace'
              ? item.extension
              : config.convertToExtension === 'source'
                ? item.extension
                : config.convertToExtension

          const result = await compressVideo({
            videoPath: item.path,
            convertToExtension,
            presetName: !config.shouldDisableCompression
              ? config.presetName
              : null,
            videoId: item.id,
            shouldMuteVideo: config.shouldMuteVideo,
            ...(config.shouldEnableQuality
              ? { quality: config.quality as number }
              : {}),
            ...(config.shouldEnableCustomDimensions && config.customDimensions
              ? { dimensions: config.customDimensions }
              : {}),
            ...(config.shouldEnableCustomFPS &&
            typeof config.customFPS === 'number'
              ? { fps: config.customFPS.toString() }
              : {}),
          })

          if (!result?.filePath) {
            throw new Error('Compression failed.')
          }

          await moveFile(result.filePath, outputPath)

          const outputMetadata = await getFileMetadata(outputPath)
          const outputFileName = outputMetadata?.fileName ?? ''
          const outputSize = formatBytes(outputMetadata?.size ?? 0)

          videoProxy.state.batch.items[index] = {
            ...videoProxy.state.batch.items[index],
            status: 'success',
            progress: 100,
            output: {
              pathRaw: outputMetadata?.path,
              path: core.convertFileSrc(outputMetadata?.path ?? ''),
              fileName: outputFileName,
              sizeInBytes: outputMetadata?.size,
              size: outputSize,
              extension: outputMetadata?.extension,
            },
          }
          videoProxy.state.batch.completedCount += 1
        } catch (error: unknown) {
          const message = String(error ?? '')
          if (message.includes('CANCELLED')) {
            videoProxy.state.batch.items[index] = {
              ...videoProxy.state.batch.items[index],
              status: 'cancelled',
              error: null,
            }
            break
          }
          videoProxy.state.batch.items[index] = {
            ...videoProxy.state.batch.items[index],
            status: 'failed',
            error: message || 'Compression failed.',
          }
          videoProxy.state.batch.failedCount += 1
        }
      }
    } finally {
      if (videoProxy.state.batch.cancelRequested) {
        videoProxy.state.batch.items = videoProxy.state.batch.items.map(
          (entry) =>
            entry.status === 'pending'
              ? { ...entry, status: 'cancelled' }
              : entry,
        )
      }
      videoProxy.state.batch.currentItemId = null
      videoProxy.state.batch.isCompressing = false
      videoProxy.state.isCompressing = false
      videoProxy.state.batch.isCompleted = true
      videoProxy.state.batch.cancelRequested = false
      setConfirmCancel(false)
      setIsCancelling(false)

      // Trigger shutdown timer if configured
      const shutdownConfig =
        snapshot(videoProxy).state.batch.config.shutdownTimer
      if (
        shutdownConfig.delaySeconds > 0 &&
        !videoProxy.state.batch.cancelRequested
      ) {
        handleScheduleShutdown(shutdownConfig.delaySeconds)
      }
    }
  }

  const handleCancelBatch = async () => {
    if (!batch.isCompressing) return
    setIsCancelling(true)
    videoProxy.state.batch.cancelRequested = true
    const currentId = snapshot(videoProxy).state.batch.currentItemId
    if (currentId) {
      try {
        await emitTo('main', CustomEvents.CancelInProgressCompression, {
          videoId: currentId,
        })
      } catch {
        // ignore
      }
    }
  }

  const statusLabel = (status: (typeof batch.items)[number]['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'compressing':
        return 'Compressing'
      case 'success':
        return 'Done'
      case 'failed':
        return 'Failed'
      case 'skipped':
        return 'Skipped'
      case 'cancelled':
        return 'Cancelled'
      default:
        return 'Pending'
    }
  }

  const statusClass = (status: (typeof batch.items)[number]['status']) => {
    switch (status) {
      case 'compressing':
        return 'text-primary'
      case 'success':
        return 'text-green-500'
      case 'failed':
        return 'text-red-500'
      case 'skipped':
        return 'text-yellow-500'
      case 'cancelled':
        return 'text-gray-400'
      default:
        return 'text-gray-500'
    }
  }

  const handleScheduleShutdown = async (delaySeconds: number) => {
    try {
      await scheduleSystemShutdown(delaySeconds)

      videoProxy.state.batch.shutdownTimerState.isPending = true
      videoProxy.state.batch.shutdownTimerState.secondsRemaining = delaySeconds
      setShowCountdownModal(true)

      // Start countdown interval
      const intervalId = setInterval(() => {
        const remaining =
          videoProxy.state.batch.shutdownTimerState.secondsRemaining
        if (remaining !== null && remaining > 0) {
          videoProxy.state.batch.shutdownTimerState.secondsRemaining =
            remaining - 1
        } else {
          clearInterval(intervalId)
          videoProxy.state.batch.shutdownTimerState.timerId = null
        }
      }, 1000)

      videoProxy.state.batch.shutdownTimerState.timerId =
        intervalId as unknown as NodeJS.Timeout

      const delayMinutes = Math.ceil(delaySeconds / 60)
      toast.success(
        `Shutdown scheduled in ${delayMinutes} minute${delayMinutes !== 1 ? 's' : ''}.`,
      )
    } catch (error) {
      toast.error('Failed to schedule shutdown: ' + String(error))
    }
  }

  React.useEffect(() => {
    return () => {
      const timerId = videoProxy.state.batch.shutdownTimerState.timerId
      if (timerId) {
        clearInterval(timerId)
        videoProxy.state.batch.shutdownTimerState.timerId = null
      }
    }
  }, [])

  const totalCount = batch.items.length
  const processedCount = batch.items.filter((item) =>
    ['success', 'failed', 'skipped', 'cancelled'].includes(item.status),
  ).length
  const overallProgress =
    totalCount > 0 ? Math.min(100, (processedCount * 100) / totalCount) : 0

  return (
    <Layout
      childrenProps={{
        className: cn(batch.isCompressing ? 'h-full' : 'h-full'),
      }}
      hideLogo
    >
      {isResolving ? (
        <Spinner size="lg" />
      ) : (
        <div className={cn(['h-full p-6', styles.videoConfigContainer])}>
          <section className="px-4 py-6 hlg:py-10 flex flex-col rounded-xl border-2 border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Selected videos
                </p>
                <p className="font-black">
                  {batch.items.length} files • {formatBytes(totalSize) || '0 B'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onPress={handleAddFiles}>
                  Add Files
                </Button>
                <Button size="sm" onPress={handleAddFolders}>
                  Add Folder
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  onPress={handleClearList}
                  isDisabled={batch.isCompressing}
                >
                  Clear
                </Button>
              </div>
            </div>
            <Divider className="my-4" />
            {batch.items.length === 0 ? (
              <div className="flex flex-1 justify-center items-center text-sm text-gray-500 dark:text-gray-400">
                Drag files or folders here to build a batch.
              </div>
            ) : (
              <div className="flex-1 overflow-auto space-y-2 pr-2">
                {batch.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {item.fileName}
                      </p>
                      <p
                        className={cn([
                          'text-xs flex items-center gap-2',
                          statusClass(item.status),
                        ])}
                      >
                        <span>{statusLabel(item.status)}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {item.size}
                        </span>
                        {item.status === 'compressing' && item.progress ? (
                          <span>{item.progress.toFixed(1)}%</span>
                        ) : null}
                      </p>
                      {item.status === 'failed' && item.error ? (
                        <p className="text-xs text-red-500 truncate">
                          {item.error}
                        </p>
                      ) : null}
                    </div>
                    {!batch.isCompressing ? (
                      <Button
                        isIconOnly
                        size="sm"
                        variant="flat"
                        onPress={() => handleRemoveItem(item.id)}
                      >
                        <Icon name="cross" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <Divider className="my-4" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Progress: {Math.round(overallProgress)}% ({processedCount}/
                {totalCount})
              </span>
              <span>
                Success {batch.completedCount} • Failed {batch.failedCount}
              </span>
            </div>
          </section>

          <section className="px-4 py-5 pb-24 hlg:py-6 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 max-h-[calc(100vh-7.5rem)] overflow-y-auto">
            <p className="text-xl mb-4 font-bold">Batch Settings</p>
            <div className="space-y-4">
              <Select
                fullWidth
                label="Naming:"
                className="block flex-shrink-0 rounded-2xl"
                size="sm"
                value={batch.config.namingMode}
                selectedKeys={[batch.config.namingMode]}
                onChange={(evt) => {
                  const value = evt?.target?.value
                  if (
                    value &&
                    (value === 'suffix' ||
                      value === 'prefix' ||
                      value === 'replace')
                  ) {
                    videoProxy.state.batch.config.namingMode = value
                  }
                }}
                selectionMode="single"
                isDisabled={batch.isCompressing}
                classNames={{
                  label: '!text-gray-600 dark:!text-gray-400 text-sm',
                }}
              >
                {Object.entries(namingOptions).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </Select>

              {batch.config.namingMode === 'prefix' ? (
                <input
                  type="text"
                  value={batch.config.prefix}
                  onChange={(evt) => {
                    videoProxy.state.batch.config.prefix = sanitizeNamePart(
                      evt.target.value,
                    )
                  }}
                  placeholder="Enter prefix"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
                  disabled={batch.isCompressing}
                />
              ) : null}

              {batch.config.namingMode === 'suffix' ? (
                <input
                  type="text"
                  value={batch.config.suffix}
                  onChange={(evt) => {
                    videoProxy.state.batch.config.suffix = sanitizeNamePart(
                      evt.target.value,
                    )
                  }}
                  placeholder="Enter suffix"
                  className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
                  disabled={batch.isCompressing}
                />
              ) : null}

              {batch.config.namingMode === 'replace' ? (
                <p className="text-xs text-amber-500">
                  Original files will be replaced after successful compression.
                </p>
              ) : null}

              <Divider />

              <Select
                fullWidth
                label="Output Folder:"
                className="block flex-shrink-0 rounded-2xl"
                size="sm"
                value={batch.config.outputFolderMode}
                selectedKeys={[batch.config.outputFolderMode]}
                onChange={(evt) => {
                  const value = evt?.target?.value
                  if (value && (value === 'source' || value === 'custom')) {
                    videoProxy.state.batch.config.outputFolderMode = value
                  }
                }}
                selectionMode="single"
                isDisabled={
                  batch.isCompressing || batch.config.namingMode === 'replace'
                }
                classNames={{
                  label: '!text-gray-600 dark:!text-gray-400 text-sm',
                }}
              >
                {Object.entries(outputFolderOptions).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </Select>

              {batch.config.outputFolderMode === 'custom' ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {batch.config.outputFolder ?? 'No folder selected'}
                  </span>
                  <Button
                    size="sm"
                    onPress={handleChooseOutputFolder}
                    isDisabled={batch.isCompressing}
                  >
                    Choose
                  </Button>
                </div>
              ) : null}

              <Switch
                isSelected={batch.config.includeSubfolders}
                onValueChange={() => {
                  videoProxy.state.batch.config.includeSubfolders =
                    !batch.config.includeSubfolders
                }}
                isDisabled={batch.isCompressing}
              >
                <p className="text-gray-600 dark:text-gray-400 text-sm mr-2 w-full">
                  Include subfolders
                </p>
              </Switch>
            </div>

            <ShutdownTimer />

            <Divider className="my-4" />

            <p className="text-xl mb-4 font-bold">Output Settings</p>
            <CompressionPreset />
            <Divider className="my-2" />
            <div className="flex items-center my-2">
              <Switch
                isSelected={config.shouldMuteVideo}
                onValueChange={() => {
                  videoProxy.state.config.shouldMuteVideo =
                    !config.shouldMuteVideo
                }}
                className="flex justify-center items-center"
                isDisabled={batch.isCompressing}
              >
                <div className="flex justify-center items-center">
                  <span className="text-gray-600 dark:text-gray-400 block mr-2 text-sm">
                    Mute Audio
                  </span>
                </div>
              </Switch>
            </div>
            <Divider className="my-2" />
            <CompressionQuality />
            <Divider className="my-2" />
            <BatchDimensions />
            <Divider className="my-2" />
            <BatchFPS />
            <Divider className="my-2" />

            <Select
              fullWidth
              label="Extension:"
              className="block flex-shrink-0 rounded-2xl"
              size="sm"
              value={config.convertToExtension}
              selectedKeys={[config.convertToExtension]}
              onChange={(evt) => {
                const value = evt?.target?.value
                if (value && value.length > 0 && isConvertToExtension(value)) {
                  videoProxy.state.config.convertToExtension = value
                }
              }}
              selectionMode="single"
              isDisabled={
                batch.isCompressing || batch.config.namingMode === 'replace'
              }
              classNames={{
                label: '!text-gray-600 dark:!text-gray-400 text-sm',
              }}
            >
              {extensionOptions?.map((ext) => (
                <SelectItem
                  key={ext}
                  value={ext}
                  className="flex justify-center items-center"
                >
                  {ext === 'source' ? 'Same as source' : ext}
                </SelectItem>
              ))}
            </Select>

            <div className="sticky bottom-0 z-30 mt-5 space-y-3 border-t border-zinc-200 dark:border-zinc-800 bg-white1 dark:bg-black1 pb-1 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.28)]">
              {!batch.isCompressing ? (
                <QualityPreviewAction mode="batch" />
              ) : null}
              {batch.isCompressing ? (
                <Button
                  color="danger"
                  size="lg"
                  variant={confirmCancel ? 'solid' : 'flat'}
                  onPress={() => {
                    if (!confirmCancel) {
                      setConfirmCancel(true)
                    } else {
                      handleCancelBatch()
                    }
                  }}
                  isLoading={isCancelling}
                  isDisabled={isCancelling}
                  fullWidth
                >
                  <AnimatePresence mode="wait">
                    <motion.div layout="preserve-aspect">
                      {confirmCancel && !isCancelling
                        ? 'Confirm Cancel'
                        : isCancelling
                          ? 'Cancelling...'
                          : 'Cancel Batch'}
                    </motion.div>
                  </AnimatePresence>
                </Button>
              ) : (
                <Button
                  color="primary"
                  onPress={handleStartBatch}
                  fullWidth
                  className="text-primary"
                  isDisabled={batch.items.length === 0 || isSingleCompressing}
                >
                  Start Batch <Icon name="logo" size={25} />
                </Button>
              )}
            </div>
          </section>
        </div>
      )}

      <DragAndDrop
        disable={batch.isCompressing}
        onFiles={(paths) => handleAddPaths(paths)}
      />
      <ShutdownCountdownModal
        isOpen={showCountdownModal}
        onClose={() => setShowCountdownModal(false)}
      />
    </Layout>
  )
}

export default React.memo(BatchConfig)
