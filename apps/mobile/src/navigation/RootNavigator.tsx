import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { ReactElement } from 'react';

import { useAuth } from '../hooks/useAuth';
import { PersonalWorkCreateScreen } from '../screens/PersonalWorkCreateScreen';
import { PurchasePricesScreen } from '../screens/PurchasePricesScreen';
import { CashDeskScreen } from '../screens/CashDeskScreen';
import { DayOffScreen } from '../screens/DayOffScreen';
import { DayOffApprovalsScreen } from '../screens/DayOffApprovalsScreen';
import { EmployeesScreen } from '../screens/EmployeesScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ManagementScreen } from '../screens/ManagementScreen';
import { PayrollApprovalsScreen } from '../screens/PayrollApprovalsScreen';
import { RetailStockScreen } from '../screens/RetailStockScreen';
import { TaskAssignScreen } from '../screens/TaskAssignScreen';
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { OrderCreateScreen } from '../screens/OrderCreateScreen';
import { RatingScreen } from '../screens/RatingScreen';
import { SaleDetailScreen } from '../screens/SaleDetailScreen';
import { SellReadyMadeScreen } from '../screens/SellReadyMadeScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TaskListScreen } from '../screens/TaskListScreen';
import { colors } from '../theme';
import type { RootStackParamList } from '../types';

import { TabNavigator } from './TabNavigator';

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
        options={{ title: 'Заказ' }}
      />
      <Stack.Screen name="TaskList" component={TaskListScreen} options={{ title: 'Мои задачи' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ title: 'Рейтинг' }} />
      <Stack.Screen
        name="OrderCreate"
        component={OrderCreateScreen}
        options={{ title: 'Новый заказ' }}
      />
      <Stack.Screen
        name="SellReadyMade"
        component={SellReadyMadeScreen}
        options={{ title: 'Готовые шторы' }}
      />
      <Stack.Screen
        name="DayOff"
        component={DayOffScreen}
        options={{ title: 'Запрос на выходные' }}
      />
      <Stack.Screen
        name="PersonalWorkCreate"
        component={PersonalWorkCreateScreen}
        options={{ title: 'Личная работа' }}
      />
      <Stack.Screen
        name="CashDesk"
        component={CashDeskScreen}
        options={{ title: 'Касса' }}
      />
      <Stack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ title: 'Чек' }}
      />
      <Stack.Screen
        name="Management"
        component={ManagementScreen}
        options={{ title: 'Руководство' }}
      />
      <Stack.Screen
        name="DayOffApprovals"
        component={DayOffApprovalsScreen}
        options={{ title: 'Отгулы' }}
      />
      <Stack.Screen
        name="PayrollApprovals"
        component={PayrollApprovalsScreen}
        options={{ title: 'Зарплата' }}
      />
      <Stack.Screen
        name="TaskAssign"
        component={TaskAssignScreen}
        options={{ title: 'Поручения' }}
      />
      <Stack.Screen
        name="RetailStock"
        component={RetailStockScreen}
        options={{ title: 'Витрина' }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: 'Поручение' }}
      />
      <Stack.Screen
        name="PurchasePrices"
        component={PurchasePricesScreen}
        options={{ title: 'Закупочные цены' }}
      />
      <Stack.Screen
        name="Employees"
        component={EmployeesScreen}
        options={{ title: 'Сотрудники' }}
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
