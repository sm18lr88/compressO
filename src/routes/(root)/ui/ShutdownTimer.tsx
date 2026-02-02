import { SelectItem } from '@heroui/select'
import React from 'react'
import { useSnapshot } from 'valtio'

import Select from '@/components/Select'
import Tooltip from '@/components/Tooltip'
import { videoProxy } from '../-state'

function ShutdownTimer() {
  const {
    state: {
      batch: { isCompressing, config },
    },
  } = useSnapshot(videoProxy)

  const options = React.useMemo(
    () => [
      { key: '0', label: 'No' },
      { key: '600', label: '10' },
      { key: '1800', label: '30' },
      { key: '3600', label: '60' },
    ],
    [],
  )

  const selectedDelayValue = React.useMemo(() => {
    const delaySeconds = config.shutdownTimer.delaySeconds
    const match = options.find((option) => Number(option.key) === delaySeconds)
    return match?.key ?? '0'
  }, [config.shutdownTimer.delaySeconds, options])

  return (
    <div className="flex items-center gap-2">
      <Tooltip
        content="Automatically shut down your computer after batch processing completes."
        placement="top"
        delay={500}
      >
        <p className="text-gray-600 dark:text-gray-400 text-sm cursor-help whitespace-nowrap">
          Auto-shutdown
        </p>
      </Tooltip>
      <Select
        aria-label="Auto-shutdown delay"
        size="sm"
        className="max-w-[78px]"
        selectedKeys={[selectedDelayValue]}
        value={selectedDelayValue}
        onChange={(evt) => {
          const nextValue = Number(evt?.target?.value ?? 0)
          videoProxy.state.batch.config.shutdownTimer.delaySeconds = nextValue
        }}
        isDisabled={isCompressing}
      >
        {options.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
      <p className="text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
        minutes
      </p>
    </div>
  )
}

export default React.memo(ShutdownTimer)
