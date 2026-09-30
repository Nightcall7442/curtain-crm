import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordAuditInput } from './audit.service';
import {
  describeForGroup,
  describePhotoAlbum,
  queueOrderPhotoForGroup,
  type FeedContext,
  type FeedOrder,
} from './groupFeed.service';
import { sendTelegramGroupPhotos } from './telegram.service';

vi.mock('./telegram.service', () => ({
  isTelegramGroupEnabled: () => true,
  sendTelegramGroupMessage: vi.fn(),
  sendTelegramGroupPhotos: vi.fn(),
}));

/**
 * Текст ленты — чистая функция, проверяется без базы и без Telegram.
 * Детали событий — ровно те, что пишут роутеры и `orderWorkflow`.
 */

const noAssignees = { master: null, sewer: null, qc: null, cornice_installer: null, installer: null };

/** Заказ DH-000007: швея — Karimova Nodira (id 23). */
const order: FeedOrder = {
  label: 'DH-000007',
  clientName: 'Aliyev Vali',
  orderType: 'custom',
  assignees: { ...noAssignees, sewer: 23 },
};

/** Действует админ Rustamov Muzaffar (id 5). */
const context: FeedContext = {
  order,
  names: new Map([
    [5, 'Rustamov Muzaffar'],
    [23, 'Karimova Nodira'],
  ]),
  actorRoles: ['admin'],
};

const event = (input: Partial<RecordAuditInput> & Pick<RecordAuditInput, 'action'>): RecordAuditInput => ({
  actorId: 5,
  entityType: 'order',
  entityId: 7,
  ...input,
});

describe('describeForGroup', () => {
  it('смена статуса — номер заказа, клиент, подписи статусов и роль автора', () => {
    const feed = describeForGroup(
      event({
        action: 'order.status_changed',
        details: { fromStatus: 'pending_admin_review', toStatus: 'pending_sewing_assignment', comment: null, systemInitiated: false },
      }),
      context,
      'uz',
    );

    expect(feed).toEqual({
      title: 'Buyurtma DH-000007: Tikuvchi tayinlanishini kutmoqda',
      body: 'Mijoz: Aliyev Vali\nOldingi holat: Admin tekshiruvini kutmoqda\nAdministrator: Rustamov Muzaffar',
    });
  });

  it('швея, начавшая пошив, подписана «Tikuvchi», а не «Kim»', () => {
    const feed = describeForGroup(
      event({
        actorId: 23,
        action: 'order.status_changed',
        details: { fromStatus: 'pending_sewing_assignment', toStatus: 'sewing_in_progress' },
      }),
      { ...context, actorRoles: ['sewer'] },
      'uz',
    );

    expect(feed).toEqual({
      title: 'Buyurtma DH-000007: Tikilmoqda',
      body: 'Mijoz: Aliyev Vali\nOldingi holat: Tikuvchi tayinlanishini kutmoqda\nTikuvchi: Karimova Nodira',
    });
  });

  it('админ, назначенный в заказе ОТК, на проверке админа подписан админом', () => {
    const feed = describeForGroup(
      event({
        action: 'order.status_changed',
        details: { fromStatus: 'pending_admin_review', toStatus: 'pending_sewing_assignment' },
      }),
      { ...context, order: { ...order, assignees: { ...order.assignees, qc: 5 } }, actorRoles: ['admin', 'qc'] },
      'uz',
    );

    expect(feed?.body.split('\n').at(-1)).toBe('Administrator: Rustamov Muzaffar');
  });

  it('переход из «Нового» объявляется как новый заказ', () => {
    const feed = describeForGroup(
      event({ action: 'order.status_changed', details: { fromStatus: 'new', toStatus: 'pending_admin_review' } }),
      context,
      'ru',
    );

    expect(feed?.title).toBe('Новый заказ DH-000007');
    expect(feed?.body).toBe('Клиент: Aliyev Vali\nСтатус: Ждёт проверки админа\nАдминистратор: Rustamov Muzaffar');
  });

  it('назначение — имя исполнителя и роль, а не id', () => {
    const feed = describeForGroup(
      event({ action: 'order.assignee_changed', details: { role: 'qc', from: null, to: 23 } }),
      context,
      'uz',
    );

    expect(feed).toEqual({
      title: 'DH-000007 buyurtmasiga ijrochi tayinlandi',
      body: 'Mijoz: Aliyev Vali\nSifat nazorati: Karimova Nodira\nAdministrator: Rustamov Muzaffar',
    });
  });

  it('у пошива для склада вместо клиента-заглушки — тип заказа', () => {
    const feed = describeForGroup(
      event({ action: 'order.cancelled', details: { fromStatus: 'pending_admin_review', toStatus: 'cancelled', comment: 'Дубль' } }),
      { ...context, order: { label: 'TDH-000008', clientName: 'Склад', orderType: 'stock', assignees: noAssignees } },
      'ru',
    );

    expect(feed?.body).toBe('Тип: Пошив для склада\nПричина: Дубль\nАдминистратор: Rustamov Muzaffar');
  });

  it('деньги, права и служебные действия в группу не идут', () => {
    const hidden: RecordAuditInput[] = [
      event({ action: 'order.price_changed', details: { from: { workPrice: '0.00' }, to: { workPrice: '5000000.00' } } }),
      event({ action: 'order.stage_fees_changed', details: { from: {}, to: { sewingFee: '50000.00' } } }),
      event({ action: 'order.item_meters_changed', details: { itemId: 44, meters: { tulle: 15 } } }),
      event({ action: 'order.created', details: { clientName: 'Aliyev Vali', itemsCount: 1 } }),
      event({ action: 'user.role_granted', entityType: 'user', entityId: 23, details: { role: 'qc', viaOrderAssignment: true } }),
      event({ action: 'payment.received', details: { payment: '100000.00', method: 'cash' } }),
      event({ action: 'payroll.paid', entityType: 'payroll_record', details: { payment: '1000000.00' } }),
      // Дисциплина не про явку — разговор руководства с человеком, не новость для группы.
      event({ action: 'discipline.recorded', entityType: 'discipline_event', details: { kind: 'client_complaint', userId: 23, points: -3 } }),
      event({ action: 'discipline.recorded', entityType: 'discipline_event', details: { kind: 'helped_team', userId: 23, points: 1 } }),
    ];

    for (const input of hidden) {
      expect(describeForGroup(input, context, 'uz'), input.action).toBeNull();
    }
  });

  it('продажа готовой шторы — без цены, продавец подписан ролью', () => {
    const feed = describeForGroup(
      event({
        action: 'ready_made_item.sold',
        entityType: 'ready_made_item',
        entityId: 3,
        details: { model: 'Blackout 2x2.6', quantity: 2, stockAfter: 5, orderId: 9 },
      }),
      {
        ...context,
        order: { label: 'TDH-000009', clientName: 'Aliyev Vali', orderType: 'ready_made', assignees: noAssignees },
        actorRoles: ['seller'],
      },
      'uz',
    );

    expect(feed).toEqual({
      title: 'Tayyor parda sotildi',
      body: 'Blackout 2x2.6 — 2 dona\nQoldi: 5 dona\nBuyurtma: TDH-000009\nSotuvchi: Rustamov Muzaffar',
    });
  });
});

describe('опоздания и прогулы в ленте', () => {
  const lateContext: FeedContext = { ...context, order: null, actorRoles: ['sewer'] };
  const disciplineEvent = (input: Partial<RecordAuditInput>): RecordAuditInput =>
    event({ action: 'discipline.recorded', entityType: 'discipline_event', entityId: 28, ...input });

  it('автозапись при отметке прихода: кто и на сколько, без баллов и служебных полей', () => {
    const feed = describeForGroup(
      disciplineEvent({
        actorId: 23,
        details: { auto: true, kind: 'late_over_30', points: -2, isRepeat: false, lateBy: 228, label: 'Опоздание больше 30 мин' },
      }),
      lateContext,
      'uz',
    );

    expect(feed).toEqual({
      title: 'Xodim ishga kechikdi',
      body: 'Xodim: Karimova Nodira\nKechikish: 3 soat 48 daqiqa',
    });
  });

  it('короткое опоздание — в минутах', () => {
    const feed = describeForGroup(
      disciplineEvent({ actorId: 23, details: { auto: true, kind: 'late_under_15', lateBy: 7 } }),
      lateContext,
      'ru',
    );

    expect(feed).toEqual({ title: 'Опоздание на работу', body: 'Сотрудник: Karimova Nodira\nОпоздание: 7 мин' });
  });

  it('ручная запись о прогуле: имя — из userId, а не автора (руководителя)', () => {
    const feed = describeForGroup(
      disciplineEvent({ actorId: 5, details: { userId: 23, kind: 'absence', points: -3, occurredOn: '2026-09-30' } }),
      lateContext,
      'uz',
    );

    expect(feed).toEqual({ title: 'Ishga chiqmaslik', body: 'Xodim: Karimova Nodira' });
  });
});

describe('доп. работы в ленте', () => {
  const taskContext: FeedContext = { ...context, order: null };
  const taskEvent = (
    input: Partial<RecordAuditInput> & Pick<RecordAuditInput, 'action'>,
  ): RecordAuditInput => event({ entityType: 'task', entityId: 4, ...input });

  it('выдача — что, кому, срок и кто выдал', () => {
    const feed = describeForGroup(
      taskEvent({
        action: 'task.created',
        details: { assigneeId: 23, title: 'Съездить за тканью', dueDate: '2026-10-01' },
      }),
      taskContext,
      'uz',
    );

    expect(feed).toEqual({
      title: "Yangi qo'shimcha ish",
      body: '«Съездить за тканью»\nIjrochi: Karimova Nodira\nMuddat: 01.10.2026\nAdministrator: Rustamov Muzaffar',
    });
  });

  it('сдача — исполнитель подписан своей ролью, без повтора строкой «Ijrochi»', () => {
    const feed = describeForGroup(
      taskEvent({ actorId: 23, action: 'task.submitted', details: { assigneeId: 23, title: 'Съездить за тканью' } }),
      { ...taskContext, actorRoles: ['sewer'] },
      'uz',
    );

    expect(feed).toEqual({
      title: "Qo'shimcha ish bajarildi — tasdiq kutilmoqda",
      body: '«Съездить за тканью»\nTikuvchi: Karimova Nodira',
    });
  });

  it('возврат — с причиной и тем, кто вернул', () => {
    const feed = describeForGroup(
      taskEvent({
        action: 'task.returned',
        details: { assigneeId: 23, title: 'Съездить за тканью', reason: 'Не тот цвет' },
      }),
      { ...taskContext, actorRoles: ['ceo'] },
      'ru',
    );

    expect(feed).toEqual({
      title: 'Доп. работа возвращена на доработку',
      body: '«Съездить за тканью»\nИсполнитель: Karimova Nodira\nПричина: Не тот цвет\nДиректор: Rustamov Muzaffar',
    });
  });

  it('приёмка', () => {
    const feed = describeForGroup(
      taskEvent({ action: 'task.approved', details: { assigneeId: 23, title: 'Съездить за тканью' } }),
      taskContext,
      'uz',
    );

    expect(feed?.title).toBe("Qo'shimcha ish qabul qilindi");
    expect(feed?.body).toBe('«Съездить за тканью»\nIjrochi: Karimova Nodira\nAdministrator: Rustamov Muzaffar');
  });
});

describe('фото заказа', () => {
  const photoOrder: FeedOrder = { ...order, label: 'DH-000009' };
  const photo = { body: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' };
  const upload = (stage: 'sewing_process' | 'fabric'): void => {
    queueOrderPhotoForGroup({
      orderId: 9,
      order: photoOrder,
      stage,
      uploaderId: 23,
      uploaderName: 'Karimova Nodira',
      uploaderRoles: ['sewer'],
      photo,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(sendTelegramGroupPhotos).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('подпись — номер заказа, этап и роль того, кто снимал', () => {
    const album = { order: photoOrder, stage: 'sewing_process', uploaderName: 'Karimova Nodira', uploaderRole: 'sewer' } as const;
    expect(describePhotoAlbum(album, 'uz')).toEqual({
      title: 'DH-000009 buyurtmasi rasmlari: Tikuv',
      body: 'Mijoz: Aliyev Vali\nTikuvchi: Karimova Nodira',
    });
  });

  it('снимки одного этапа подряд уходят одним альбомом', () => {
    upload('sewing_process');
    vi.advanceTimersByTime(20_000);
    upload('sewing_process');
    upload('fabric');
    expect(sendTelegramGroupPhotos).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);

    expect(sendTelegramGroupPhotos).toHaveBeenCalledTimes(2);
    expect(sendTelegramGroupPhotos).toHaveBeenCalledWith(
      'DH-000009 buyurtmasi rasmlari: Tikuv',
      'Mijoz: Aliyev Vali\nTikuvchi: Karimova Nodira',
      [photo, photo],
    );
    expect(sendTelegramGroupPhotos).toHaveBeenCalledWith(
      'DH-000009 buyurtmasi rasmlari: Mato',
      'Mijoz: Aliyev Vali\nTikuvchi: Karimova Nodira',
      [photo],
    );
  });
});
