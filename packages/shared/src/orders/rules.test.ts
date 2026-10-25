import { describe, expect, it } from 'vitest';

import { OrderStatus } from '../enums/orderStatus.enum';
import { OrderType } from '../enums/orderType.enum';
import { Role } from '../enums/role.enum';
import {
  canEditOrder,
  canSeeClientMoney,
  closeBlockedByDebt,
  currentExecutorRole,
  editedMaterialMeters,
  isAwaitingPayment,
  mountSlotsToSend,
} from './rules';
import { CurtainMountKind } from '../constants/catalog';

describe('исполнитель этапа', () => {
  it('пошив — швея', () => expect(currentExecutorRole(OrderStatus.SEWING_IN_PROGRESS)).toBe(Role.SEWER));
  it('брак — контролёр', () => expect(currentExecutorRole(OrderStatus.QC_FAILED)).toBe(Role.QC));
  it('установка завершена — установщик', () =>
    expect(currentExecutorRole(OrderStatus.INSTALLATION_DONE)).toBe(Role.INSTALLER));
  it('новый и закрытый — никого', () => {
    expect(currentExecutorRole(OrderStatus.NEW)).toBeNull();
    expect(currentExecutorRole(OrderStatus.COMPLETED)).toBeNull();
  });
});

describe('правка заказа', () => {
  const seller = { id: 5, roles: [Role.SELLER] };
  const manager = { id: 9, roles: [Role.MANAGER] };

  it('продавец — свой новый', () =>
    expect(canEditOrder({ status: OrderStatus.NEW, createdBy: 5 }, seller)).toBe(true));
  it('продавец — свой принятый нельзя', () =>
    expect(canEditOrder({ status: OrderStatus.SEWING_IN_PROGRESS, createdBy: 5 }, seller)).toBe(false));
  it('продавец — чужой нельзя', () =>
    expect(canEditOrder({ status: OrderStatus.NEW, createdBy: 6 }, seller)).toBe(false));
  it('менеджер — любой открытый', () =>
    expect(canEditOrder({ status: OrderStatus.INSTALLATION_DONE, createdBy: 5 }, manager)).toBe(true));
  it('закрытый и отменённый — никто', () => {
    expect(canEditOrder({ status: OrderStatus.COMPLETED, createdBy: 9 }, manager)).toBe(false);
    expect(
      canEditOrder({ status: OrderStatus.CANCELLED, createdBy: 9 }, { id: 1, roles: [Role.CEO] }),
    ).toBe(false);
  });
});

describe('долг блокирует закрытие', () => {
  it('остаток больше нуля', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '800000.00' })).toBe(true));
  it('ноль и переплата — нет', () => {
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '0.00' })).toBe(false);
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: '-100.00' })).toBe(false);
  });
  it('пошив на склад — нет', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.STOCK, remainingPayment: '5.00' })).toBe(false));
  it('сумма скрыта — не решаем за сервер', () =>
    expect(closeBlockedByDebt({ orderType: OrderType.CUSTOM, remainingPayment: null })).toBe(false));
  it('ждёт оплаты — только после установки', () => {
    const debt = { orderType: OrderType.CUSTOM, remainingPayment: '10.00' };
    expect(isAwaitingPayment({ ...debt, status: OrderStatus.INSTALLATION_DONE })).toBe(true);
    expect(isAwaitingPayment({ ...debt, status: OrderStatus.SEWING_IN_PROGRESS })).toBe(false);
  });
});

describe('деньги клиента', () => {
  it('цех не видит', () => expect(canSeeClientMoney([Role.SEWER, Role.INSTALLER])).toBe(false));
  it('продавец и менеджер видят', () => {
    expect(canSeeClientMoney([Role.SELLER])).toBe(true);
    expect(canSeeClientMoney([Role.MANAGER])).toBe(true);
  });
});

describe('метраж при правке позиции', () => {
  it('код прежний — метраж остаётся', () =>
    expect(editedMaterialMeters({ code: 'П-31 ', originalCode: 'П-31', meters: 3.5 })).toBe(3.5));
  it('код сменили — метраж сброшен', () =>
    expect(editedMaterialMeters({ code: 'П-40', originalCode: 'П-31', meters: 3.5 })).toBeNull());
  it('новый материал — без метража', () =>
    expect(editedMaterialMeters({ code: 'П-40', originalCode: null, meters: null })).toBeNull());
});

describe('строки крепления при отправке позиции', () => {
  it('труба — без карниза и пластика', () =>
    expect(mountSlotsToSend(CurtainMountKind.PIPE)).toEqual({ cornice: false, pipe: true }));
  it('карниз — без трубы', () =>
    expect(mountSlotsToSend(CurtainMountKind.CORNICE)).toEqual({ cornice: true, pipe: false }));
  it('модель неизвестна справочнику — ничего не отбрасываем', () =>
    expect(mountSlotsToSend(null)).toEqual({ cornice: true, pipe: true }));
});
