import { MONITOR_GROUP_LABELS } from '@curtain-crm/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createNativeStackNavigator, type NativeStackHeaderLeftProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ReactElement, ReactNode } from 'react';

import { useAuth } from '../hooks/useAuth';
import { PersonalWorkCreateScreen } from '../screens/PersonalWorkCreateScreen';
import { PurchaseMaterialsScreen } from '../screens/PurchasePricesScreen';
import { CashDeskScreen } from '../screens/CashDeskScreen';
import { DayOffScreen } from '../screens/DayOffScreen';
import { DayOffApprovalsScreen } from '../screens/DayOffApprovalsScreen';
import { EmployeesScreen } from '../screens/EmployeesScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ManagementScreen } from '../screens/ManagementScreen';
import { MonitorBoardScreen } from '../screens/MonitorBoardScreen';
import { MonitorPersonScreen } from '../screens/MonitorPersonScreen';
import { PayrollApprovalsScreen } from '../screens/PayrollApprovalsScreen';
import { ReadyMadeStockScreen } from '../screens/ReadyMadeStockScreen';
import { Icon } from '../components/Icon';
import { TaskAssignScreen } from '../screens/TaskAssignScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderCreateScreen } from '../screens/OrderCreateScreen';
import { OrderEditScreen } from '../screens/OrderEditScreen';
import { RatingBoardScreen } from '../screens/RatingBoardScreen';
import { RatingScreen } from '../screens/RatingScreen';
import { SaleDetailScreen } from '../screens/SaleDetailScreen';
import { SellReadyMadeScreen } from '../screens/SellReadyMadeScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskListScreen } from '../screens/TaskListScreen';
import { TerminalChecksScreen } from '../screens/TerminalChecksScreen';
import { colors, fonts, opacity, spacing } from '../theme';
import type { RootStackParamList } from '../types';

import { TabNavigator } from './TabNavigator';
import { useLocale } from '../hooks/useLocale';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Корневой навигатор.
 *
 * Экран входа и основное приложение — ДВА РАЗНЫХ дерева навигации, а не
 * экраны одного стека: так после выхода невозможно вернуться «назад» в
 * авторизованную часть, а после входа — назад на экран входа.
 */
export function RootNavigator(): ReactElement {
  const { user, isRestoring } = useAuth();
  const { m, locale } = useLocale();

  if (isRestoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (user === null) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17, fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
        /*
          Кнопка «назад» в браузере — своя.

          Шапку на вебе рисует не система, а react-navigation, и его кнопка
          была ссылкой 30×30 (меньше пальца) с подписью для программы
          чтения с экрана «Tabs, back» — по-английски и именем маршрута.
          Здесь — цель 48×48 и стрелка там же, где у шапки Android (16 от
          края). На телефоне остаётся системная кнопка — она и так такая.
        */
        ...(Platform.OS === 'web'
          ? {
              headerLeft: ({ canGoBack }: NativeStackHeaderLeftProps) =>
                canGoBack === true ? (
                  <HeaderIconButton label={m('common.back')} edge="left" onPress={navigation.goBack}>
                    <Ionicons name="arrow-back" size={24} color={colors.headerText} />
                  </HeaderIconButton>
                ) : null,
            }
          : null),
      })}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: m('nav.order') }}
      />
      <Stack.Screen name="TaskList" component={TaskListScreen} options={{ title: m('nav.taskList') }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ title: m('nav.rating') }} />
      <Stack.Screen
        name="RatingBoard"
        component={RatingBoardScreen}
        options={{ title: m('nav.ratingBoard') }}
      />
      <Stack.Screen
        name="OrderEdit"
        component={OrderEditScreen}
        options={{ title: m('nav.editOrder') }}
      />
      <Stack.Screen
        name="OrderCreate"
        component={OrderCreateScreen}
        options={({ route }) => ({
          title: route.params?.mode === 'stock' ? m('nav.orderCreateStock') : m('nav.orderCreate'),
        })}
      />
      {/*
        Склад открывается из шапки самой продажи, а не отдельной кнопкой на
        экране «Работа».

        Там она стояла третьей в ряду с «Новым заказом» и «Кассой» и
        занимала место наравне с ними, хотя это не отдельное дело, а
        оборотная сторона одного: продавец либо продаёт готовую штору, либо
        кладёт её на полку. Обе половины теперь на одном экране.
      */}
      <Stack.Screen
        name="SellReadyMade"
        component={SellReadyMadeScreen}
        options={({ navigation }) => ({
          title: m('nav.readyMade'),
          headerRight: () => (
            <HeaderIconButton
              label={m('nav.readyMadeStock')}
              edge="right"
              onPress={() => {
                navigation.navigate('ReadyMadeStock');
              }}
            >
              <Icon name="orders" size={22} color={colors.headerText} />
            </HeaderIconButton>
          ),
        })}
      />
      <Stack.Screen
        name="DayOff"
        component={DayOffScreen}
        options={{ title: m('nav.dayOff') }}
      />
      <Stack.Screen
        name="PersonalWorkCreate"
        component={PersonalWorkCreateScreen}
        options={{ title: m('nav.personalWork') }}
      />
      <Stack.Screen
        name="CashDesk"
        component={CashDeskScreen}
        options={{ title: m('nav.cashDesk') }}
      />
      <Stack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ title: m('nav.receipt') }}
      />
      <Stack.Screen
        name="Management"
        component={ManagementScreen}
        options={{ title: m('nav.management') }}
      />
      <Stack.Screen
        name="DayOffApprovals"
        component={DayOffApprovalsScreen}
        options={{ title: m('nav.dayOffApprovals') }}
      />
      <Stack.Screen
        name="PayrollApprovals"
        component={PayrollApprovalsScreen}
        options={{ title: m('nav.payroll') }}
      />
      <Stack.Screen
        name="TaskAssign"
        component={TaskAssignScreen}
        options={{ title: m('nav.tasks') }}
      />
      <Stack.Screen
        name="ReadyMadeStock"
        component={ReadyMadeStockScreen}
        // «Продать» и «Пошив для склада» — кнопками на самом экране, а не
        // значком в шапке: подпись читается, значок — угадывается.
        options={{ title: m('nav.readyMadeStock') }}
      />
      <Stack.Screen
        name="MonitorBoard"
        component={MonitorBoardScreen}
        options={({ route }) => ({ title: MONITOR_GROUP_LABELS[locale][route.params.group] })}
      />
      <Stack.Screen name="MonitorPerson" component={MonitorPersonScreen} options={{ title: m('monitor.title') }} />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: m('nav.task') }}
      />
      <Stack.Screen
        name="PurchasePrices"
        component={PurchaseMaterialsScreen}
        options={{ title: m('nav.purchasePrices') }}
      />
      <Stack.Screen
        name="Employees"
        component={EmployeesScreen}
        options={{ title: m('nav.employees') }}
      />
      <Stack.Screen
        name="TerminalChecks"
        component={TerminalChecksScreen}
        options={{ title: m('nav.terminalChecks') }}
      />
    </Stack.Navigator>
  );
}

/**
 * Значок-кнопка в шапке.
 *
 * В браузере у неё своя рамка 48×48 с отступом от края: `hitSlop` веб не
 * поддерживает, и значок «склада» в шапке продажи был целью 22×24,
 * прижатой вплотную к правому краю экрана. На телефоне шапку раскладывает
 * система — с её отступами, а `hitSlop` добирает цель до пальца.
 */
function HeaderIconButton({
  label,
  edge,
  onPress,
  children,
}: {
  readonly label: string;
  readonly edge: 'left' | 'right';
  readonly onPress: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      /* Нажатие показывается прозрачностью, а не цветом: на тёмной
         шапке любой акцентный зелёный темнее её же текста. */
      style={({ pressed }) => [
        Platform.OS === 'web' ? styles.webHeaderButton : null,
        Platform.OS === 'web' ? (edge === 'left' ? styles.webHeaderLeft : styles.webHeaderRight) : null,
        pressed ? { opacity: opacity.pressed } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  webHeaderButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webHeaderLeft: {
    marginLeft: spacing.xs,
  },
  webHeaderRight: {
    marginRight: spacing.xs,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
