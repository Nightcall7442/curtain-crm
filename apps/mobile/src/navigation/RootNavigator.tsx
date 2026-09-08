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
          title: 'Готовые шторы',
          headerRight: () => (
            <Pressable
              onPress={() => {
                navigation.navigate('ReadyMadeStock');
              }}
              accessibilityRole="button"
              accessibilityLabel="Склад готовых штор"
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
        name="ReadyMadeStock"
        component={ReadyMadeStockScreen}
        options={{ title: 'Склад готовых штор' }}
      />
      <Stack.Screen
        name="TaskDetail"
        component={TaskDetailScreen}
        options={{ title: 'Поручение' }}
      />
      <Stack.Screen
        name="PurchasePrices"
        component={PurchaseMaterialsScreen}
        options={{ title: 'Закупочные материалы' }}
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
