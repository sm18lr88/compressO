import { core } from '@tauri-apps/api'

export function scheduleSystemShutdown(delaySeconds: number): Promise<void> {
  return core.invoke('schedule_system_shutdown', { delaySeconds })
}

export function cancelSystemShutdown(): Promise<void> {
  return core.invoke('cancel_system_shutdown')
}
