import { describe, expect, it } from 'vitest';

import { deltaPercent, filterPeople, sortPeople } from './board';
import { isDayOffOn } from './dayOff';
import { summarizeItems } from './items';
import { deriveLiveStatus } from './liveStatus';

const at = (iso: string): Date => new Date(iso);
const base = {
  now: at('2026-10-14T07:40:00Z'),
  shift: null,
  openBreak: null,
  openTrip: null,
  dayOff: false,
  hasCurrentWork: false,
};

describe('статус человека на табло', () => {
  it('выезд важнее отлучки и работы', () => {
    const r = deriveLiveStatus({
      ...base,
      shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null },
      openTrip: { startedAt: at('2026-10-14T07:05:00Z') },
      openBreak: { startedAt: at('2026-10-14T07:00:00Z'), plannedMinutes: 20 },
      hasCurrentWork: true,
    });
    expect(r).toEqual({ status: 'trip', since: at('2026-10-14T07:05:00Z'), until: null });
  });

  it('отлучка: until = начало + заявленные минуты', () => {
    const r = deriveLiveStatus({
      ...base,
      shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null },
      openBreak: { startedAt: at('2026-10-14T07:40:00Z'), plannedMinutes: 30 },
    });
    expect(r.status).toBe('break');
    expect(r.since).toEqual(at('2026-10-14T07:40:00Z'));
    expect(r.until).toEqual(at('2026-10-14T08:10:00Z'));
  });

  it('работает / без заказа', () => {
    const shift = { startedAt: at('2026-10-14T03:50:00Z'), endedAt: null };
    expect(deriveLiveStatus({ ...base, shift, hasCurrentWork: true })).toEqual({
      status: 'working',
      since: shift.startedAt,
      until: null,
    });
    expect(deriveLiveStatus({ ...base, shift }).status).toBe('idle');
  });

  it('забытая смена (17 ч) — не работает', () => {
    const r = deriveLiveStatus({
      ...base,
      shift: { startedAt: at('2026-10-13T14:00:00Z'), endedAt: null },
      hasCurrentWork: true,
    });
    expect(r.status).toBe('absent');
  });

  it('вышел в выходной — работает', () => {
    const r = deriveLiveStatus({
      ...base,
      dayOff: true,
      hasCurrentWork: true,
      shift: { startedAt: at('2026-10-14T04:00:00Z'), endedAt: null },
    });
    expect(r.status).toBe('working');
  });

  it('смена закрыта сегодня → finished, since = endedAt', () => {
    const r = deriveLiveStatus({
      ...base,
      dayOff: true,
      shift: { startedAt: at('2026-10-14T03:50:00Z'), endedAt: at('2026-10-14T06:00:00Z') },
    });
    expect(r).toEqual({ status: 'finished', since: at('2026-10-14T06:00:00Z'), until: null });
  });

  it('без смены: выходной → day_off, иначе absent', () => {
    expect(deriveLiveStatus({ ...base, dayOff: true }).status).toBe('day_off');
    expect(deriveLiveStatus(base).status).toBe('absent');
  });
});

describe('выходной в день', () => {
  it('еженедельный выходной и одобренный интервал включительно', () => {
    expect(isDayOffOn('2026-10-16', 5, [])).toBe(true); // пятница
    expect(isDayOffOn('2026-10-14', 5, [])).toBe(false);
    expect(isDayOffOn('2026-10-14', null, [{ startDate: '2026-10-13', endDate: '2026-10-14' }])).toBe(true);
    expect(isDayOffOn('2026-10-15', null, [{ startDate: '2026-10-13', endDate: '2026-10-14' }])).toBe(false);
  });
});

describe('состав заказа', () => {
  it('группировка по виду в порядке появления, ×N только при N>1', () => {
    const s = summarizeItems(
      [
        { kind: 'window', quantity: 1, areaM2: 2.5 },
        { kind: 'door', quantity: 1, areaM2: 3 },
        { kind: 'window', quantity: 1, areaM2: 2.1 },
      ],
      'ru',
    );
    expect(s).toEqual({ text: 'Окно ×2, Дверь', pieces: 3, areaM2: 7.6 });
    expect(summarizeItems([], 'ru')).toEqual({ text: '', pieces: 0, areaM2: 0 });
  });

  it('количество в позиции считается штуками, площадь — на каждую штуку', () => {
    const s = summarizeItems([{ kind: 'door', quantity: 3, areaM2: 2 }, { kind: 'other', quantity: 1, areaM2: null }], 'uz');
    expect(s).toEqual({ text: 'Eshik ×3, Boshqa', pieces: 4, areaM2: 6 });
  });
});

describe('сводка и список', () => {
  it('deltaPercent', () => {
    expect(deltaPercent(112, 100)).toBe(12);
    expect(deltaPercent(5, 0)).toBeNull();
  });

  it('filterPeople / sortPeople', () => {
    const people = [
      { fullName: 'Фёдорова Зарина', status: 'working' as const, place: 2 },
      { fullName: 'Азизова Нигора', status: 'idle' as const, place: 2 },
      { fullName: 'Каримова Гулнора', status: 'working' as const, place: 1 },
    ];
    expect(filterPeople(people, 'all', '')).toHaveLength(3);
    expect(filterPeople(people, 'working', '').map((p) => p.place)).toEqual([2, 1]);
    expect(filterPeople(people, 'all', 'федор').map((p) => p.fullName)).toEqual(['Фёдорова Зарина']);
    expect(sortPeople(people, 'place').map((p) => p.fullName)).toEqual([
      'Каримова Гулнора',
      'Азизова Нигора',
      'Фёдорова Зарина',
    ]);
    expect(sortPeople(people, 'name').map((p) => p.fullName)).toEqual([
      'Азизова Нигора',
      'Каримова Гулнора',
      'Фёдорова Зарина',
    ]);
  });
});
