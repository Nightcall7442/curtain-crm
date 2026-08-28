import { z } from 'zod';

import { Role } from './role.enum';

/**
 * Статусы заказа.
 *
 * Порядок в массиве соответствует основному «прямому» пути заказа; побочные
 * статусы (`rejected_to_ceo`, `qc_failed`, `cancelled`) стоят рядом с шагом,
 * к которому они привязаны, — это важно только для читаемости, вся логика
 * переходов описана таблицей `ORDER_TRANSITIONS` ниже.
 */
export const ORDER_STATUSES = [
  'new',
  'pending_admin_review',
  'rejected_to_ceo',
  'measurement_assigned',
  'measurement_done',
  'pending_sewing_assignment',
  'sewing_in_progress',
  'sewing_done',
  'pending_qc',
  'qc_failed',
  'qc_passed',
  'pending_installation_assignment',
  'installation_assigned',
  'installation_in_progress',
  'installation_done',
  'completed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const OrderStatus = {
  NEW: 'new',
  PENDING_ADMIN_REVIEW: 'pending_admin_review',
  REJECTED_TO_CEO: 'rejected_to_ceo',
  MEASUREMENT_ASSIGNED: 'measurement_assigned',
  MEASUREMENT_DONE: 'measurement_done',
  PENDING_SEWING_ASSIGNMENT: 'pending_sewing_assignment',
  SEWING_IN_PROGRESS: 'sewing_in_progress',
  SEWING_DONE: 'sewing_done',
  PENDING_QC: 'pending_qc',
  QC_FAILED: 'qc_failed',
  QC_PASSED: 'qc_passed',
  PENDING_INSTALLATION_ASSIGNMENT: 'pending_installation_assignment',
  INSTALLATION_ASSIGNED: 'installation_assigned',
  INSTALLATION_IN_PROGRESS: 'installation_in_progress',
  INSTALLATION_DONE: 'installation_done',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const satisfies Record<string, OrderStatus>;

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS_RU: Readonly<Record<OrderStatus, string>> = {
  new: 'Новый',
  pending_admin_review: 'Ждёт проверки админа',
  rejected_to_ceo: 'Отклонён, решение за директором',
  measurement_assigned: 'Назначен замер',
  measurement_done: 'Замер выполнен',
  pending_sewing_assignment: 'Ждёт назначения швеи',
  sewing_in_progress: 'В пошиве',
  sewing_done: 'Пошив завершён',
  pending_qc: 'На контроле качества',
  qc_failed: 'Брак, возврат на доработку',
  qc_passed: 'Контроль пройден',
  pending_installation_assignment: 'Ждёт назначения установщика',
  installation_assigned: 'Назначен установщик',
  installation_in_progress: 'Установка идёт',
  installation_done: 'Установка завершена',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};

/* -------------------------------------------------------------------------- */
/*                                    Фазы                                    */
/* -------------------------------------------------------------------------- */

/** Укрупнённые фазы — для группировки колонок канбана и виджетов дашборда. */
export const ORDER_PHASES = [
  'intake',
  'measurement',
  'sewing',
  'qc',
  'installation',
  'closed',
] as const;

export type OrderPhase = (typeof ORDER_PHASES)[number];

export const ORDER_PHASE_LABELS_RU: Readonly<Record<OrderPhase, string>> = {
  intake: 'Приём заказа',
  measurement: 'Замер',
  sewing: 'Пошив',
  qc: 'Контроль качества',
  installation: 'Установка',
  closed: 'Закрытые',
};

export const ORDER_STATUS_PHASE: Readonly<Record<OrderStatus, OrderPhase>> = {
  new: 'intake',
  pending_admin_review: 'intake',
  rejected_to_ceo: 'intake',
  measurement_assigned: 'measurement',
  measurement_done: 'measurement',
  pending_sewing_assignment: 'sewing',
  sewing_in_progress: 'sewing',
  sewing_done: 'sewing',
  pending_qc: 'qc',
  qc_failed: 'qc',
  qc_passed: 'qc',
  pending_installation_assignment: 'installation',
  installation_assigned: 'installation',
  installation_in_progress: 'installation',
  installation_done: 'installation',
  completed: 'closed',
  cancelled: 'closed',
};

/* -------------------------------------------------------------------------- */
/*                        Производственный конвейер                           */
/* -------------------------------------------------------------------------- */

/**
 * Восемь этапов производства для виджета «Этапы производства заказов»
 * на главной панели.
 *
 * Это ПРЕДСТАВЛЕНИЕ, а не отдельная сущность: каждый этап — просто набор
 * статусов. Отдельный этап «Раскрой» существует только в интерфейсе цеха;
 * в жизненном цикле заказа ему соответствует ожидание назначения швеи, когда
 * ткань уже раскраивают. Отдельного статуса под него нет намеренно —
 * иначе таблицу переходов пришлось бы расширять ради одной плитки на дашборде.
 *
 * `cancelled` в конвейер не входит: отменённый заказ производство не проходит.
 */
export const PRODUCTION_STAGES = [
  { key: 'new', label: 'Новые', statuses: ['new', 'pending_admin_review', 'rejected_to_ceo'] },
  { key: 'measurement', label: 'Замер', statuses: ['measurement_assigned', 'measurement_done'] },
  { key: 'cutting', label: 'Раскрой', statuses: ['pending_sewing_assignment'] },
  { key: 'sewing', label: 'Шитьё', statuses: ['sewing_in_progress', 'sewing_done'] },
  { key: 'qc', label: 'Контроль качества', statuses: ['pending_qc', 'qc_failed'] },
  {
    key: 'ready_for_install',
    label: 'Готово к установке',
    statuses: ['qc_passed', 'pending_installation_assignment'],
  },
  {
    key: 'installation',
    label: 'Установка',
    statuses: ['installation_assigned', 'installation_in_progress'],
  },
  { key: 'done', label: 'Завершено', statuses: ['installation_done', 'completed'] },
] as const satisfies readonly {
  key: string;
  label: string;
  statuses: readonly OrderStatus[];
}[];

export type ProductionStageKey = (typeof PRODUCTION_STAGES)[number]['key'];

export const PRODUCTION_STAGE_KEYS: readonly ProductionStageKey[] = PRODUCTION_STAGES.map(
  (stage) => stage.key,
);

/**
 * Именованные константы этапов — чтобы страницы выбирали этапы по имени,
 * а не по строке. Раздел «Производство» перечислял ключи вручную, хотя
 * комментарий рядом обещал, что берёт их из `PRODUCTION_STAGES`.
 */
export const ProductionStage = {
  NEW: 'new',
  MEASUREMENT: 'measurement',
  CUTTING: 'cutting',
  SEWING: 'sewing',
  QC: 'qc',
  READY_FOR_INSTALL: 'ready_for_install',
  INSTALLATION: 'installation',
  DONE: 'done',
} as const satisfies Record<string, ProductionStageKey>;

export function isProductionStageKey(value: unknown): value is ProductionStageKey {
  return typeof value === 'string' && (PRODUCTION_STAGE_KEYS as readonly string[]).includes(value);
}

/**
 * Статусы, из которых состоит этап конвейера.
 *
 * Нужна там, где этап приходит извне — например, из адресной строки
 * (`/orders?stage=cutting`): фильтр списка заказов работает по статусам,
 * и раскладывать этап на статусы должен один код, а не каждый вызывающий.
 */
export function statusesOfProductionStage(key: ProductionStageKey): readonly OrderStatus[] {
  const stage = PRODUCTION_STAGES.find((entry) => entry.key === key);
  return stage === undefined ? [] : stage.statuses;
}

/** Этап конвейера по статусу заказа. `null` для отменённых. */
export function productionStageOf(status: OrderStatus): ProductionStageKey | null {
  return (
    PRODUCTION_STAGES.find((stage) =>
      (stage.statuses as readonly OrderStatus[]).includes(status),
    )?.key ?? null
  );
}

/* -------------------------------------------------------------------------- */
/*                          Порядковый номер этапа                            */
/* -------------------------------------------------------------------------- */

/**
 * Порядковый номер статуса на прямом пути заказа.
 *
 * Побочные статусы «прикреплены» к своему шагу и имеют тот же индекс:
 *  - `rejected_to_ceo` = индекс `pending_admin_review`;
 *  - `qc_failed`       = индекс `pending_qc`.
 * Это позволяет отличить откат назад (индекс уменьшается) от отклонения
 * (индекс не меняется). `cancelled` вне шкалы и имеет индекс -1.
 */
export const ORDER_STATUS_STAGE_INDEX: Readonly<Record<OrderStatus, number>> = {
  new: 0,
  pending_admin_review: 1,
  rejected_to_ceo: 1,
  measurement_assigned: 2,
  measurement_done: 3,
  pending_sewing_assignment: 4,
  sewing_in_progress: 5,
  sewing_done: 6,
  pending_qc: 7,
  qc_failed: 7,
  qc_passed: 8,
  pending_installation_assignment: 9,
  installation_assigned: 10,
  installation_in_progress: 11,
  installation_done: 12,
  completed: 13,
  cancelled: -1,
};

/**
 * Конечные статусы: из них переходов нет, заказ считается закрытым.
 *
 * Объявлен кортежем (`as const`), а не `readonly OrderStatus[]`: из кортежа
 * выводится узкий тип `TerminalOrderStatus`, и фильтр архива в веб-панели
 * типизируется им вместо собственного объединения литералов.
 */
export const TERMINAL_ORDER_STATUSES = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
] as const satisfies readonly OrderStatus[];

export type TerminalOrderStatus = (typeof TERMINAL_ORDER_STATUSES)[number];

/**
 * Статусы раздела «Архив» в веб-панели.
 * Отдельной таблицы для архива нет — это просто фильтр по статусу.
 */
export const ARCHIVED_ORDER_STATUSES: readonly OrderStatus[] = TERMINAL_ORDER_STATUSES;

/* -------------------------------------------------------------------------- */
/*                             Таблица переходов                              */
/* -------------------------------------------------------------------------- */

/** Характер перехода — определяет обязательность комментария и вид кнопки в UI. */
export const TRANSITION_KINDS = ['forward', 'rollback', 'reject', 'cancel'] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/**
 * Те же значения объектом — чтобы клиенты писали `TransitionKind.FORWARD`,
 * а не `'forward'`. Без объекта сравнение с литералом было неизбежным:
 * тип и массив подсказки не дают, а опечатку компилятор в сравнении с
 * литералом строкового типа не всегда ловит.
 */
export const TransitionKind = {
  FORWARD: 'forward',
  ROLLBACK: 'rollback',
  REJECT: 'reject',
  CANCEL: 'cancel',
} as const satisfies Record<string, TransitionKind>;

export interface OrderTransition {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  /** Роли, которым разрешён именно этот переход. */
  readonly roles: readonly Role[];
  readonly kind: TransitionKind;
  /** Подпись действия для кнопки в веб-панели и мобильном приложении. */
  readonly label: string;
}

/**
 * Прямые переходы, откаты и отклонения.
 *
 * Отмены (`-> cancelled`) добавляются ниже программно для всех неконечных
 * статусов, чтобы не дублировать шестнадцать одинаковых строк.
 */
const EXPLICIT_TRANSITIONS: readonly OrderTransition[] = [
  // --- Приём заказа ---------------------------------------------------------
  {
    from: OrderStatus.NEW,
    to: OrderStatus.PENDING_ADMIN_REVIEW,
    roles: [Role.SELLER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Отправить на проверку админу',
  },
  {
    from: OrderStatus.PENDING_ADMIN_REVIEW,
    to: OrderStatus.MEASUREMENT_ASSIGNED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Назначить замер',
  },
  {
    // Замер — необязательный шаг: админ вправе передать заказ сразу в пошив.
    from: OrderStatus.PENDING_ADMIN_REVIEW,
    to: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Пропустить замер, передать в пошив',
  },
  {
    from: OrderStatus.PENDING_ADMIN_REVIEW,
    to: OrderStatus.REJECTED_TO_CEO,
    roles: [Role.ADMIN],
    kind: TransitionKind.REJECT,
    label: 'Отклонить, передать директору',
  },

  // --- Решение директора по отклонённому заказу -----------------------------
  {
    from: OrderStatus.REJECTED_TO_CEO,
    to: OrderStatus.MEASUREMENT_ASSIGNED,
    roles: [Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Утвердить и назначить замер',
  },
  {
    from: OrderStatus.REJECTED_TO_CEO,
    to: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    roles: [Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Утвердить без замера',
  },
  {
    from: OrderStatus.REJECTED_TO_CEO,
    to: OrderStatus.PENDING_ADMIN_REVIEW,
    roles: [Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть админу на доработку',
  },

  // --- Замер ----------------------------------------------------------------
  {
    from: OrderStatus.MEASUREMENT_ASSIGNED,
    to: OrderStatus.MEASUREMENT_DONE,
    roles: [Role.MASTER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Замер выполнен',
  },
  {
    from: OrderStatus.MEASUREMENT_ASSIGNED,
    to: OrderStatus.PENDING_ADMIN_REVIEW,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на проверку админу',
  },
  {
    from: OrderStatus.MEASUREMENT_DONE,
    to: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    roles: [Role.MASTER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Передать на назначение швеи',
  },
  {
    from: OrderStatus.MEASUREMENT_DONE,
    to: OrderStatus.MEASUREMENT_ASSIGNED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на повторный замер',
  },

  // --- Пошив ----------------------------------------------------------------
  {
    from: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    to: OrderStatus.SEWING_IN_PROGRESS,
    roles: [Role.SEWER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Начать пошив',
  },
  {
    from: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    to: OrderStatus.MEASUREMENT_ASSIGNED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на замер',
  },
  {
    from: OrderStatus.SEWING_IN_PROGRESS,
    to: OrderStatus.SEWING_DONE,
    roles: [Role.SEWER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Пошив завершён',
  },
  {
    from: OrderStatus.SEWING_IN_PROGRESS,
    to: OrderStatus.PENDING_SEWING_ASSIGNMENT,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на переназначение швеи',
  },
  {
    from: OrderStatus.SEWING_DONE,
    to: OrderStatus.PENDING_QC,
    roles: [Role.SEWER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Передать на контроль качества',
  },
  {
    from: OrderStatus.SEWING_DONE,
    to: OrderStatus.SEWING_IN_PROGRESS,
    roles: [Role.SEWER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть в пошив',
  },

  // --- Контроль качества ----------------------------------------------------
  {
    from: OrderStatus.PENDING_QC,
    to: OrderStatus.QC_PASSED,
    roles: [Role.QC, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Контроль пройден',
  },
  {
    from: OrderStatus.PENDING_QC,
    to: OrderStatus.QC_FAILED,
    roles: [Role.QC, Role.ADMIN, Role.CEO],
    kind: TransitionKind.REJECT,
    label: 'Обнаружен брак',
  },
  {
    from: OrderStatus.QC_FAILED,
    to: OrderStatus.SEWING_IN_PROGRESS,
    roles: [Role.QC, Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть в пошив на исправление',
  },
  {
    // Брак может быть следствием ошибки в замерах, а не в пошиве.
    from: OrderStatus.QC_FAILED,
    to: OrderStatus.MEASUREMENT_ASSIGNED,
    roles: [Role.QC, Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на повторный замер',
  },
  {
    from: OrderStatus.QC_PASSED,
    to: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    roles: [Role.QC, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Передать на назначение установки',
  },
  {
    from: OrderStatus.QC_PASSED,
    to: OrderStatus.PENDING_QC,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на повторный контроль',
  },

  // --- Установка ------------------------------------------------------------
  {
    from: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    to: OrderStatus.INSTALLATION_ASSIGNED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Назначить установщика',
  },
  {
    from: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    to: OrderStatus.PENDING_QC,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на контроль качества',
  },
  {
    from: OrderStatus.INSTALLATION_ASSIGNED,
    to: OrderStatus.INSTALLATION_IN_PROGRESS,
    roles: [Role.INSTALLER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Начать установку',
  },
  {
    from: OrderStatus.INSTALLATION_ASSIGNED,
    to: OrderStatus.PENDING_INSTALLATION_ASSIGNMENT,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на переназначение установщика',
  },
  {
    from: OrderStatus.INSTALLATION_IN_PROGRESS,
    to: OrderStatus.INSTALLATION_DONE,
    roles: [Role.INSTALLER, Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Установка завершена',
  },
  {
    from: OrderStatus.INSTALLATION_IN_PROGRESS,
    to: OrderStatus.INSTALLATION_ASSIGNED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на начало установки',
  },
  {
    // Обычно выполняется автоматически после загрузки фото стадии `install_after`
    // (см. `AUTO_COMPLETE_PHOTO_STAGE`), но остаётся доступным вручную.
    from: OrderStatus.INSTALLATION_DONE,
    to: OrderStatus.COMPLETED,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.FORWARD,
    label: 'Закрыть заказ',
  },
  {
    from: OrderStatus.INSTALLATION_DONE,
    to: OrderStatus.INSTALLATION_IN_PROGRESS,
    roles: [Role.ADMIN, Role.CEO],
    kind: TransitionKind.ROLLBACK,
    label: 'Вернуть на доработку установки',
  },
];

/** Отмена доступна из любого неконечного статуса и только руководству. */
const CANCEL_TRANSITIONS: readonly OrderTransition[] = ORDER_STATUSES.filter(
  (status) => !isTerminalStatus(status),
).map((status) => ({
  from: status,
  to: OrderStatus.CANCELLED,
  roles: [Role.ADMIN, Role.CEO],
  kind: TransitionKind.CANCEL,
  label: 'Отменить заказ',
}));

/** Полная таблица допустимых переходов статуса заказа. */
export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  ...EXPLICIT_TRANSITIONS,
  ...CANCEL_TRANSITIONS,
];

/** Индекс переходов по исходному статусу — чтобы не фильтровать массив на каждый запрос. */
const TRANSITIONS_BY_FROM: ReadonlyMap<OrderStatus, readonly OrderTransition[]> = new Map(
  ORDER_STATUSES.map((status) => [
    status,
    ORDER_TRANSITIONS.filter((transition) => transition.from === status),
  ]),
);

const transitionKey = (from: OrderStatus, to: OrderStatus): string => `${from}->${to}`;

const TRANSITIONS_BY_PAIR: ReadonlyMap<string, OrderTransition> = new Map(
  ORDER_TRANSITIONS.map((transition) => [
    transitionKey(transition.from, transition.to),
    transition,
  ]),
);

/* -------------------------------------------------------------------------- */
/*                        Требования к назначениям                            */
/* -------------------------------------------------------------------------- */

/** Роль исполнителя, назначение которого обязательно для входа в статус. */
export type AssigneeKind = Extract<Role, 'master' | 'sewer' | 'installer'>;

/**
 * Статусы, в которые нельзя перевести заказ без назначенного исполнителя.
 * Проверяется в `orderWorkflow.service.ts` до записи нового статуса.
 */
export const ORDER_STATUS_REQUIRED_ASSIGNEE: Readonly<
  Partial<Record<OrderStatus, AssigneeKind>>
> = {
  measurement_assigned: Role.MASTER,
  sewing_in_progress: Role.SEWER,
  installation_assigned: Role.INSTALLER,
};

/* -------------------------------------------------------------------------- */
/*                             Публичные функции                              */
/* -------------------------------------------------------------------------- */

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Все переходы, выходящие из указанного статуса (без учёта ролей). */
export function transitionsFrom(from: OrderStatus): readonly OrderTransition[] {
  return TRANSITIONS_BY_FROM.get(from) ?? [];
}

/** Описание конкретного перехода или `undefined`, если такой переход запрещён. */
export function findTransition(
  from: OrderStatus,
  to: OrderStatus,
): OrderTransition | undefined {
  return TRANSITIONS_BY_PAIR.get(transitionKey(from, to));
}

/** Разрешён ли переход в принципе (без учёта ролей). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS_BY_PAIR.has(transitionKey(from, to));
}

/**
 * Переходы, доступные пользователю с данным набором ролей.
 * Используется и на бэкенде (для проверки), и на фронтенде (для отрисовки кнопок).
 */
export function availableTransitions(
  from: OrderStatus,
  userRoles: readonly Role[],
): readonly OrderTransition[] {
  return transitionsFrom(from).filter((transition) =>
    transition.roles.some((role) => userRoles.includes(role)),
  );
}

/**
 * Является ли переход откатом на предыдущий этап.
 *
 * Источник правды — поле `kind` в таблице переходов, а не шкала
 * `ORDER_STATUS_STAGE_INDEX`: у побочных статусов индекс совпадает с якорным
 * шагом (`rejected_to_ceo` = `pending_admin_review`), поэтому возврат
 * «директор -> админу на доработку» по индексам откатом не выглядит,
 * хотя по смыслу является им.
 *
 * Шкала используется только как запасной вариант для пар, которых нет в
 * таблице, — например, при отрисовке исторических записей, сделанных до
 * изменения правил переходов.
 */
export function isRollback(from: OrderStatus, to: OrderStatus): boolean {
  const transition = findTransition(from, to);
  if (transition !== undefined) return transition.kind === TransitionKind.ROLLBACK;

  const fromIndex = ORDER_STATUS_STAGE_INDEX[from];
  const toIndex = ORDER_STATUS_STAGE_INDEX[to];
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
}

/**
 * Обязателен ли комментарий (причина) при переходе.
 * Комментарий обязателен для откатов, отклонений и отмен.
 */
export function requiresComment(from: OrderStatus, to: OrderStatus): boolean {
  const transition = findTransition(from, to);
  if (transition === undefined) return false;
  return transition.kind !== TransitionKind.FORWARD;
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return (TERMINAL_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

/**
 * Заказ активен — то есть ещё в работе.
 * Обратная сторона `isTerminalStatus`, вынесена отдельно, потому что в
 * клиентах она читается чаще: списки фильтруют «мои активные заказы».
 */
export function isActiveStatus(status: OrderStatus): boolean {
  return !isTerminalStatus(status);
}

/**
 * Через какие статусы заказ закрывается после загрузки фото «После установки».
 *
 * Правило одно на всю систему: сервер по нему выполняет переходы, клиенты —
 * решают, показывать ли предупреждение «загрузка закроет заказ». Пока оно было
 * переписано в трёх местах, «закроет» и «закрыло» могли разойтись — и
 * пользователь узнавал бы о закрытии заказа постфактум.
 *
 * Пустой массив означает, что из этого статуса загрузка фото ничего не меняет.
 */
export function autoCompletePathFrom(status: OrderStatus): readonly OrderStatus[] {
  if (status === OrderStatus.INSTALLATION_IN_PROGRESS) {
    return [OrderStatus.INSTALLATION_DONE, OrderStatus.COMPLETED];
  }
  if (status === OrderStatus.INSTALLATION_DONE) {
    return [OrderStatus.COMPLETED];
  }
  return [];
}

/** Закроет ли заказ фото «После установки», загруженное в этом статусе. */
export function autoCompletesOnInstallPhoto(status: OrderStatus): boolean {
  return autoCompletePathFrom(status).length > 0;
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS_RU[status];
}
