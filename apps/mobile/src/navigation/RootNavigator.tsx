import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import { useAuth } from '../hooks/useAuth';
import { PersonalWorkCreateScreen } from '../screens/PersonalWorkCreateScreen';
import { PurchaseMaterialsScreen } from '../screens/PurchasePricesScreen';
import { CashDeskScreen } from '../screens/CashDeskScreen';
import { DayOffScreen } from '../screens/DayOffScreen';
import { DayOffApprovalsScreen } from '../screens/DayOffApprovalsScreen';
import { EmployeesScreen } from '../screens/EmployeesScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ManagementScreen } from '../screens/ManagementScreen';
import { PayrollApprovalsScreen } from '../screens/PayrollApprovalsScreen';
import { ReadyMadeStockScreen } from '../screens/ReadyMadeStockScreen';
import { Icon } from '../components/Icon';
import { TaskAssignScreen } from '../screens/TaskAssignScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderCreateScreen } from '../screens/OrderCreateScreen';
import { RatingScreen } from '../screens/RatingScreen';
import { SaleDetailScreen } from '../screens/SaleDetailScreen';
import { SellReadyMadeScreen } from '../screens/SellReadyMadeScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskListScreen } from '../screens/TaskListScreen';
import { colors, opacity } from '../theme';
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
  const { m } = useLocale();

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
      screenOptions={{
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
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
        name="OrderCreate"
        component={OrderCreateScreen}
        options={{ title: m('nav.orderCreate') }}
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
            <Pressable
              onPress={() => {
                navigation.navigate('ReadyMadeStock');
              }}
              accessibilityRole="button"
              accessibilityLabel={m('nav.readyMadeStock')}
              hitSlop={10}
              /* Нажатие показывается прозрачностью, а не цветом: на тёмной
                 шапке любой акцентный зелёный темнее её же текста. */
              style={({ pressed }) => (pressed ? { opacity: opacity.pressed } : null)}
            >
              <Icon name="orders" size={22} color={colors.headerText} />
            </Pressable>
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
        options={{ title: m('nav.readyMadeStock') }}
      />
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
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
