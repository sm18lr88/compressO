import { AnimatePresence, motion } from 'framer-motion'
import React from 'react'
import { useSnapshot } from 'valtio'

import NumberInput from '@/components/NumberInput'
import Switch from '@/components/Switch'
import { slideDownTransition } from '@/utils/animation'
import { videoProxy } from '../-state'

function BatchFPS() {
  const {
    state: {
      batch: { isCompressing },
      config: { shouldEnableCustomFPS, customFPS },
    },
  } = useSnapshot(videoProxy)

  const [fpsValue, setFpsValue] = React.useState<number>(customFPS ?? 30)

  React.useEffect(() => {
    if (typeof customFPS === 'number' && !Number.isNaN(customFPS)) {
      setFpsValue(customFPS)
    }
  }, [customFPS])

  const handleChange = (value: number) => {
    if (!value || value <= 0) {
      return
    }
    const rounded = Math.round(value)
    setFpsValue(rounded)
    videoProxy.state.config.customFPS = rounded
  }

  return (
    <>
      <Switch
        isSelected={shouldEnableCustomFPS}
        onValueChange={() => {
          const next = !shouldEnableCustomFPS
          videoProxy.state.config.shouldEnableCustomFPS = next
          if (next && typeof videoProxy.state.config.customFPS !== 'number') {
            videoProxy.state.config.customFPS = fpsValue
          }
        }}
        isDisabled={isCompressing}
      >
        <p className="text-gray-600 dark:text-gray-400 text-sm mr-2 w-full">
          FPS
        </p>
      </Switch>
      <AnimatePresence mode="wait">
        {shouldEnableCustomFPS ? (
          <motion.div {...slideDownTransition} className="mt-2">
            <NumberInput
              label="Frames Per Second"
              className="max-w-[160px]"
              value={fpsValue}
              onValueChange={handleChange}
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

export default React.memo(BatchFPS)
