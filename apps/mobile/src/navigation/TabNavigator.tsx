import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, type ReactElement } from 'react';

import { AccountSwitcher } from '../components/AccountSwitcher';
import { Icon, type IconName } from '../components/Icon';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { CheckInOutScreen } from '../screens/CheckInOutScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkScreen } from '../screens/WorkScreen';
import { useIsCeo } from '../hooks/useAuth';
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

  /** Открыт ли список сохранённых входов. Живёт здесь — жест на вкладке. */
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);
  const isCeo = useIsCeo();

  return (
    <>
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        /**
         * Панель тёмная (хвоя), поэтому активная вкладка — белым, неактивные —
         * приглушённым светло-зелёным. Точка непрочитанного остаётся терракотой.
         */
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(233, 240, 236, 0.55)',
        /**
         * Панель ПЛАВАЕТ над содержимым — скруглённая пилюля с отступами от
         * краёв, как в утверждённом макете «Хвоя UI». Нижняя безопасная зона
         * не добавляется к высоте, а отодвигает панель от края: жестовая
         * полоса iPhone остаётся под панелью, а не под иконками.
         */
        tabBarStyle: [styles.tabBar, { bottom: Math.max(insets.bottom, 10) }],
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
      {/*
        Средняя вкладка у директора показывает другое.

        Сам он смену не открывает — свайп отметки и кольцо таймера на его
        экране были занятым местом. Вместо них явка цеха: кто пришёл, во
        сколько, кто сейчас на месте и кто на перерыве.

        Вкладка та же самая, а не добавленная рядом: панель одна на всех, и
        шестая кнопка ради одного человека сделала бы её разной у разных
        людей. Меняется только содержимое и подпись.
      */}
      <Tab.Screen
        name="CheckInOut"
        component={isCeo ? AttendanceScreen : CheckInOutScreen}
        options={{
          title: isCeo ? 'Явка' : 'Смена',
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
      {/*
        Долгое нажатие на «Профиль» открывает сохранённые входы.

        Жест, а не пункт меню: переключение аккаунтов нужно одному человеку
        в фирме — директору, который встаёт за место продавца или смотрит,
        что видит швея. Видимая кнопка задавала бы всем остальным вопрос,
        чьи это имена и можно ли туда нажимать.
      */}
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        listeners={{
          tabLongPress: () => {
            setSwitcherOpen(true);
          },
        }}
        options={{
          title: 'Мой профиль',
          tabBarLabel: 'Профиль',
          tabBarIcon: ({ color }) => <TabGlyph name="profile" color={color} />,
        }}
      />
    </Tab.Navigator>

    <AccountSwitcher
      visible={isSwitcherOpen}
      onClose={() => {
        setSwitcherOpen(false);
      }}
    />
    </>
  );
}

/**
 * Стеклянная подложка панели вкладок — ТЁМНАЯ хвоя, по макету «Хвоя UI».
 *
 * На Android размытие в `expo-blur` до 12-го уровня API работает через
 * программную реализацию и на дешёвых телефонах заметно роняет прокрутку —
 * а это ровно те телефоны, что в цехе. Поэтому там панель делается почти
 * непрозрачной без размытия: выглядит так же аккуратно, а список не дёргается.
 *
 * Поверх размытия на iOS лежит хвойная полупрозрачная заливка: голое стекло
 * над светлым списком было бы светлым, а панель по макету — тёмная.
 */
function TabBarGlass(): ReactElement {
  if (Platform.OS === 'android') {
    return <View style={[StyleSheet.absoluteFill, styles.glassRound, styles.tabBarSolid]} />;
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.glassRound]}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.tabBarTint]} />
    </View>
  );
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
    // Отступы от краёв — панель плавает пилюлей, а не тянется во всю ширину.
    left: 12,
    right: 12,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    borderRadius: 26,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
    // Тень самой панели: плавающий элемент без тени выглядит наклейкой.
    shadowColor: '#0A1A13',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  /** Скругление подложки — стекло обязано обрезаться по форме пилюли. */
  glassRound: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  tabBarSolid: {
    backgroundColor: 'rgba(17, 38, 30, 0.97)',
  },
  tabBarTint: {
    backgroundColor: 'rgba(14, 33, 26, 0.72)',
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
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    // Ободок цвета панели отделяет кнопку от стекла под ней: без него
    // приподнятый круг сливался с тёмной пилюлей в одно пятно.
    borderWidth: 3,
    borderColor: colors.header,
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
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
