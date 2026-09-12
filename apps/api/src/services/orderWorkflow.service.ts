import {
  orderItems,
  orders,
  orderStatusHistory,
  userRoles,
  users,
  type DbExecutor,
  type Order,
} from '@curtain-crm/db';
import {
  CorniceStatus,
  findTransition,
  isRollback,
  isManagement,
  ORDER_STATUS_LABELS_RU,
  ORDER_STATUS_REQUIRED_ASSIGNEE,
  OrderStatus,
  OrderType,
  requiresComment,
  Role,
  ROLE_LABELS_RU,
  transitionsFrom,
  type AssignableRole,
  type OrderStatus as OrderStatusName,
  type Role as RoleName,
} from '@curtain-crm/shared';
import { TRPCError } from '@trpc/server';
import { and, eq, isNotNull, or } from 'drizzle-orm';

import { recordAudit } from './audit.service';
import { assertOrderPacked } from './packList.service';
import { accrueForClosedOrder } from './payroll.service';
import {
  notifyOrderAssigned,
  notifyOrderStatusChanged,
  notifyRoleChanged,
  notifyStageAwaitingExecutor,
} from './notifications.service';
import type { AuthenticatedUser } from '../types';

/**
 * Жизненный цикл заказа — единственное место, где меняется `orders.status`.
 *
 * Ни один роутер не пишет статус напрямую: иначе переход мог бы состояться
 * без записи в `order_status_history`, без проверки прав и без уведомлений.
 *
 * Правила перехода (кто, откуда, куда, нужен ли комментарий) заданы таблицей
 * `ORDER_TRANSITIONS` в `@curtain-crm/shared` — здесь только их применение.
 */

/* -------------------------------------------------------------------------- */
/*                          Назначения исполнителей                           */
/* -------------------------------------------------------------------------- */

/**
 * Колонка заказа под каждую назначаемую роль.
 *
 * Сам список ролей — в `@curtain-crm/shared` (`ASSIGNABLE_ROLES`), потому что
 * он нужен и клиентам. Здесь только привязка к колонкам: она про схему БД,
 * и в shared, который о Drizzle ничего не знает, ей не место.
 *
 * `Record` по `AssignableRole` обязателен, а не `Partial`: добавление роли
 * в общий список должно ЛОМАТЬ сборку здесь, пока колонка не заведена.
 */
export const ASSIGNABLE_ROLE_COLUMNS = {
  [Role.MASTER]: 'masterId',
  [Role.SEWER]: 'sewerId',
  [Role.QC]: 'qcId',
  [Role.INSTALLER]: 'installerId',
  // `as const` здесь не про стиль: без литеральных типов колонок
  // `order[ASSIGNABLE_ROLE_COLUMNS[role]]` расширился бы до типа любого поля
  // заказа, и вместо `number | null` получилась бы строка с датой.
} as const satisfies Record<AssignableRole, keyof Order>;

export type { AssignableRole };

/**
 * Кто «владеет» заказом, находящимся в данном статусе.
 *
 * Используется, чтобы сотрудник не мог двигать чужой заказ: пока заказ в
 * пошиве, действия по нему выполняет назначенная швея, а не любая швея цеха.
 * Если владелец ещё не назначен (`null`), ограничение не применяется —
 * например, `pending_qc` это общий пул, из которого заказ берёт свободный ОТК.
 *
 * Руководство (CEO, админ) не ограничено этой проверкой никогда.
 */
const STATUS_OWNER: Readonly<Partial<Record<OrderStatusName, AssignableRole>>> = {
  [OrderStatus.MEASUREMENT_ASSIGNED]: Role.MASTER,
  [OrderStatus.MEASUREMENT_DONE]: Role.MASTER,
  [OrderStatus.PENDING_SEWING_ASSIGNMENT]: Role.SEWER,
  [OrderStatus.SEWING_IN_PROGRESS]: Role.SEWER,
  [OrderStatus.SEWING_DONE]: Role.SEWER,
  [OrderStatus.PENDING_QC]: Role.QC,
  [OrderStatus.QC_FAILED]: Role.QC,
  [OrderStatus.QC_PASSED]: Role.QC,
  /*
    «Ждёт назначения установщика» этой таблицы не знал — и зря.

    У пошива и контроля статус ожидания есть, у установки его не было, хотя
    смысл тот же: заказ готов, установщик ещё не назначен. Из-за пропуска
    установщики не получали уведомления о свободной работе (оно рассылается
    как раз по этой таблице) и не могли даже открыть такой заказ, чтобы
    посмотреть адрес и объём.

    Двигать заказ дальше по-прежнему вправе только руководство: переход
    «Назначить установщика» назван в `ORDER_TRANSITIONS` ролями админа и
    директора, и эта строка на него не влияет.
  */
  [OrderStatus.PENDING_INSTALLATION_ASSIGNMENT]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_ASSIGNED]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_IN_PROGRESS]: Role.INSTALLER,
  [OrderStatus.INSTALLATION_DONE]: Role.INSTALLER,
};

const assigneeOf = (order: Order, role: AssignableRole): number | null =>
  order[ASSIGNABLE_ROLE_COLUMNS[role]];

/** Все сотрудники, участвующие в заказе. */
export function collectOrderParticipants(order: Order): number[] {
  const ids = [
    order.createdBy,
    order.masterId,
    order.sewerId,
    order.qcId,
    order.installerId,
  ].filter((id): id is number => id !== null);

  return [...new Set(ids)];
}

/**
 * Имеет ли сотрудник доступ к заказу.
 *
 * Руководство видит все заказы; остальные — только те, где они участвуют.
 * Используется для чтения заказа, комментариев и фотографий.
 */
export function canUserAccessOrder(order: Order, user: AuthenticatedUser): boolean {
  if (isManagement(user.roles)) return true;
  /*
    Карниз — общая работа карнизчиков: пока он не повешен, заказ принадлежит
    не конкретному человеку, а всей бригаде. Без этого исключения карнизчик
    видел бы заказ в своей очереди, но не смог бы его открыть — ни адреса,
    ни кода карниза. После «готово» доступ остаётся: владелец просил, чтобы
    остальные видели, кто и как сделал работу.
  */
  if (
    order.corniceStatus !== CorniceStatus.NOT_REQUIRED &&
    user.roles.includes(Role.CORNICE_INSTALLER)
  ) {
    return true;
  }
  return collectOrderParticipants(order).includes(user.id);
}

/**
 * Нужен ли заказу карниз — по позициям: карниз, пластик или труба.
 *
 * Спрашивается один раз, на выходе из проверки админом. Держать ответ
 * колонкой-дубликатом позиций не стали: позиции после создания заказа не
 * меняются, а лишнее поле разошлось бы с ними при первой же правке.
 */
async function orderNeedsCornice(executor: DbExecutor, orderId: number): Promise<boolean> {
  const [row] = await executor
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        or(
          isNotNull(orderItems.cornice),
          isNotNull(orderItems.plastic),
          isNotNull(orderItems.pipe),
        ),
      ),
    )
    .limit(1);

  return row !== undefined;
}

export function assertCanAccessOrder(order: Order, user: AuthenticatedUser): void {
  if (!canUserAccessOrder(order, user)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Заказ недоступен: вы не участвуете в его выполнении',
    });
  }
}

/* -------------------------------------------------------------------------- */
/*                             Загрузка заказа                                */
/* -------------------------------------------------------------------------- */

/**
 * Читает заказ и блокирует строку до конца транзакции (`SELECT ... FOR UPDATE`).
 *
 * Блокировка обязательна: без неё два параллельных перехода прочитали бы
 * один и тот же исходный статус, и оба записали бы свой — в истории появился бы
 * невозможный переход, а «откат» мог бы перезаписать более свежий статус.
 */
export async function loadOrderForUpdate(
  executor: DbExecutor,
  orderId: number,
): Promise<Order> {
  const [order] = await executor
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update')
    .limit(1);

  if (order === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Заказ не найден' });
  }

  return order;
}

const orderLabel = (order: Order): string => order.orderNumber ?? `#${order.id.toString()}`;

/* -------------------------------------------------------------------------- */
/*                              Смена статуса                                 */
/* -------------------------------------------------------------------------- */

export interface ChangeOrderStatusParams {
  readonly orderId: number;
  readonly toStatus: OrderStatusName;
  readonly actor: AuthenticatedUser;
  /** Причина. Обязательна для откатов, отклонений и отмен. */
  readonly comment?: string | null;
  /**
   * Системный переход — например, автозакрытие заказа после загрузки фото
   * стадии `install_after`.
   *
   * Пропускает ТОЛЬКО проверку роли: закрыть заказ вручную вправе админ или
   * директор, а автозакрытие запускает установщик, загрузивший фото. Всё
   * остальное проверяется как обычно — легальность перехода, доступ к заказу
   * и принадлежность этапа исполнителю; история пишется так же.
   *
   * Раньше флаг снимал заодно и проверку исполнителя, хотя комментарий рядом
   * обещал только роль. Из-за этого участник заказа с дополнительной ролью
   * установщика мог загрузить фото «после установки» по ЧУЖОЙ установке
   * и закрыть её — а закрытие заказа влияет на расчёт зарплаты.
   */
  readonly systemInitiated?: boolean;
  /**
   * Исполнитель, назначаемый ВМЕСТЕ с переходом, одной транзакцией.
   *
   * Три статуса (`measurement_assigned`, `sewing_in_progress`,
   * `installation_assigned`) без исполнителя бессмысленны и отклоняются
   * шагом 5. Раньше это означало обязательные два запроса в правильном
   * порядке: сначала `orders.assign`, потом `orders.changeStatus`. Между
   * ними заказ успевал побыть в состоянии «мастер назначен, но статус
   * прежний», а если второй запрос не доходил — оставался в нём насовсем.
   *
   * Роль здесь не передаётся намеренно: её однозначно задаёт целевой статус
   * (`ORDER_STATUS_REQUIRED_ASSIGNEE`). Лишний параметр можно было бы
   * прислать не тот, и появилась бы вторая, расходящаяся с таблицей,
   * трактовка того, кого назначают.
   *
   * Назначать вправе только руководство — ровно как в `orders.assign`.
   */
  readonly assigneeId?: number | null;
  readonly ipAddress?: string | null;
}

export interface ChangeOrderStatusResult {
  readonly order: Order;
  readonly fromStatus: OrderStatusName;
  readonly toStatus: OrderStatusName;
  readonly wasRollback: boolean;
}

/**
 * Переводит заказ в новый статус.
 *
 * Выполняется целиком внутри транзакции вызывающей стороны: сам переход,
 * запись истории, автоназначение исполнителя, аудит и уведомления либо
 * происходят вместе, либо не происходят вовсе.
 */
export async function changeOrderStatus(
  executor: DbExecutor,
  params: ChangeOrderStatusParams,
): Promise<ChangeOrderStatusResult> {
  const { actor, toStatus } = params;
  const order = await loadOrderForUpdate(executor, params.orderId);
  const fromStatus = order.status;

  /* 0. Доступ к заказу — до всех остальных проверок.
     Сообщения об ошибках ниже называют статус и номер заказа, поэтому без
     этой проверки рядовой сотрудник перебором `id` вычитывал бы состояние
     чужих заказов: сама мутация не прошла бы, но данные утекли. Читающая
     `orders.byId` такую попытку отклоняет давно — здесь проверки не было. */
  assertCanTouchOrder(order, actor, fromStatus);

  if (fromStatus === toStatus) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Заказ уже находится в статусе «${ORDER_STATUS_LABELS_RU[toStatus]}»`,
    });
  }

  /* 1. Легальность перехода — с учётом типа заказа: обходной путь готовых
     штор («новый → сразу к установке / выполнен») для пошива закрыт. */
  const transition = findTransition(fromStatus, toStatus, order.orderType);
  if (transition === undefined) {
    const allowed = transitionsFrom(fromStatus, order.orderType)
      .map((item) => ORDER_STATUS_LABELS_RU[item.to])
      .join(', ');

    throw new TRPCError({
      code: 'CONFLICT',
      message:
        `Из статуса «${ORDER_STATUS_LABELS_RU[fromStatus]}» нельзя перейти в ` +
        `«${ORDER_STATUS_LABELS_RU[toStatus]}»` +
        (allowed.length > 0 ? `. Доступные переходы: ${allowed}` : '. Заказ закрыт'),
    });
  }

  /* 2. Права роли на этот конкретный переход. */
  if (params.systemInitiated !== true) {
    if (!transition.roles.some((role) => actor.roles.includes(role))) {
      const required = transition.roles.map((role) => ROLE_LABELS_RU[role]).join(', ');
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Действие «${transition.label}» доступно ролям: ${required}`,
      });
    }
  }

  /* 3. Принадлежность этапа исполнителю — проверяется ВСЕГДА, в том числе
     при системном переходе: «я имею право на такое действие» и «этот заказ
     закреплён за мной» — разные вопросы, и автозакрытие снимает только
     первый. */
  assertActorOwnsOrder(order, actor, fromStatus);

  /* 4. Обязательный комментарий для откатов, отклонений и отмен. */
  const comment = params.comment?.trim() ?? '';
  if (requiresComment(fromStatus, toStatus, order.orderType) && comment.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Укажите причину: действие «${transition.label}» требует комментария`,
    });
  }

  /* 5. Исполнитель, без которого статус бессмыслен. */
  const requiredAssignee = ORDER_STATUS_REQUIRED_ASSIGNEE[toStatus];
  const autoAssign = resolveAutoAssignment(order, actor, toStatus);

  /* 5a. Назначение, присланное вместе с переходом.
     Выполняется ДО проверки ниже и в той же транзакции, поэтому либо заказ
     уходит в новый статус с назначенным исполнителем, либо не происходит
     ничего — промежуточного состояния «назначен, но статус прежний» больше
     нет. Проверку роли назначаемого, его активность, аудит и уведомление
     делает `assignExecutor`: второй копии этих правил здесь быть не должно. */
  const assigneeId = params.assigneeId ?? null;

  if (assigneeId !== null) {
    if (requiredAssignee === undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          `Статус «${ORDER_STATUS_LABELS_RU[toStatus]}» не требует исполнителя — ` +
          'назначьте его отдельно',
      });
    }

    // Право назначать — только у руководства, как и в `orders.assign`.
    // Без этой проверки любой участник заказа, которому переход разрешён,
    // назначал бы исполнителей в обход `managementProcedure`.
    if (!isManagement(actor.roles)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Назначать исполнителей вправе только администратор или директор',
      });
    }

    await assignExecutor(executor, {
      orderId: order.id,
      role: requiredAssignee,
      assigneeId,
      actor,
      ipAddress: params.ipAddress ?? null,
    });
  }

  if (requiredAssignee !== undefined) {
    const assigned =
      assigneeId ?? assigneeOf(order, requiredAssignee) ?? autoAssign?.userId ?? null;
    if (assigned === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Сначала назначьте исполнителя с ролью «${ROLE_LABELS_RU[requiredAssignee]}»`,
      });
    }
  }

  const wasRollback = isRollback(fromStatus, toStatus, order.orderType);

  /*
    5c. На установку не выезжают, не собравшись.

    Держатель, забытый в цехе, вспоминается у клиента — и стоит второго
    выезда через весь город. Поэтому перед выходом в «Установка идёт»
    установщик проходит по сборочному листу заказа и отмечает, что положил
    в машину; непройденный лист останавливает переход и называет, чего в нём
    не хватает.

    Откат сюда же не попадает: возврат на переделку ничего не собирает.
  */
  if (toStatus === OrderStatus.INSTALLATION_IN_PROGRESS && !wasRollback) {
    await assertOrderPacked(executor, order.id);
  }

  /* 6. Запись нового статуса. */
  const now = new Date();

  /*
    5b. Карниз уходит карнизчикам ровно на выходе из проверки админом.

    Не раньше: пока админ не утвердил заказ, вешать нечего — его могут
    отклонить или переписать. И не позже: карниз ставят до того, как из
    цеха привезут шторы, поэтому он идёт параллельно пошиву, а не после.

    `not_required` в условии — защита от повторного запуска: заказ может
    вернуться на проверку админом и уйти в цех второй раз, а карниз к тому
    времени уже могут вешать. Затирать чужую работу откатом статуса нельзя.

    Готовые шторы проверку админом минуют: продажа уходит из «Новый» сразу
    на назначение установщика. Карниз к такой продаже раньше терялся —
    карнизчики о нём не узнавали. Поэтому для них точка отправки — этот
    первый переход; продажа без установки (сразу «Выполнен») карниз не
    запускает: клиент увозит его сам.
  */
  const leavesIntake =
    fromStatus === OrderStatus.PENDING_ADMIN_REVIEW ||
    fromStatus === OrderStatus.REJECTED_TO_CEO ||
    (order.orderType === OrderType.READY_MADE && fromStatus === OrderStatus.NEW);
  const startsCornice =
    order.corniceStatus === CorniceStatus.NOT_REQUIRED &&
    leavesIntake &&
    !wasRollback &&
    toStatus !== OrderStatus.CANCELLED &&
    toStatus !== OrderStatus.COMPLETED &&
    (await orderNeedsCornice(executor, order.id));

  const [updated] = await executor
    .update(orders)
    .set({
      status: toStatus,
      ...(startsCornice ? { corniceStatus: CorniceStatus.PENDING } : {}),
      ...(autoAssign === null ? {} : { [ASSIGNABLE_ROLE_COLUMNS[autoAssign.role]]: autoAssign.userId }),
      ...(toStatus === OrderStatus.COMPLETED ? { completedAt: now } : {}),
      ...(toStatus === OrderStatus.CANCELLED
        ? { cancelledAt: now, cancellationReason: comment }
        : {}),
      updatedAt: now,
    })
    .where(eq(orders.id, order.id))
    .returning();

  if (updated === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось обновить заказ' });
  }

  /*
    6a. Закрытый заказ сразу доходит до зарплаты.

    Сдельная за этапы назначена в самом заказе, но до ведомости она раньше
    добиралась только тогда, когда руководство вручную запускало месячный
    расчёт. Работа сделана и принята — начисление должно существовать в тот
    же момент, а не ждать чужого нажатия.
  */
  if (toStatus === OrderStatus.COMPLETED) {
    await accrueForClosedOrder(executor, updated);
  }

  /* 7. История — только добавление, никогда перезапись. */
  await executor.insert(orderStatusHistory).values({
    orderId: order.id,
    fromStatus,
    toStatus,
    changedBy: actor.id,
    comment: comment.length > 0 ? comment : null,
  });

  await recordAudit(executor, {
    actorId: actor.id,
    action: toStatus === OrderStatus.CANCELLED ? 'order.cancelled' : 'order.status_changed',
    entityType: 'order',
    entityId: order.id,
    details: {
      fromStatus,
      toStatus,
      comment: comment.length > 0 ? comment : null,
      systemInitiated: params.systemInitiated === true,
    },
    ipAddress: params.ipAddress ?? null,
  });

  /* 8. Уведомления участникам, кроме инициатора. */
  const recipients = collectOrderParticipants(updated).filter((id) => id !== actor.id);

  const context = {
    orderId: updated.id,
    orderNumber: orderLabel(updated),
    clientName: updated.clientName,
  };

  await notifyOrderStatusChanged(executor, context, recipients, {
    toStatus,
    isRollback: wasRollback,
    comment: comment.length > 0 ? comment : null,
    actorName: actor.fullName,
  });

  /*
    9. Свободный этап — зовём тех, кто может его взять.

    Уведомления выше уходят участникам заказа, а на этапе без назначенного
    исполнителя участников этой роли нет вовсе: админ перевёл заказ в
    «ждёт назначения швеи» — и об этом не узнала ни одна швея. Заказ лежал,
    пока кто-нибудь сам не откроет список и не заглянет в пул.

    Условие ровно то же, по которому `assertCanTouchOrder` пускает в пул
    постороннего: у статуса есть роль-владелец, а исполнитель не назначен.
    Разъехаться эти два места не могут — оба читают `STATUS_OWNER`.
  */
  const awaitingRole = STATUS_OWNER[toStatus];
  if (awaitingRole !== undefined && assigneeOf(updated, awaitingRole) === null) {
    await notifyStageAwaitingExecutor(executor, context, awaitingRole, actor.id);
  }

  // Карниз в очереди — та же рассылка «свободная работа», что и у этапов:
  // установщики узнают о нём, не открывая список.
  if (startsCornice) {
    await notifyStageAwaitingExecutor(
      executor,
      context,
      Role.CORNICE_INSTALLER,
      actor.id,
      'Карниз',
    );
  }

  return { order: updated, fromStatus, toStatus, wasRollback };
}

/**
 * Вправе ли сотрудник вообще обращаться к этому заказу.
 *
 * Обычное основание — участие в заказе: та же проверка, что у `orders.byId`.
 * Второе — общий пул этапа: пока исполнитель не назначен, заказ в
 * `pending_qc` принадлежит не конкретному контролёру, а всему цеху, и взять
 * его вправе любой сотрудник с нужной ролью (см. `resolveAutoAssignment`).
 * Без этого исключения проверка доступа закрыла бы пул наглухо.
 *
 * Отличие от `assertActorOwnsOrder`: та отвечает на вопрос «твой ли это
 * заказ», эта — «имеешь ли ты право о нём знать». Руководство проходит обе.
 */
function assertCanTouchOrder(
  order: Order,
  actor: AuthenticatedUser,
  fromStatus: OrderStatusName,
): void {
  if (canUserAccessOrder(order, actor)) return;

  const ownerRole = STATUS_OWNER[fromStatus];
  const isFreePool =
    ownerRole !== undefined &&
    assigneeOf(order, ownerRole) === null &&
    actor.roles.includes(ownerRole);

  if (isFreePool) return;

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Заказ недоступен: вы не участвуете в его выполнении',
  });
}

/**
 * Не даёт сотруднику двигать чужой заказ.
 *
 * Проверяется владелец ИСХОДНОГО статуса: заказ в пошиве принадлежит
 * назначенной швее, и «завершить пошив» может только она. Руководство
 * не ограничено — ему регулярно приходится закрывать пробелы за сотрудников.
 */
function assertActorOwnsOrder(
  order: Order,
  actor: AuthenticatedUser,
  fromStatus: OrderStatusName,
): void {
  if (isManagement(actor.roles)) return;

  const ownerRole = STATUS_OWNER[fromStatus];
  if (ownerRole === undefined) return;

  const ownerId = assigneeOf(order, ownerRole);
  // Исполнитель ещё не назначен — статус является общим пулом.
  if (ownerId === null) return;

  if (ownerId !== actor.id) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Заказ ${orderLabel(order)} закреплён за другим сотрудником`,
    });
  }
}

/**
 * Автоназначение исполнителя, который фактически выполнил этап.
 *
 * `pending_qc` — общий пул: кто из ОТК взял заказ в работу, тот и записывается
 * в `qc_id`. Иначе в заказе не осталось бы следа, кто именно проверял качество.
 */
function resolveAutoAssignment(
  order: Order,
  actor: AuthenticatedUser,
  toStatus: OrderStatusName,
): { readonly role: AssignableRole; readonly userId: number } | null {
  const isQcDecision = toStatus === OrderStatus.QC_PASSED || toStatus === OrderStatus.QC_FAILED;

  if (isQcDecision && order.qcId === null && actor.roles.includes(Role.QC)) {
    return { role: Role.QC, userId: actor.id };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                          Назначение исполнителя                            */
/* -------------------------------------------------------------------------- */

export interface AssignExecutorParams {
  readonly orderId: number;
  readonly role: AssignableRole;
  /** `null` — снять назначение. */
  readonly assigneeId: number | null;
  readonly actor: AuthenticatedUser;
  readonly ipAddress?: string | null;
}

/**
 * Назначает или снимает исполнителя.
 *
 * Назначение — отдельное действие, а не побочный эффект смены статуса:
 * админ может переназначить швею, не двигая заказ по этапам.
 */
export async function assignExecutor(
  executor: DbExecutor,
  params: AssignExecutorParams,
): Promise<Order> {
  const order = await loadOrderForUpdate(executor, params.orderId);
  const column = ASSIGNABLE_ROLE_COLUMNS[params.role];
  const previousId = assigneeOf(order, params.role);

  if (previousId === params.assigneeId) return order;

  if (params.assigneeId !== null) {
    await ensureUserHasRole(executor, params.assigneeId, params.role, params);
  }

  const [updated] = await executor
    .update(orders)
    .set({ [column]: params.assigneeId, updatedAt: new Date() })
    .where(eq(orders.id, order.id))
    .returning();

  if (updated === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Не удалось обновить заказ' });
  }

  await recordAudit(executor, {
    actorId: params.actor.id,
    action: 'order.assignee_changed',
    entityType: 'order',
    entityId: order.id,
    details: { role: params.role, from: previousId, to: params.assigneeId },
    ipAddress: params.ipAddress ?? null,
  });

  if (params.assigneeId !== null) {
    await notifyOrderAssigned(
      executor,
      {
        orderId: updated.id,
        orderNumber: orderLabel(updated),
        clientName: updated.clientName,
      },
      params.assigneeId,
      params.role,
    );
  }

  return updated;
}

/**
 * Проверяет, что назначаемый сотрудник существует и активен, и выдаёт ему
 * роль, если её ещё нет.
 *
 * Назначить можно любого: швея, которая сегодня едет на установку, — обычная
 * подработка, а не ошибка. Но переходы статусов и сдельная считаются по
 * ролям, и человек без роли не смог бы сдвинуть заказ ни на шаг и не попал
 * бы в ведомость. Поэтому назначение на работу и есть выдача роли — с
 * записью в журнал и уведомлением, как при выдаче вручную.
 */
async function ensureUserHasRole(
  executor: DbExecutor,
  userId: number,
  role: RoleName,
  params: { readonly actor: AuthenticatedUser; readonly ipAddress?: string | null },
): Promise<void> {
  const person = await executor.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isActive: true },
  });

  if (person === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Сотрудник не найден' });
  }
  if (!person.isActive) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Нельзя назначить деактивированного сотрудника',
    });
  }

  const granted = await executor
    .insert(userRoles)
    .values({ userId, role, grantedBy: params.actor.id })
    .onConflictDoNothing()
    .returning({ role: userRoles.role });

  if (granted.length === 0) return;

  await recordAudit(executor, {
    actorId: params.actor.id,
    action: 'user.role_granted',
    entityType: 'user',
    entityId: userId,
    details: { role, viaOrderAssignment: true },
    ipAddress: params.ipAddress ?? null,
  });

  await notifyRoleChanged(executor, userId, {
    role,
    granted: true,
    actorName: params.actor.fullName,
  });
}
