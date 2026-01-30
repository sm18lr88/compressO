import {
  Tab as NextUITab,
  Tabs as NextUITabs,
  type TabsProps as NextUITabsProps,
} from '@heroui/tabs'

interface TabsProps extends NextUITabsProps {}

function Tabs(props: TabsProps) {
  return <NextUITabs {...props} />
}

// Re-export directly to preserve React Aria collection mechanism
export const Tab = NextUITab

export default Tabs
