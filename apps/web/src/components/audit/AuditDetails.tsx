import type { ReactElement } from 'react';
import {
  ORDER_STATUS_LABELS_RU,
  ROLE_LABELS_RU,
  type OrderStatus,
  type Role,
} from '@curtain-crm/shared';

import { formatDateTime } from '@/lib/utils';

/**
 * Колонка «Подробности» журнала действий.
 *
 * Раньше здесь стоял `JSON.stringify(details)`, обрезанный по ширине колонки:
 * строка вида `{"fromStatus":"sewing","toStatus":"qc_pending","comment":null…`
 * не читалась вообще, а половина её и не помещалась. Столбец при этом —
 * единственное место, ради которого в журнал заходят: остальные четыре
 * отвечают «когда, кто, что, над чем», а «почему» лежит только здесь.
 *
 * Общей схемы у `details` нет и быть не может: каждое действие пишет своё.
 * Поэтому разбор идёт не по типу записи, а по ИМЕНАМ полей — они повторяются
 * между действиями (`reason`, `fromStatus`, `role`, `price`), и словаря имён
 * хватает, чтобы вместо кода показать слово. Незнакомое имя выводится как
 * есть: журнал обязан показывать то, что в нём записано, а не молчать
 * о полях, про которые этот экран ещё не знает.
 */
export function AuditDetails({
  details,
}: {
  readonly details: unknown;
}): ReactElement {
  const entries = [...flatten(details)].sort((a, b) => rank(a.path) - rank(b.path));

  if (entries.length === 0) {
    return <span className="text-muted">—</span>;
  }

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
      {entries.map((entry) => (
        <div key={entry.path} className="flex items-baseline gap-1">
          <dt className="text-muted">{labelFor(entry.path)}</dt>
          <dd className="text-secondary">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Одно поле деталей, уже приведённое к тексту. */
interface DetailEntry {
  /** Путь до поля: `price` или `from.price`. Он же ключ списка. */
  readonly path: string;
  readonly value: string;
}

/**
 * Разворачивает объект деталей в плоский список.
 *
 * Вложенность в `details` только одного уровня и всегда одного смысла —
 * `{ from: {...}, to: {...} }` и `{ before: {...}, after: {...} }`, то есть
 * «было/стало». Второй уровень поэтому не сворачивается в `[object Object]`,
 * а раскрывается в `было · цена`.
 */
function flatten(details: unknown, prefix = ''): readonly DetailEntry[] {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return [];

  return Object.entries(details).flatMap<DetailEntry>(([key, raw]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;

    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      return flatten(raw, path);
    }

    return [{ path, value: formatValue(key, raw) }];
  });
}

/**
 * Значение поля в человекочитаемом виде.
 *
 * Коды статусов и ролей переводятся по тем же словарям, что и везде в панели:
 * в журнале не должно быть `qc_pending`, если в списке заказов на том же
 * месте написано «На контроле».
 */
function formatValue(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'да' : 'нет';

  if (Array.isArray(raw)) {
    if (raw.length === 0) return '—';
    return raw.map((item) => formatValue(key, item)).join(', ');
  }

  // `raw` здесь всё ещё `unknown`: массив деталей может содержать объекты.
  // Для них остаётся JSON — сырое значение полезнее, чем «[object Object]».
  const text =
    typeof raw === 'string'
      ? raw
      : typeof raw === 'number' || typeof raw === 'bigint'
        ? raw.toString()
        : JSON.stringify(raw);

  if (STATUS_KEYS.has(key)) {
    return ORDER_STATUS_LABELS_RU[text as OrderStatus] ?? text;
  }
  if (ROLE_KEYS.has(key)) {
    return ROLE_LABELS_RU[text as Role] ?? text;
  }
  if (DATE_KEYS.has(key)) {
    return formatDateTime(text);
  }

  return text;
}

/**
 * Порядок полей при выводе.
 *
 * Полагаться на порядок ключей в самом объекте нельзя: `details` лежит
 * в `jsonb`, а Postgres хранит ключи не так, как их записали, — он сортирует
 * их по длине и алфавиту. Из-за этого смена статуса читалась задом наперёд:
 * «в статус Отменён, из статуса Ждёт проверки». Порядок задаётся здесь.
 */
const FIELD_ORDER: readonly string[] = [
  'comment',
  'reason',
  'fromStatus',
  'toStatus',
  'before',
  'from',
  'after',
  'to',
];

/** Поля, которые почти всегда несут значение по умолчанию, уходят в конец. */
const TRAILING_FIELDS: readonly string[] = ['systemInitiated', 'created'];

function rank(path: string): number {
  const head = path.split('.')[0] ?? path;

  if (TRAILING_FIELDS.includes(head)) return 900;

  const index = FIELD_ORDER.indexOf(head);
  return index === -1 ? 500 : index;
}

const STATUS_KEYS = new Set(['fromStatus', 'toStatus', 'status']);
const ROLE_KEYS = new Set(['role', 'roles']);
const DATE_KEYS = new Set(['startedAt', 'endedAt', 'periodStart', 'periodEnd']);

/**
 * Подпись поля.
 *
 * Путь `from.price` подписывается как «было · цена»: приставка и само поле
 * переводятся по отдельности, поэтому словарь не приходится дублировать
 * для каждой пары «было/стало».
 */
function labelFor(path: string): string {
  return path
    .split('.')
    .map((part) => FIELD_LABELS_RU[part] ?? part)
    .join(' · ');
}

/**
 * Имена полей, которые встречаются в `details`.
 *
 * Собраны по местам записи в журнал (`writeAuditLog` в роутерах и
 * `orderWorkflow.service.ts`). Список неполон по замыслу: новое поле
 * появится в журнале своим именем, а не пропадёт.
 */
const FIELD_LABELS_RU: Readonly<Record<string, string>> = {
  // было/стало
  from: 'было',
  to: 'стало',
  before: 'было',
  after: 'стало',

  // заказ
  fromStatus: 'из статуса',
  toStatus: 'в статус',
  comment: 'комментарий',
  systemInitiated: 'автоматически',
  clientName: 'клиент',
  itemsCount: 'позиций',
  itemsReplaced: 'позиции заменены',
  workPrice: 'стоимость работ',
  deposit: 'предоплата',
  assigneeId: 'исполнитель',

  // сотрудник и смены
  fullName: 'имя',
  role: 'роль',
  roles: 'роли',
  userId: 'сотрудник',
  branchIds: 'филиалы',
  primaryBranchId: 'основной филиал',
  startedAt: 'начало',
  endedAt: 'конец',
  reason: 'причина',
  created: 'создана',

  // справочники и закупки
  name: 'название',
  kind: 'вид',
  price: 'цена',
  unit: 'единица',
  isActive: 'активен',
  radiusMeters: 'радиус, м',

  // зарплата
  period: 'период',
  type: 'тип',
  amount: 'сумма',
  calculated: 'начислено',
  paid: 'выплачено',
  skipped: 'пропущено',
  failures: 'ошибок',
};
