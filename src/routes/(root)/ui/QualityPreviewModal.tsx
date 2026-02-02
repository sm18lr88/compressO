import React from 'react'

import Button from '@/components/Button'
import Divider from '@/components/Divider'
import Modal, {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/Modal'
import Slider from '@/components/Slider/Slider'
import { toast } from '@/components/Toast'

export type QualityPreviewItem = {
  id: string
  label: string
  sourceSrc: string
  compressedSrc: string
}

type QualityPreviewModalProps = {
  isOpen: boolean
  onClose: () => void
  items: QualityPreviewItem[]
  previewSeconds?: number
}

type PanPosition = { x: number; y: number }

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = Math.floor(safeSeconds % 60)
  return `${minutes}:${`${remainder}`.padStart(2, '0')}`
}

function QualityPreviewModal({
  isOpen,
  onClose,
  items,
  previewSeconds = 20,
}: QualityPreviewModalProps) {
  const sourceRef = React.useRef<HTMLVideoElement | null>(null)
  const compressedRef = React.useRef<HTMLVideoElement | null>(null)
  const sourcePaneRef = React.useRef<HTMLDivElement | null>(null)
  const compressedPaneRef = React.useRef<HTMLDivElement | null>(null)
  const dragStateRef = React.useRef<{
    isDragging: boolean
    lastX: number
    lastY: number
  }>({ isDragging: false, lastX: 0, lastY: 0 })

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [seekValue, setSeekValue] = React.useState(0)
  const [duration, setDuration] = React.useState(previewSeconds)
  const [zoomValue, setZoomValue] = React.useState(1)
  const [pan, setPan] = React.useState<PanPosition>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const selectedItem = React.useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0],
    [items, selectedId],
  )

  const syncPlayback = React.useCallback((time?: number) => {
    if (!sourceRef.current || !compressedRef.current) return
    const nextTime =
      typeof time === 'number' ? time : (sourceRef.current.currentTime ?? 0)
    if (Math.abs((compressedRef.current.currentTime ?? 0) - nextTime) > 0.08) {
      compressedRef.current.currentTime = nextTime
    }
  }, [])

  const pauseBoth = React.useCallback(() => {
    sourceRef.current?.pause()
    compressedRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const playBoth = React.useCallback(async () => {
    if (!sourceRef.current || !compressedRef.current) return
    try {
      await Promise.all([
        sourceRef.current.play(),
        compressedRef.current.play(),
      ])
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
    }
  }, [])

  const getPaneBounds = React.useCallback(() => {
    const pane = sourcePaneRef.current ?? compressedPaneRef.current
    const width = pane?.clientWidth ?? 0
    const height = pane?.clientHeight ?? 0
    return { width, height }
  }, [])

  const clampPan = React.useCallback(
    (nextPan: PanPosition, zoom: number): PanPosition => {
      if (zoom <= 1) {
        return { x: 0, y: 0 }
      }
      const { width, height } = getPaneBounds()
      if (width <= 0 || height <= 0) {
        return nextPan
      }
      const maxX = ((zoom - 1) * width) / 2
      const maxY = ((zoom - 1) * height) / 2
      return {
        x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
        y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
      }
    },
    [getPaneBounds],
  )

  React.useEffect(() => {
    if (!isOpen) {
      pauseBoth()
      return
    }
    if (!selectedId && items[0]) {
      setSelectedId(items[0].id)
    }
  }, [isOpen, items, pauseBoth, selectedId])

  React.useEffect(() => {
    if (!selectedItem) return
    pauseBoth()
    setSeekValue(0)
    setDuration(previewSeconds)
    setZoomValue(1)
    setPan({ x: 0, y: 0 })
    setIsDragging(false)
    dragStateRef.current = { isDragging: false, lastX: 0, lastY: 0 }
    setLoadError(null)
  }, [pauseBoth, previewSeconds, selectedItem])

  React.useEffect(() => {
    if (zoomValue <= 1) {
      setPan({ x: 0, y: 0 })
      return
    }
    setPan((previousPan) => clampPan(previousPan, zoomValue))
  }, [clampPan, zoomValue])

  const handleSeek = React.useCallback(
    (value: number | number[]) => {
      const nextValue = Array.isArray(value) ? value[0] : value
      setSeekValue(nextValue)
      if (sourceRef.current) {
        sourceRef.current.currentTime = nextValue
      }
      if (compressedRef.current) {
        compressedRef.current.currentTime = nextValue
      }
    },
    [setSeekValue],
  )

  const handleTimeUpdate = React.useCallback(() => {
    if (!sourceRef.current) return
    const currentTime = sourceRef.current.currentTime ?? 0
    setSeekValue(currentTime)
    syncPlayback(currentTime)
  }, [syncPlayback])

  const handleLoadedMetadata = React.useCallback(() => {
    const sourceDuration = sourceRef.current?.duration ?? previewSeconds
    const compressedDuration = compressedRef.current?.duration ?? previewSeconds
    const resolvedDuration =
      Math.min(sourceDuration, compressedDuration, previewSeconds) ||
      previewSeconds
    setDuration(resolvedDuration)
  }, [previewSeconds])

  const maxDuration = Math.max(1, duration)

  const handleWheelZoom = React.useCallback(
    (evt: React.WheelEvent<HTMLDivElement>) => {
      evt.preventDefault()
      const direction = evt.deltaY < 0 ? 1 : -1
      setZoomValue((previousZoom) => {
        const nextZoom = Math.max(
          1,
          Math.min(4, previousZoom + direction * 0.2),
        )
        if (nextZoom <= 1) {
          setPan({ x: 0, y: 0 })
        } else {
          setPan((previousPan) => clampPan(previousPan, nextZoom))
        }
        return nextZoom
      })
    },
    [clampPan],
  )

  const handleDragStart = React.useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      if (zoomValue <= 1) {
        return
      }
      evt.preventDefault()
      dragStateRef.current = {
        isDragging: true,
        lastX: evt.clientX,
        lastY: evt.clientY,
      }
      setIsDragging(true)
    },
    [zoomValue],
  )

  React.useEffect(() => {
    const handleMouseMove = (evt: MouseEvent) => {
      if (!dragStateRef.current.isDragging || zoomValue <= 1) {
        return
      }
      const deltaX = evt.clientX - dragStateRef.current.lastX
      const deltaY = evt.clientY - dragStateRef.current.lastY
      dragStateRef.current.lastX = evt.clientX
      dragStateRef.current.lastY = evt.clientY
      setPan((previousPan) =>
        clampPan(
          {
            x: previousPan.x + deltaX,
            y: previousPan.y + deltaY,
          },
          zoomValue,
        ),
      )
    }

    const stopDragging = () => {
      if (dragStateRef.current.isDragging) {
        dragStateRef.current.isDragging = false
        setIsDragging(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', stopDragging)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', stopDragging)
    }
  }, [clampPan, zoomValue])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
      classNames={{
        backdrop: 'backdrop-blur-sm bg-black/50',
      }}
    >
      <ModalContent className="rounded-2xl overflow-hidden">
        <>
          <ModalHeader className="flex flex-col items-start gap-1">
            <h3 className="text-xl font-bold">Quality Preview</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Side-by-side comparison using current output settings.
            </p>
          </ModalHeader>
          <ModalBody className="pt-0">
            {items.length > 1 ? (
              <div className="flex flex-wrap gap-2 mb-3">
                {items.map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={item.id === selectedItem?.id ? 'solid' : 'flat'}
                    color={item.id === selectedItem?.id ? 'primary' : 'default'}
                    onPress={() => setSelectedId(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Source
                </p>
                <div
                  ref={sourcePaneRef}
                  className="h-[260px] md:h-[320px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black flex items-center justify-center select-none"
                  onWheel={handleWheelZoom}
                  onMouseDown={handleDragStart}
                >
                  {selectedItem ? (
                    <video
                      key={`${selectedItem.id}-source`}
                      ref={sourceRef}
                      src={selectedItem.sourceSrc}
                      className={
                        isDragging && zoomValue > 1
                          ? 'w-full h-full object-contain cursor-grabbing pointer-events-none'
                          : zoomValue > 1
                            ? 'w-full h-full object-contain cursor-grab pointer-events-none'
                            : 'w-full h-full object-contain pointer-events-none'
                      }
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomValue})`,
                        transformOrigin: 'center center',
                      }}
                      muted
                      preload="auto"
                      playsInline
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onError={() => {
                        setLoadError('Could not load source preview clip.')
                        toast.error('Could not load source preview clip.')
                      }}
                    />
                  ) : null}
                </div>
              </section>

              <section>
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Compressed
                </p>
                <div
                  ref={compressedPaneRef}
                  className="h-[260px] md:h-[320px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-black flex items-center justify-center select-none"
                  onWheel={handleWheelZoom}
                  onMouseDown={handleDragStart}
                >
                  {selectedItem ? (
                    <video
                      key={`${selectedItem.id}-compressed`}
                      ref={compressedRef}
                      src={selectedItem.compressedSrc}
                      className={
                        isDragging && zoomValue > 1
                          ? 'w-full h-full object-contain cursor-grabbing pointer-events-none'
                          : zoomValue > 1
                            ? 'w-full h-full object-contain cursor-grab pointer-events-none'
                            : 'w-full h-full object-contain pointer-events-none'
                      }
                      style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomValue})`,
                        transformOrigin: 'center center',
                      }}
                      muted
                      preload="auto"
                      playsInline
                      onLoadedMetadata={handleLoadedMetadata}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onError={() => {
                        setLoadError('Could not load compressed preview clip.')
                        toast.error('Could not load compressed preview clip.')
                      }}
                    />
                  ) : null}
                </div>
              </section>
            </div>

            {loadError ? (
              <p className="mt-3 text-xs text-red-500">{loadError}</p>
            ) : null}

            <Divider className="my-4" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="solid"
                color="primary"
                onPress={() => {
                  if (isPlaying) {
                    pauseBoth()
                  } else {
                    playBoth()
                  }
                }}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button
                size="sm"
                onPress={() => {
                  handleSeek(0)
                  pauseBoth()
                }}
              >
                Restart
              </Button>
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {formatTime(seekValue)} / {formatTime(maxDuration)}
              </span>
            </div>

            <div className="mt-4">
              <p className="text-xs mb-1 text-gray-600 dark:text-gray-400">
                Seek
              </p>
              <Slider
                aria-label="Seek"
                size="sm"
                minValue={0}
                maxValue={maxDuration}
                step={0.05}
                value={seekValue}
                onChange={handleSeek}
              />
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-600 dark:text-gray-400">Zoom</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {zoomValue.toFixed(2)}x
                </p>
              </div>
              <Slider
                aria-label="Zoom"
                size="sm"
                minValue={1}
                maxValue={4}
                step={0.25}
                value={zoomValue}
                onChange={(value) => {
                  const nextValue = Array.isArray(value) ? value[0] : value
                  setZoomValue(nextValue)
                }}
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                Mouse wheel zooms in/out. Click and drag to pan when zoomed.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                pauseBoth()
                onClose()
              }}
            >
              Close
            </Button>
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  )
}

export default React.memo(QualityPreviewModal)
