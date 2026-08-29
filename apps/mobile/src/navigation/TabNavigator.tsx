import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { Icon, type IconName } from '../components/Icon';
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
 * Иконки — из общего набора (`components/Icon.tsx`). Раньше здесь стояли
 * текстовые символы (⌂ ▤ ♪ ☺) с объяснением про экономию бандла; довод был
 * неверный — `@expo/vector-icons` и так приходит зависимостью `expo`.
 *
 * СТЕКЛО. Панель лежит поверх содержимого и размывает то, что под ней
 * проезжает. Это единственная стеклянная поверхность в приложении: на
 * карточках с цифрами полупрозрачность запрещена — контраст текста стал бы
 * зависеть от того, что случайно оказалось под ним при прокрутке, а списки
 * заказов смотрят в цехе при дневном свете.
 *
 * Плата за приподнятую панель — нижний отступ в каждом экране (`tabBarSpace`):
 * содержимое обязано доезжать до конца, а не прятаться под панелью.
 */
export function TabNavigator(): ReactElement {
  const insets = useSafeAreaInsets();

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
        /**
         * Нижняя безопасная зона добавляется к панели, а не игнорируется.
         *
         * Своя `tabBarStyle` перекрывает `paddingBottom`, который навигатор
         * вычисляет сам, — и панель прижимается к нижнему краю экрана вплотную,
         * наезжая на жестовую полосу iPhone и на навигационную полосу Android.
         * Иконки при этом попадают в зону системного жеста «домой»: палец
         * промахивается по вкладке и сворачивает приложение.
         */
        tabBarStyle: [styles.tabBar, { height: 64 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarLabelStyle: styles.tabLabel,
        /**
         * Подпись всегда ПОД иконкой.
         *
         * По умолчанию навигатор ставит её сбоку, когда считает экран
         * широким, — а в окне браузера это срабатывает почти всегда. Тогда
         * на подпись остаётся половина и без того узкой ячейки, и все пять
         * обрезаются до «Гл…», «Ра…», «Ch…». Под иконкой подписи хватает
         * полной ширины ячейки.
         */
        tabBarLabelPosition: 'below-icon',
        tabBarBackground: () => <TabBarGlass />,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Главная',
          /**
           * Системная шапка скрыта: у главного экрана своя.
           *
           * Без этого рисовались ДВЕ тёмно-зелёные полосы подряд — системная
           * с заголовком «Главная» и сразу под ней хвойный блок приветствия
           * того же цвета. Приветствие по макету заменяет заголовок, а не
           * дополняет его.
           */
          headerShown: false,
          tabBarIcon: ({ color }) => <TabGlyph name="home" color={color} />,
        }}
      />
      <Tab.Screen
        name="Work"
        component={WorkScreen}
        options={{
          title: 'Работа',
          tabBarIcon: ({ color }) => <TabGlyph name="work" color={color} />,
        }}
      />
      <Tab.Screen
        name="CheckInOut"
        component={CheckInOutScreen}
        options={{
          title: 'Смена',
          tabBarIcon: () => <CheckInGlyph />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Уведомления',
          tabBarIcon: ({ color }) => <TabGlyph name="notifications" color={color} />,
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
          tabBarLabel: 'Профиль',
          tabBarIcon: ({ color }) => <TabGlyph name="profile" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Стеклянная подложка панели вкладок.
 *
 * На Android размытие в `expo-blur` до 12-го уровня API работает через
 * программную реализацию и на дешёвых телефонах заметно роняет прокрутку —
 * а это ровно те телефоны, что в цехе. Поэтому там панель делается почти
 * непрозрачной без размытия: выглядит так же аккуратно, а список не дёргается.
 */
function TabBarGlass(): ReactElement {
  if (Platform.OS === 'android') {
    return <View style={[StyleSheet.absoluteFill, styles.tabBarSolid]} />;
  }

  return <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />;
}

function TabGlyph({
  name,
  color,
}: {
  readonly name: IconName;
  readonly color: string;
}): ReactElement {
  return <Icon name={name} size={22} color={color} />;
}

/** Приподнятая круглая кнопка центральной вкладки. */
function CheckInGlyph(): ReactElement {
  return (
    <View style={styles.checkInButton}>
      <Icon name="checkin" size={24} color={colors.onAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    // Панель лежит поверх содержимого, поэтому фон прозрачный: его рисует
    // `tabBarBackground`. Своя заливка перекрыла бы размытие.
    position: 'absolute',
    // Без явных координат положение считается от «статической» позиции и
    // на части Android панель отходит от нижнего края.
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    borderTopColor: colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
    elevation: 0,
  },
  tabBarSolid: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
  },
  /**
   * Подписи вкладок.
   *
   * 10 px и короткие слова: на узком экране пять подписей не помещались и
   * обрезались до «Гл…», «Ра…», «Ch…». Самой длинной была «Check In/Out» —
   * её заменили на «Смена», «Мой профиль» на «Профиль». Заголовок экрана
   * при этом остался полным: там места достаточно.
   */
  tabLabel: {
    fontSize: 10,
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
  badge: {
    backgroundColor: colors.danger,
    minWidth: 10,
    maxWidth: 10,
    height: 10,
    borderRadius: radius.pill,
    transform: [{ translateY: 2 }],
  },
});
