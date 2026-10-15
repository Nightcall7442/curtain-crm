import { describe, expect, it } from 'vitest';

import type { MonitorBoard } from './monitor.service';
import { toDisplayBoard } from './monitor.redact';

const link = {
  label: 'ТВ в цеху',
  branchName: 'Ургенч',
  showWorkshop: true,
  showInstallation: true,
  locale: 'ru' as const,
};

/** Снимок с адресом и полем, которого в типе нет: будто `buildBoard` однажды начнёт его отдавать. */
function boardWith(leak: { readonly address: string; readonly clientName: string }): MonitorBoard {
  const work = {
    orderId: 41,
    orderNumber: 'DH-000041',
    items: { text: 'Окно ×2', pieces: 2, areaM2: 5.2 },
    deadline: '2026-10-16',
    since: new Date('2026-10-14T05:00:00Z'),
    overdue: false,
    rework: false,
    address: leak.address,
    clientName: leak.clientName,
  };
  return {
    group: 'installation',
    unit: 'orders',
    generatedAt: new Date('2026-10-14T07:00:00Z'),
    people: [
      {
        userId: 7,
        fullName: 'Бекзод Эргашев',
        photoUrl: null,
        roles: ['installer'],
        hiredAt: '2024-01-15',
        sewerCategory: null,
        workstation: 4,
        plan: { target: 12, percent: 75, pace: 'on_track', source: 'role', effectiveFrom: '2026-10-01', expectedPercent: 52 },
        status: 'trip',
        statusSince: new Date('2026-10-14T06:00:00Z'),
        statusUntil: null,
        current: [work],
        queue: [work],
        queueTotal: 1,
        cornicePool: null,
        counts: { today: 1, week: 3, month: 9 },
        place: 1,
        qualityPercent: 100,
        onTimePercent: 90,
      },
    ],
    podium: {
      month: '2026-09',
      entries: [{ userId: 7, fullName: 'Бекзод Эргашев', photoUrl: null, value: 9, planPercent: 90 }],
    },
    summary: {
      monthTotal: 9,
      monthDeltaPercent: 10,
      headcount: 1,
      onShift: 1,
      averagePerPerson: 9,
      qualityPercent: null,
      onTimePercent: 90,
      planTotal: 12,
      planPercent: 75,
    },
    statusCounts: { trip: 1, break: 0, working: 0, idle: 0, finished: 0, day_off: 0, absent: 0 },
    schedule: {
      slots: [
        {
          orderId: 41,
          orderNumber: 'DH-000041',
          at: new Date('2026-10-14T05:30:00Z'),
          state: 'upcoming',
          installerName: 'Бекзод Эргашев',
          address: leak.address,
        },
      ],
      unscheduled: 1,
      cornices: { pending: 2, inProgress: 1 },
    },
  };
}

describe('табло для ТВ', () => {
  it('на ТВ нет адресов, клиентов и id заказов', () => {
    const out = toDisplayBoard(boardWith({ address: 'ул. Аль-Хорезми, 12', clientName: 'Иванов' }), link);
    const json = JSON.stringify(out);

    expect(json).not.toContain('Аль-Хорезми');
    expect(json).not.toContain('Иванов');
    expect(json).not.toContain('"orderId"');
    expect(json).not.toContain('"address"');
    expect(json).not.toContain('"schedule"');
  });

  it('люди, сводка и подпись ссылки на месте', () => {
    const out = toDisplayBoard(boardWith({ address: 'x', clientName: 'y' }), link);

    expect(out.people[0]?.current[0]?.orderNumber).toBe('DH-000041');
    expect(out.people[0]?.counts.month).toBe(9);
    expect(out.link.label).toBe('ТВ в цеху');
  });

  it('машинка, план и его процент доходят до ТВ', () => {
    const out = toDisplayBoard(boardWith({ address: 'x', clientName: 'y' }), link);

    expect(out.people[0]?.workstation).toBe(4);
    expect(out.people[0]?.plan?.percent).toBe(75);
    expect(out.people[0]?.plan?.pace).toBe('on_track');
    expect(out.podium.entries[0]?.planPercent).toBe(90);
    expect(out.summary.planPercent).toBe(75);
  });
});

describe('на ТВ только то, что экран показывает', () => {
  it('у человека нет стажа, внутренних id, личных процентов и очереди', () => {
    const out = toDisplayBoard(boardWith({ address: 'x', clientName: 'y' }), link);
    const keys = Object.keys(out.people[0] ?? {});

    for (const hidden of ['userId', 'hiredAt', 'qualityPercent', 'onTimePercent', 'queue', 'queueTotal', 'cornicePool']) {
      expect(keys).not.toContain(hidden);
    }
    expect(Object.keys(out.podium.entries[0] ?? {})).not.toContain('userId');
  });
});
