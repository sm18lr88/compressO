import {
  Dropdown as NextUIDropdown,
  DropdownItem as NextUIDropdownItem,
  DropdownMenu as NextUIDropdownMenu,
  type DropdownProps as NextUIDropdownProps,
  DropdownTrigger as NextUIDropdownTrigger,
} from '@heroui/dropdown'

import { blurCSS } from '@/ui/BackdropBlur'
import { getPlatform } from '@/utils/fs'
import { cn } from '@/utils/tailwind'

const { isWindows, isMacOS } = getPlatform()

interface DropdownProps extends NextUIDropdownProps {}
function Dropdown(props: DropdownProps) {
  return (
    <NextUIDropdown
      {...props}
      className={cn([isMacOS || isWindows ? blurCSS : '', props?.className])}
    />
  )
}

// Re-export directly to preserve React Aria collection mechanism
export const DropdownTrigger = NextUIDropdownTrigger
export const DropdownMenu = NextUIDropdownMenu
export const DropdownItem = NextUIDropdownItem

export default Dropdown
