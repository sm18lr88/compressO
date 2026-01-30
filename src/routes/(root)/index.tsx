import { createFileRoute } from '@tanstack/react-router'
import { core } from '@tauri-apps/api'
import { open } from '@tauri-apps/plugin-dialog'
import { motion } from 'framer-motion'
import React from 'react'
import { useSnapshot } from 'valtio'

import Button from '@/components/Button'
import Icon from '@/components/Icon'
import Layout from '@/components/Layout'
import Tabs, { Tab } from '@/components/Tabs'
import { toast } from '@/components/Toast'
import { generateVideoThumbnail, getVideoInfo } from '@/tauri/commands/ffmpeg'
import { getFileMetadata, resolveVideoFiles } from '@/tauri/commands/fs'
import VideoPicker from '@/tauri/components/VideoPicker'
import { extensions } from '@/types/compression'
import { createBatchItems, mergeBatchItems } from '@/utils/batch-utils'
import { formatBytes } from '@/utils/fs'
import { convertDurationToMilliseconds } from '@/utils/string'
import { videoProxy } from './-state'
import BatchConfig from './ui/BatchConfig'
import DragAndDrop from './ui/DragAndDrop'
import Setting from './ui/Setting'
import VideoConfig from './ui/VideoConfig'

export const Route = createFileRoute('/(root)/')({
  component: Root,
})

function Root() {
  const { state, resetProxy } = useSnapshot(videoProxy)

  const { isFileSelected, isCompressing, batch, mode } = state

  const handleVideoSelected = React.useCallback(
    async (path: string) => {
      if (isCompressing) return
      try {
        if (!path) {
          toast.error('Invalid file selected.')
          return
        }
        const [fileMetadata, videoInfo] = await Promise.all([
          getFileMetadata(path),
          getVideoInfo(path),
        ])

        if (
          !fileMetadata ||
          (typeof fileMetadata?.size === 'number' && fileMetadata?.size <= 1000)
        ) {
          toast.error('Invalid file.')
          return
        }
        videoProxy.state.isFileSelected = true
        videoProxy.state.pathRaw = path
        videoProxy.state.path = core.convertFileSrc(path)
        videoProxy.state.fileName = fileMetadata?.fileName
        videoProxy.state.mimeType = fileMetadata?.mimeType
        videoProxy.state.sizeInBytes = fileMetadata?.size
        videoProxy.state.size = formatBytes(fileMetadata?.size ?? 0)
        videoProxy.state.isThumbnailGenerating = true
        videoProxy.state.extension = fileMetadata?.extension?.toLowerCase?.()

        if (fileMetadata?.extension) {
          videoProxy.state.config.convertToExtension = videoProxy.state
            .extension as keyof (typeof extensions)['video']
        }

        if (videoInfo) {
          const dimensions = videoInfo.dimensions
          if (
            !Number.isNaN(videoInfo.dimensions?.[0]) &&
            !Number.isNaN(videoInfo.dimensions[1])
          ) {
            videoProxy.state.dimensions = {
              width: dimensions[0],
              height: dimensions[1],
            }
          }
          const duration = videoInfo.duration
          const durationInMilliseconds = convertDurationToMilliseconds(duration)
          if (durationInMilliseconds > 0) {
            videoProxy.state.videDurationRaw = duration
            videoProxy.state.videoDurationMilliseconds = durationInMilliseconds
          }
          if (videoInfo.fps) {
            videoProxy.state.fps = Math.ceil(videoInfo.fps)
          }
        }

        const thumbnail = await generateVideoThumbnail(path)

        videoProxy.state.isThumbnailGenerating = false
        if (thumbnail) {
          videoProxy.state.id = thumbnail?.id
          videoProxy.state.thumbnailPathRaw = thumbnail?.filePath
          videoProxy.state.thumbnailPath = core.convertFileSrc(
            thumbnail?.filePath,
          )
        }
      } catch {
        resetProxy()
        toast.error('File seems to be corrupted.')
      }
    },
    [isCompressing, resetProxy],
  )

  const handleBatchPathsSelected = React.useCallback(
    async (paths: string[]) => {
      if (batch.isCompressing || isCompressing) {
        toast.error('Please wait for current compression to finish.')
        return
      }
      try {
        const result = await resolveVideoFiles(
          paths,
          batch.config.includeSubfolders,
        )
        if (result.files.length === 0) {
          toast.error('No supported video files were found.')
          return
        }
        const incoming = createBatchItems(result.files)
        const merged = mergeBatchItems(videoProxy.state.batch.items, incoming)
        videoProxy.state.batch.items = merged
        videoProxy.state.mode = 'batch'

        if (result.invalidPaths.length > 0) {
          toast.error('Some paths could not be read.')
        } else if (result.skippedPaths.length > 0 || result.ignoredCount > 0) {
          toast.success('Non-video files were ignored.')
        }
      } catch {
        toast.error('Could not read dropped items.')
      }
    },
    [batch.config.includeSubfolders, batch.isCompressing, isCompressing],
  )

  const switchMode = (nextMode: 'single' | 'batch') => {
    if (isCompressing || batch.isCompressing) {
      toast.error('Cannot switch modes while compressing.')
      return
    }
    if (nextMode === mode) {
      return
    }
    resetProxy()
    videoProxy.state.mode = nextMode
  }

  const handleBatchAddFiles = async () => {
    try {
      const result = await open({
        directory: false,
        multiple: true,
        title: 'Select videos to compress',
        filters: [
          { name: 'video', extensions: Object.keys(extensions?.video) },
        ],
      })
      if (Array.isArray(result)) {
        await handleBatchPathsSelected(result)
      } else if (typeof result === 'string') {
        await handleBatchPathsSelected([result])
      }
    } catch {
      toast.error('Could not select files.')
    }
  }

  const handleBatchAddFolders = async () => {
    try {
      const result = await open({
        directory: true,
        multiple: true,
        title: 'Select folder(s) to scan',
      })
      if (Array.isArray(result)) {
        await handleBatchPathsSelected(result)
      } else if (typeof result === 'string') {
        await handleBatchPathsSelected([result])
      }
    } catch {
      toast.error('Could not select folders.')
    }
  }

  if (mode === 'single' && isFileSelected) {
    return <VideoConfig />
  }

  if (mode === 'batch' && batch.items.length > 0) {
    return <BatchConfig />
  }

  return (
    <Layout
      containerProps={{ className: 'relative' }}
      childrenProps={{ className: 'm-auto' }}
    >
      <Tabs
        selectedKey={mode}
        onSelectionChange={(key) => switchMode(key as 'single' | 'batch')}
        className="mb-6"
      >
        <Tab key="single" title="Single">
          <VideoPicker
            onSuccess={({ filePath }) => handleVideoSelected(filePath)}
          >
            {({ onClick }) => (
              <motion.div
                role="button"
                tabIndex={0}
                className="h-full w-full flex flex-col justify-center items-center z-0"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  transition: {
                    duration: 0.6,
                    bounce: 0.3,
                    type: 'spring',
                  },
                }}
                onClick={onClick}
                onKeyDown={(evt) => {
                  if (evt?.key === 'Enter') {
                    onClick()
                  }
                }}
              >
                <div className="flex flex-col justify-center items-center py-16 px-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                  <Icon name="videoFile" className="text-primary" size={60} />
                  <p className="italic text-sm mt-4 text-gray-600 dark:text-gray-400 text-center">
                    Drag & Drop
                    <span className="block">Or</span>
                    Click to select a video.
                  </p>
                </div>
              </motion.div>
            )}
          </VideoPicker>
        </Tab>
        <Tab key="batch" title="Batch">
          <div className="flex flex-col justify-center items-center py-16 px-20 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
            <Icon name="videoFile" className="text-primary" size={60} />
            <p className="italic text-sm mt-4 text-gray-600 dark:text-gray-400 text-center">
              Drag & Drop videos or folders
              <span className="block">Or</span>
              add files and folders below.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onPress={handleBatchAddFiles}>Add Files</Button>
              <Button onPress={handleBatchAddFolders}>Add Folders</Button>
            </div>
          </div>
        </Tab>
      </Tabs>
      <DragAndDrop
        disable={mode === 'single' ? isFileSelected : batch.isCompressing}
        onFile={mode === 'single' ? handleVideoSelected : undefined}
        onFiles={mode === 'batch' ? handleBatchPathsSelected : undefined}
      />
      <Setting />
    </Layout>
  )
}

export default Root
