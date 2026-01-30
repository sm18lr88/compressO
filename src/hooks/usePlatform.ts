/**
 * Current platform
 * @returns {string}: 'linux', 'macos', 'ios', 'freebsd', 'dragonfly', 'netbsd', 'openbsd', 'solaris', 'android', 'windows'. Returns null for unsupported platform.
 */
type PlatformInfo = {
  name: string
  isLinux: boolean
  isMac: boolean
  isWindows: boolean
}

export function usePlatform(): PlatformInfo {
  const platform = window.navigator.userAgent.toLowerCase()
  return {
    name: platform,
    isLinux: platform.includes('linux'),
    isMac: platform.includes('mac'),
    isWindows: platform.includes('windows'),
  }
}
