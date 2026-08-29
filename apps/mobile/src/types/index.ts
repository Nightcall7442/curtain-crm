import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * Карты маршрутов навигации.
 *
 * Типизированы целиком: попытка перейти на несуществующий экран или забыть
 * обязательный параметр (`orderId`) не доживёт до рантайма.
 */

/** Стек внутри вкладок: детальные экраны, открывающиеся поверх табов. */
export type RootStackParamList = {
  Tabs: undefined;
  OrderDetail: { orderId: number };
  TaskList: undefined;
  Rating: undefined;
  OrderCreate: undefined;
};

export type RootStackScreenProps<TRoute extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, TRoute>;

/** Вкладки нижней панели. */
export type TabParamList = {
  Home: undefined;
  Work: undefined;
  CheckInOut: undefined;
  Notifications: undefined;
  Profile: undefined;
};

/**
 * Регистрация типов в глобальном пространстве React Navigation.
 *
 * Даёт типобезопасный `useNavigation()` без явного параметра типа
 * в каждом экране.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
