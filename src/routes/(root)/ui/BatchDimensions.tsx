import { AnimatePresence, motion } from 'framer-motion'
import React from 'react'
import { useSnapshot } from 'valtio'

import NumberInput from '@/components/NumberInput'
import Switch from '@/components/Switch'
import { slideDownTransition } from '@/utils/animation'
import { videoProxy } from '../-state'

function BatchDimensions() {
  const {
    state: {
      batch: { isCompressing },
      config: { shouldEnableCustomDimensions, customDimensions },
    },
  } = useSnapshot(videoProxy)

  const [dimensions, setDimensions] = React.useState({
    width: customDimensions?.[0] ?? 0,
    height: customDimensions?.[1] ?? 0,
  })

  React.useEffect(() => {
    setDimensions({
      width: customDimensions?.[0] ?? 0,
      height: customDimensions?.[1] ?? 0,
    })
  }, [customDimensions?.[0], customDimensions?.[1]])

  const handleChange = (value: number, type: 'width' | 'height') => {
    if (!value || value <= 0) {
      return
    }
    const next = { ...dimensions, [type]: Math.round(value) }
    setDimensions(next)
    videoProxy.state.config.customDimensions = [
      next.width ?? 0,
      next.height ?? 0,
    ]
  }

  return (
    <>
      <Switch
        isSelected={shouldEnableCustomDimensions}
        onValueChange={() => {
          const next = !shouldEnableCustomDimensions
          videoProxy.state.config.shouldEnableCustomDimensions = next
          if (next && !videoProxy.state.config.customDimensions) {
            const fallbackWidth = dimensions.width || 1280
            const fallbackHeight = dimensions.height || 720
            videoProxy.state.config.customDimensions = [
              fallbackWidth,
              fallbackHeight,
            ]
          }
        }}
        isDisabled={isCompressing}
      >
        <p className="text-gray-600 dark:text-gray-400 text-sm mr-2 w-full">
          Dimensions
        </p>
      </Switch>
      <AnimatePresence mode="wait">
        {shouldEnableCustomDimensions ? (
          <motion.div
            {...slideDownTransition}
            className="mt-2 flex items-center space-x-2"
          >
            <NumberInput
              label="Width"
              className="max-w-[120px] xl:max-w-[150px]"
              value={dimensions?.width}
              onValueChange={(val) => handleChange(val, 'width')}
              labelPlacement="outside"
              classNames={{ label: '!text-gray-600 dark:!text-gray-400' }}
              isDisabled={isCompressing}
            />
            <NumberInput
              label="Height"
              className="max-w-[120px] xl:max-w-[150px]"
              value={dimensions?.height}
              onValueChange={(val) => handleChange(val, 'height')}
              labelPlacement="outside"
              classNames={{ label: '!text-gray-600 dark:!text-gray-400' }}
              isDisabled={isCompressing}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

export default React.memo(BatchDimensions)
