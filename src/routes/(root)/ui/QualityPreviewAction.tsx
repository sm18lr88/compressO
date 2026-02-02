import { core } from '@tauri-apps/api'
import React from 'react'
import { snapshot, useSnapshot } from 'valtio'

import Button from '@/components/Button'
import Icon from '@/components/Icon'
import { toast } from '@/components/Toast'
import Tooltip from '@/components/Tooltip'
import { generateQualityPreview } from '@/tauri/commands/ffmpeg'
import { deleteFile } from '@/tauri/commands/fs'
import { VideoTransformsHistory } from '@/types/compression'
import QualityPreviewModal, { QualityPreviewItem } from './QualityPreviewModal'
import { videoProxy } from '../-state'

type QualityPreviewActionProps = {
  mode: 'single' | 'batch'
}

const PREVIEW_SECONDS = 20
const BATCH_PREVIEW_LIMIT = 3

function QualityPreviewAction({ mode }: QualityPreviewActionProps) {
  const {
    state: { isCompressing, isCompressionSuccessful, batch },
  } = useSnapshot(videoProxy)

  const [isOpen, setIsOpen] = React.useState(false)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [previewProgress, setPreviewProgress] = React.useState(0)
  const [previewItems, setPreviewItems] = React.useState<QualityPreviewItem[]>(
    [],
  )
  const progressTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const previewTempPathsRef = React.useRef<string[]>([])
  const previewCacheKeyRef = React.useRef<string | null>(null)

  const tooltipContent =
    mode === 'single'
      ? 'Renders the first 20 seconds using your current settings, then compares source and compressed videos side by side.'
      : 'Renders the first 20 seconds of up to 3 videos in this batch using current settings for side-by-side comparison.'

  const canPreview =
    mode === 'single'
      ? Boolean(snapshot(videoProxy).state.pathRaw)
      : batch.items.length > 0

  const stopProgressAnimation = React.useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const animateProgressTo = React.useCallback(
    (ceiling: number) => {
      stopProgressAnimation()
      progressTimerRef.current = setInterval(() => {
        setPreviewProgress((previousValue) => {
          if (previousValue >= ceiling) {
            return previousValue
          }
          const remaining = ceiling - previousValue
          const step = Math.max(0.6, remaining * 0.12)
          return Math.min(ceiling, previousValue + step)
        })
      }, 120)
    },
    [stopProgressAnimation],
  )

  const cleanupPreviewFiles = React.useCallback(async () => {
    const paths = Array.from(new Set(previewTempPathsRef.current))
    previewTempPathsRef.current = []
    if (paths.length === 0) return

    await Promise.all(
      paths.map(async (path) => {
        try {
          await deleteFile(path)
        } catch {
          // Ignore cleanup failures for temp preview files.
        }
      }),
    )
  }, [])

  const buildPreviewCacheKey = React.useCallback(
    (state: any) => {
      const common = {
        presetName: !state.config.shouldDisableCompression
          ? state.config.presetName
          : null,
        shouldMuteVideo: state.config.shouldMuteVideo,
        quality: state.config.shouldEnableQuality ? state.config.quality : null,
        dimensions: state.config.shouldEnableCustomDimensions
          ? state.config.customDimensions
          : null,
        fps:
          state.config.shouldEnableCustomFPS &&
          typeof state.config.customFPS === 'number'
            ? state.config.customFPS
            : null,
        previewSeconds: PREVIEW_SECONDS,
      }

      if (mode === 'single') {
        const convertToExtension =
          state.config.convertToExtension === 'source'
            ? (state.extension ?? 'mp4')
            : state.config.convertToExtension
        const transformsHistory = state.config.shouldTransformVideo
          ? (state.config.transformVideoConfig?.transformsHistory ?? [])
          : []

        return JSON.stringify({
          mode,
          videoPath: state.pathRaw ?? '',
          convertToExtension,
          transformsHistory,
          ...common,
        })
      }

      const sampleItems = state.batch.items.slice(0, BATCH_PREVIEW_LIMIT)
      const sampleDescriptor = sampleItems.map((item: any) => ({
        id: item.id,
        path: item.path,
        extension: item.extension,
      }))

      return JSON.stringify({
        mode,
        namingMode: state.batch.config.namingMode,
        convertToExtension: state.config.convertToExtension,
        sampleDescriptor,
        ...common,
      })
    },
    [mode],
  )

  const closePreview = React.useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleGeneratePreview = async () => {
    if (isGenerating || isCompressing || batch.isCompressing) {
      return
    }

    const state = snapshot(videoProxy).state
    const currentCacheKey = buildPreviewCacheKey(state)

    if (
      previewItems.length > 0 &&
      previewCacheKeyRef.current === currentCacheKey
    ) {
      setIsOpen(true)
      return
    }

    try {
      setIsGenerating(true)
      setPreviewProgress(2)
      await cleanupPreviewFiles()
      setPreviewItems([])
      previewCacheKeyRef.current = null

      if (mode === 'single') {
        animateProgressTo(93)
        const videoPath = state.pathRaw
        if (!videoPath) {
          toast.error('Select a video first.')
          return
        }

        const convertToExtension =
          state.config.convertToExtension === 'source'
            ? (state.extension ?? 'mp4')
            : state.config.convertToExtension

        const transformsHistory: VideoTransformsHistory[] | undefined = state
          .config.shouldTransformVideo
          ? [...(state.config.transformVideoConfig?.transformsHistory ?? [])]
          : undefined

        const preview = await generateQualityPreview({
          videoPath,
          convertToExtension,
          presetName: !state.config.shouldDisableCompression
            ? state.config.presetName
            : null,
          shouldMuteVideo: state.config.shouldMuteVideo,
          previewSeconds: PREVIEW_SECONDS,
          ...(state.config.shouldEnableQuality
            ? { quality: state.config.quality as number }
            : {}),
          ...(state.config.shouldEnableCustomDimensions &&
          state.config.customDimensions
            ? { dimensions: state.config.customDimensions }
            : {}),
          ...(state.config.shouldEnableCustomFPS &&
          typeof state.config.customFPS === 'number'
            ? { fps: state.config.customFPS.toString() }
            : {}),
          ...(transformsHistory && transformsHistory.length > 0
            ? { transformsHistory }
            : {}),
        })

        const item: QualityPreviewItem = {
          id: state.id ?? 'single-preview',
          label: state.fileName ?? 'Selected Video',
          sourceSrc: core.convertFileSrc(preview.sourceFilePath),
          compressedSrc: core.convertFileSrc(preview.compressedFilePath),
        }
        previewTempPathsRef.current.push(
          preview.sourceFilePath,
          preview.compressedFilePath,
        )

        setPreviewItems([item])
        previewCacheKeyRef.current = currentCacheKey
        setPreviewProgress(100)
        setIsOpen(true)
        return
      }

      const sampleItems = state.batch.items.slice(0, BATCH_PREVIEW_LIMIT)
      if (sampleItems.length === 0) {
        toast.error('Add videos to the batch first.')
        return
      }

      const generated: QualityPreviewItem[] = []
      let failedCount = 0

      for (let index = 0; index < sampleItems.length; index += 1) {
        const item = sampleItems[index]
        try {
          const baseProgress = (index * 100) / sampleItems.length
          const ceilingProgress = Math.min(
            99,
            ((index + 0.85) * 100) / sampleItems.length,
          )
          setPreviewProgress(baseProgress)
          animateProgressTo(ceilingProgress)

          const convertToExtension =
            state.batch.config.namingMode === 'replace'
              ? item.extension
              : state.config.convertToExtension === 'source'
                ? item.extension
                : state.config.convertToExtension

          const preview = await generateQualityPreview({
            videoPath: item.path,
            convertToExtension,
            presetName: !state.config.shouldDisableCompression
              ? state.config.presetName
              : null,
            shouldMuteVideo: state.config.shouldMuteVideo,
            previewSeconds: PREVIEW_SECONDS,
            ...(state.config.shouldEnableQuality
              ? { quality: state.config.quality as number }
              : {}),
            ...(state.config.shouldEnableCustomDimensions &&
            state.config.customDimensions
              ? { dimensions: state.config.customDimensions }
              : {}),
            ...(state.config.shouldEnableCustomFPS &&
            typeof state.config.customFPS === 'number'
              ? { fps: state.config.customFPS.toString() }
              : {}),
          })

          generated.push({
            id: item.id,
            label: item.fileName,
            sourceSrc: core.convertFileSrc(preview.sourceFilePath),
            compressedSrc: core.convertFileSrc(preview.compressedFilePath),
          })
          previewTempPathsRef.current.push(
            preview.sourceFilePath,
            preview.compressedFilePath,
          )
        } catch {
          failedCount += 1
        }
        setPreviewProgress(((index + 1) * 100) / sampleItems.length)
      }

      if (generated.length === 0) {
        toast.error('Could not generate previews for the selected batch items.')
        return
      }

      if (failedCount > 0) {
        toast.error(
          'Some previews failed to render, showing available results.',
        )
      }

      setPreviewItems(generated)
      previewCacheKeyRef.current = currentCacheKey
      setPreviewProgress(100)
      setIsOpen(true)
    } catch {
      toast.error('Could not generate preview. Please try again.')
    } finally {
      stopProgressAnimation()
      setIsGenerating(false)
      setTimeout(() => {
        setPreviewProgress(0)
      }, 250)
    }
  }

  React.useEffect(() => {
    return () => {
      stopProgressAnimation()
      previewCacheKeyRef.current = null
      void cleanupPreviewFiles()
    }
  }, [cleanupPreviewFiles, stopProgressAnimation])

  return (
    <>
      <Tooltip content={tooltipContent} aria-label={tooltipContent}>
        <div className="w-full">
          <Button
            onPress={handleGeneratePreview}
            fullWidth
            variant="flat"
            className="relative overflow-hidden"
            isDisabled={
              isGenerating ||
              isCompressing ||
              batch.isCompressing ||
              isCompressionSuccessful ||
              !canPreview
            }
          >
            {isGenerating ? (
              <>
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-primary/30 transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.min(100, previewProgress)}%` }}
                />
                <span className="relative z-10">
                  Generating Preview... {Math.round(previewProgress)}%
                </span>
              </>
            ) : (
              <>
                Preview
                <Icon name="play" size={16} />
              </>
            )}
          </Button>
        </div>
      </Tooltip>

      <QualityPreviewModal
        isOpen={isOpen}
        onClose={closePreview}
        items={previewItems}
        previewSeconds={PREVIEW_SECONDS}
      />
    </>
  )
}

export default React.memo(QualityPreviewAction)
