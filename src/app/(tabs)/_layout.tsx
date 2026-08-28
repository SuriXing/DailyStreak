import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Sidebar } from '@/components/sidebar';
import { useTheme } from '@/hooks/use-theme';

/** 桌面断点：≥900px 显示左侧边栏，隐藏底部 Tab */
export const DESKTOP_BREAKPOINT = 900;

export default function TabsLayout() {
  const colors = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          display: isDesktop ? 'none' : 'flex',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '打卡',
          tabBarIcon: ({ color, size }) => <Ionicons name="flame" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="study"
        options={{
          title: '学习',
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );

  if (!isDesktop) {
    return tabs;
  }

  return (
    <View style={styles.desktopRow}>
      <Sidebar />
      <View style={styles.desktopContent}>{tabs}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  desktopRow: { flex: 1, flexDirection: 'row' },
  desktopContent: { flex: 1 },
});
