import { useWindowDimensions } from 'react-native';

/** 桌面断点：与 (tabs)/_layout 保持一致 */
export const DESKTOP_BREAKPOINT = 900;

/** 是否为桌面宽度（≥900px），用于响应式布局切换 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}
