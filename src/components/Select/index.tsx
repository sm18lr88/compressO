import {
  Select as NextUISelect,
  SelectItem as NextUISelectItem,
  type SelectProps as NextUISelectProps,
} from '@heroui/select'

import { blurCSS } from '@/ui/BackdropBlur'
import { getPlatform } from '@/utils/fs'
import { cn } from '@/utils/tailwind'

const { isWindows, isMacOS } = getPlatform()

interface SelectProps extends NextUISelectProps {}
function Select(props: SelectProps) {
  return (
    <NextUISelect
      radius="sm"
      size="sm"
      labelPlacement="outside"
      {...props}
      classNames={{
        popoverContent: cn([
          'z-[70]',
          isWindows || isMacOS ? blurCSS : '',
          props?.classNames?.popoverContent ?? '',
        ]),
        ...(props?.classNames ?? {}),
      }}
    />
  )
}

// Re-export directly to preserve React Aria collection mechanism
export const SelectItem = NextUISelectItem

export default Select
