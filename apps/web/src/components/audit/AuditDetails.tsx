import type { ReactElement } from 'react';
import {
  DISCIPLINE_AUDIT_REASONS,
  DISCIPLINE_KIND_LABELS_RU,
  disciplineKindSchema,
  materialKindLabel,
  ORDER_STATUS_LABELS_RU,
  PAYMENT_METHOD_LABELS_RU,
  ROLE_LABELS_RU,
  weekdayName,
  type CatalogKind,
  type DisciplineAuditReason,
  type OrderStatus,
  type PaymentMethod,
  type Role,
} from '@curtain-crm/shared';

import { formatDate, formatDateTime } from '@/lib/utils';

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
 *
 * Код действия (`action`) нужен ради немногих полей, у которых смысл зависит
 * от действия: `auto` в удалении записи дисциплины значит «удалённая запись
 * была записью системы», а не «удалила система» — удалять мог руководитель.
 */
export function AuditDetails({
  action,
  details,
}: {
  readonly action: string;
  readonly details: unknown;
}): ReactElement {
  const entries = [...flatten(details)].sort((a, b) => rank(a.path) - rank(b.path));

  if (entries.length === 0) {
    return <span className="text-muted">—</span>;
  }

  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-footnote">
      {entries.map((entry) => (
        <div key={entry.path} className="flex items-baseline gap-1">
          <dt className="text-muted">{labelFor(entry.path, action)}</dt>
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
  if (DAY_KEYS.has(key)) {
    return formatDate(text);
  }
  if (WEEKDAY_KEYS.has(key)) {
    return weekdayName(Number.parseInt(text, 10)) || text;
  }
  if (key === 'reason') {
    return isDisciplineAuditReason(text) ? REASON_CODE_LABELS_RU[text] : text;
  }
  if (key === 'method') {
    return PAYMENT_METHOD_LABELS_RU[text as PaymentMethod] ?? text;
  }
  if (KIND_KEYS.has(key)) {
    /*
      «вид portiere_code» читалось кодом таблицы. Тот же словарь, что и на
      самом складе: там колонка «Вид» называет материал словом.
    */
    /*
      Тот же ключ `kind` пишут и записи дисциплины («late_under_15»). Словарь
      склада таких кодов не знает и возвращал `undefined` — поле в журнале
      выходило пустым. Поэтому сначала словарь дисциплины, а незнакомый код
      — как есть: журнал показывает записанное, а не молчит.
    */
    const discipline = disciplineKindSchema.safeParse(text);
    if (discipline.success) return DISCIPLINE_KIND_LABELS_RU[discipline.data];
    const material: string | undefined = materialKindLabel(text as CatalogKind);
    return material ?? text;
  }

  /*
    Метраж приходит из `numeric(12,3)` строкой с хвостовыми нулями: «57.500»,
    «-4.000». В журнале это читается точностью, которой нет: склад ведут до
    сантиметра, а не до микрона.
  */
  if (NUMERIC_TEXT.test(text)) {
    const number = Number.parseFloat(text);
    if (Number.isFinite(number)) return number.toLocaleString('ru-RU');
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
  'startDate',
  'endDate',
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
/**
 * Моменты времени: в `details` они лежат ISO-строкой в UTC. Среди них —
 * когда сотрудник объяснил опоздание (`employeeCommentAt`): без
 * форматирования директор видел бы `2026-11-05T04:12:00.000Z`, то есть
 * время на пять часов раньше настоящего, а не «05.11.2026, 09:12» по часам
 * мастерской.
 */
const DATE_KEYS = new Set([
  'startedAt',
  'endedAt',
  'periodStart',
  'periodEnd',
  'employeeCommentAt',
]);
/**
 * Календарные даты без времени: заявки на выходные, день запроса на
 * опоздание (`date`), день записи дисциплины (`occurredOn`) и день, запись
 * за который пересчитала повтор в другой записи (`reviewedDay`): без
 * форматирования он читался бы кодом `2026-11-05` рядом с датами словами.
 */
const DAY_KEYS = new Set(['startDate', 'endDate', 'date', 'occurredOn', 'reviewedDay']);

/**
 * Причины, которые сервер пишет кодом, а не текстом.
 *
 * Обычно `reason` — слова человека, и выводится как есть. Но когда запись
 * дисциплины убирает или правит сама система (одобрили или сняли опоздание задним
 * числом и день пересчитан), причина — код: без перевода директор увидел
 * бы в журнале `late_request_review`. Правку руками сервер тоже отмечает
 * кодом — чтобы в журнале её можно было отличить от пересчёта системой.
 *
 * Ключи — общий список `DISCIPLINE_AUDIT_REASONS`, а не произвольные строки:
 * код, добавленный на сервере, не соберётся здесь, пока ему не дадут подпись,
 * и не всплывёт в журнале директора английским словом.
 */
const REASON_CODE_LABELS_RU: Readonly<Record<DisciplineAuditReason, string>> = {
  late_request_review: 'пересмотр запроса на опоздание',
  manual_discipline_change: 'ручная правка дисциплины',
  check_in_recount: 'пересчёт месяца при отметке прихода',
};

/**
 * Код ли это причины из общего списка. Сравнение, а не приведение типа:
 * в `reason` чаще лежат слова человека, и их нужно вывести как есть.
 */
function isDisciplineAuditReason(text: string): text is DisciplineAuditReason {
  return DISCIPLINE_AUDIT_REASONS.some((code) => code === text);
}

/** Еженедельный выходной пишется номером дня недели. */
const WEEKDAY_KEYS = new Set(['weekday', 'weeklyDayOff']);
const KIND_KEYS = new Set(['kind']);

/** Число с дробной частью, записанное строкой: «57.500», «-4.000». */
const NUMERIC_TEXT = /^-?\d+\.\d+$/;

/**
 * Подпись поля.
 *
 * Путь `from.price` подписывается как «было · цена»: приставка и само поле
 * переводятся по отдельности, поэтому словарь не приходится дублировать
 * для каждой пары «было/стало». Подпись под конкретное действие
 * (`ACTION_FIELD_LABELS_RU`) важнее общей.
 */
function labelFor(path: string, action: string): string {
  const overrides = ACTION_FIELD_LABELS_RU[action];
  return path
    .split('.')
    .map((part) => overrides?.[part] ?? FIELD_LABELS_RU[part] ?? part)
    .join(' · ');
}

/**
 * Поля, чей смысл зависит от действия.
 *
 * `auto: true` пишут и автозакрытие смены, и автозапись опоздания — там это
 * «сделала система», и общая подпись «автоматически» верна. В правке и
 * удалении записи дисциплины то же поле значит другое: «запись была
 * записью системы» (`recorded_by` — сам сотрудник). Удалить такую запись
 * может и руководитель руками, и подпись «автоматически» выдавала бы его
 * решение за действие системы.
 */
const SYSTEM_RECORD_LABELS_RU: Readonly<Record<string, string>> = {
  auto: 'запись системы',
};

const ACTION_FIELD_LABELS_RU: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'discipline.removed': {
    ...SYSTEM_RECORD_LABELS_RU,
    // Сверка месяца оставляет за день одну запись системы, лишние снимает.
    duplicate: 'лишняя запись того же дня',
  },
  'discipline.adjusted': SYSTEM_RECORD_LABELS_RU,
};

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
  orderType: 'тип заказа',
  corniceInstallerId: 'карнизчик',
  title: 'поручение',
  itemsCount: 'позиций',
  itemsReplaced: 'позиции заменены',
  workPrice: 'стоимость работ',
  deposit: 'первая оплата',
  paid: 'оплачено всего',
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
  created: 'создано',
  updated: 'обновлено',
  received: 'получено',
  removed: 'удалён',
  targetFullName: 'сотрудник',
  startDate: 'с',
  endDate: 'по',
  weekday: 'день недели',
  weeklyDayOff: 'еженедельный выходной',
  viaOrderAssignment: 'по назначению на заказ',

  // опоздания по запросу и дисциплина
  date: 'дата',
  arriveBy: 'приду к',
  occurredOn: 'день',
  // У правки и удаления записи дисциплины своя подпись — `ACTION_FIELD_LABELS_RU`.
  auto: 'автоматически',
  points: 'баллы',
  isRepeat: 'повторно',
  lateBy: 'опоздание, мин',
  shiftStart: 'начало смены',
  approvedArriveBy: 'одобрено к',
  recomputed: 'пересчитано',
  label: 'подпись',
  // Запись снята системой — объяснение сотрудника остаётся только здесь.
  employeeComment: 'объяснение сотрудника',
  /*
    Момент объяснения: по нему видно, объяснил ли сотрудник опоздание до
    решения по запросу или уже после — снятие согласования возвращает
    объяснение вместе с этим моментом.
  */
  employeeCommentAt: 'когда объяснил',
  /*
    Из-за какого запроса на опоздание запись снята, поправлена, пересчитана
    или возвращена. Номер тот же, что в колонке «над чем» у записей самого
    запроса («Запрос на опоздание #12»): по нему правка записи находится
    рядом с одобрением и его снятием.
  */
  lateRequestId: 'запрос на опоздание №',
  /*
    Повтор этой записи пересчитан из-за записи за другой день. Без слова
    «решение»: так бывает и после решения по запросу на опоздание, и после
    того, как руководитель руками добавил или убрал опоздание
    (`manual_discipline_change`) — там никакого решения по дню нет.
  */
  reviewedDay: 'пересчитано из-за записи за',
  /*
    Номер сотрудника, как и `userId` выше: журнал отдаёт только имя автора
    действия (`actorName`), справочника имён у экрана нет.
  */
  recordedBy: 'кем записано',

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
  payment: 'сумма',
  method: 'способ',
  skipped: 'пропущено',
  failures: 'ошибок',
  batch: 'массово',
  lines: 'строк',

  // склад тканей, метраж и готовые шторы
  code: 'код',
  meters: 'метров',
  stockAfter: 'остаток после',
  orderId: 'заказ',
  orderNumber: 'номер заказа',
  itemId: 'позиция',
  quantity: 'количество',
  model: 'модель',
  description: 'описание',
  changed: 'изменены поля',
  mountKind: 'крепление',
  branchId: 'филиал',
};
