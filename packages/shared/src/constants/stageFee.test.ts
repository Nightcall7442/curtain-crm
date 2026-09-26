import { describe, expect, it } from 'vitest';

import { OrderStatus } from '../enums/orderStatus.enum';
import { OrderType } from '../enums/orderType.enum';
import { OrderStageFee, stageFeesOfOrderType } from './stageFee';

describe('stageFeesOfOrderType', () => {
  it('обычный заказ — все этапы по порядку', () => {
    expect(stageFeesOfOrderType(OrderType.CUSTOM)).toEqual([
      OrderStageFee.MEASUREMENT,
      OrderStageFee.CUTTING,
      OrderStageFee.SEWING,
      OrderStageFee.QC,
      OrderStageFee.CORNICE,
      OrderStageFee.INSTALLATION,
    ]);
  });

  it('пошив для склада — без замера и установки', () => {
    expect(stageFeesOfOrderType(OrderType.STOCK)).toEqual([
      OrderStageFee.CUTTING,
      OrderStageFee.SEWING,
      OrderStageFee.QC,
    ]);
  });

  it('готовые шторы без статуса или на установке — только установка', () => {
    expect(stageFeesOfOrderType(OrderType.READY_MADE)).toEqual([OrderStageFee.INSTALLATION]);
    expect(stageFeesOfOrderType(OrderType.READY_MADE, OrderStatus.NEW)).toEqual([
      OrderStageFee.INSTALLATION,
    ]);
    expect(
      stageFeesOfOrderType(OrderType.READY_MADE, OrderStatus.PENDING_INSTALLATION_ASSIGNMENT),
    ).toEqual([OrderStageFee.INSTALLATION]);
    expect(stageFeesOfOrderType(OrderType.READY_MADE, OrderStatus.COMPLETED)).toEqual([
      OrderStageFee.INSTALLATION,
    ]);
  });

  it('готовые шторы, ушедшие в переделку — как обычный заказ: можно назначить швею', () => {
    expect(
      stageFeesOfOrderType(OrderType.READY_MADE, OrderStatus.PENDING_SEWING_ASSIGNMENT),
    ).toEqual(stageFeesOfOrderType(OrderType.CUSTOM));
    expect(stageFeesOfOrderType(OrderType.READY_MADE, OrderStatus.QC_PASSED)).toContain(
      OrderStageFee.SEWING,
    );
  });
});
