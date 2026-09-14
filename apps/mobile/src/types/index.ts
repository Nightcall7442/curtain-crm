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
  /**
   * `mode: 'stock'` — тот же экран заводит пошив для склада: без клиента и
   * установки, той же формой позиций. Кнопка «Готовые шторы» на «Работе»
   * открывает именно этот режим — продажа с полки переехала на экран склада.
   */
  OrderCreate: { mode?: 'custom' | 'stock' } | undefined;
  SellReadyMade: undefined;
  DayOff: undefined;
  PersonalWorkCreate: undefined;
  CashDesk: undefined;
  SaleDetail: { saleId: number };
  TaskDetail: { taskId: number };
  PurchasePrices: undefined;
  Employees: undefined;

  /*
    Экраны руководителя. Отдельной вкладки им не дали намеренно: нижняя
    панель одна на всех, и пятая вкладка, видимая двоим из восемнадцати,
    сделала бы её разной у разных людей.
  */
  Management: undefined;
  DayOffApprovals: undefined;
  PayrollApprovals: undefined;
  TaskAssign: undefined;
  ReadyMadeStock: undefined;
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
    /*
      Вкладки включены наравне со стеком.

      React Navigation умеет переходить на вкладку из экрана, лежащего
      внутри неё, — `navigate('Profile')` с любого экрана работает. Но пока
      здесь был только `RootStackParamList`, компилятор о вкладках не знал
      и такой переход не пропускал, хотя в рантайме он законен.
    */
    interface RootParamList extends RootStackParamList, TabParamList {}
  }
}
