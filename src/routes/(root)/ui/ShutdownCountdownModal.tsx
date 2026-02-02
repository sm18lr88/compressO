import React from 'react'
import { useSnapshot } from 'valtio'

import Button from '@/components/Button'
import Icon from '@/components/Icon'
import Modal, {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/Modal'
import { toast } from '@/components/Toast'
import { cancelSystemShutdown } from '@/tauri/commands/system'
import { videoProxy } from '../-state'

interface ShutdownCountdownModalProps {
  isOpen: boolean
  onClose: () => void
}

function ShutdownCountdownModal({
  isOpen,
  onClose,
}: ShutdownCountdownModalProps) {
  const {
    state: {
      batch: { shutdownTimerState },
    },
  } = useSnapshot(videoProxy)

  const [isCancelling, setIsCancelling] = React.useState(false)

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await cancelSystemShutdown()
      videoProxy.state.batch.shutdownTimerState.isPending = false
      videoProxy.state.batch.shutdownTimerState.secondsRemaining = null
      if (videoProxy.state.batch.shutdownTimerState.timerId) {
        clearInterval(videoProxy.state.batch.shutdownTimerState.timerId)
        videoProxy.state.batch.shutdownTimerState.timerId = null
      }
      toast.success('Shutdown cancelled successfully.')
      onClose()
    } catch (error) {
      toast.error('Failed to cancel shutdown: ' + String(error))
    } finally {
      setIsCancelling(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} isDismissable={false}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Icon name="logo" size={24} />
            <span>Shutdown Scheduled</span>
          </div>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-6xl font-bold text-primary">
              {shutdownTimerState.secondsRemaining !== null
                ? formatTime(shutdownTimerState.secondsRemaining)
                : '--:--'}
            </div>
            <p className="text-center text-gray-600 dark:text-gray-400">
              Your computer will shut down automatically.
              <br />
              Save your work now!
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            color="danger"
            variant="flat"
            onPress={handleCancel}
            isLoading={isCancelling}
            isDisabled={isCancelling}
            fullWidth
          >
            Cancel Shutdown
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default React.memo(ShutdownCountdownModal)
