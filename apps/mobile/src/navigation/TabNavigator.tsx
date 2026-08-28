import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { CheckInOutScreen } from '../screens/CheckInOutScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkScreen } from '../screens/WorkScreen';
import { trpc } from '../lib/trpc';
import { colors, radius } from '../theme';
import type { TabParamList } from '../types';

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * Нижняя панель вкладок.
 *
 * Центральная вкладка «Check In/Out» приподнята и выделена цветом: это самое
 * частое действие сотрудника за день, и оно должно попадать под большой палец
 * без прицеливания.
 *
 * Иконки нарисованы текстовыми глифами вместо иконочного шрифта: библиотека
 * иконок добавила бы мегабайты в бандл ради пяти символов.
 */
export function TabNavigator(): ReactElement {
  const unread = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Главная',
          tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} />,
        }}
      />
      <Tab.Screen
        name="Work"
        component={WorkScreen}
        options={{
          title: 'Работа',
          tabBarIcon: ({ color }) => <TabGlyph glyph="▤" color={color} />,
        }}
      />
      <Tab.Screen
        name="CheckInOut"
        component={CheckInOutScreen}
        options={{
          title: 'Смена',
          tabBarLabel: 'Check In/Out',
          tabBarIcon: () => <CheckInGlyph />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Уведомления',
          tabBarIcon: ({ color }) => <TabGlyph glyph="♪" color={color} />,
          // Показываем точку, а не число: точное количество непрочитанных
          // на бейдже вкладки не помогает — важен сам факт.
          tabBarBadge: (unread.data ?? 0) > 0 ? '' : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Мой профиль',
          tabBarIcon: ({ color }) => <TabGlyph glyph="☺" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabGlyph({
  glyph,
  color,
}: {
  readonly glyph: string;
  readonly color: string;
}): ReactElement {
  return <Text style={[styles.glyph, { color }]}>{glyph}</Text>;
}

/** Приподнятая круглая кнопка центральной вкладки. */
function CheckInGlyph(): ReactElement {
  return (
    <View style={styles.checkInButton}>
      <Text style={styles.checkInGlyph}>✓</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10.5,
  },
  glyph: {
    fontSize: 20,
    lineHeight: 24,
  },
  checkInButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  checkInGlyph: {
    color: colors.headerText,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: colors.danger,
    minWidth: 10,
    maxWidth: 10,
    height: 10,
    borderRadius: radius.pill,
    transform: [{ translateY: 2 }],
  },
});
