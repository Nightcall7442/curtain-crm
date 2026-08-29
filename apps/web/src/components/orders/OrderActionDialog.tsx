'use client';

import {
  missingAssigneeFor,
  ORDER_STATUS_LABELS,
  pluralize,
  ROLE_LABELS,
  TransitionKind,
  type AssigneeKind,
  type OrderStatus,
  type Role,
  type TransitionKind as TransitionKindName,
} from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';

import { useLocale } from '@/components/providers/LocaleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, Field, FormError, Modal, Select, Textarea } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Подтверждение действия по заказам — одно на все случаи.
 *
 * И кнопка в строке списка, и массовая операция над выделенными заказами
 * приходят сюда. Разница между «одним заказом» и «восемью» — только в тексте
 * и в отчёте: правила, поля и обработка отказов у них общие, и разводить их
 * по двум компонентам значило бы чинить каждую ошибку дважды.
 *
 * Окно спрашивает РОВНО то, чего не хватает: исполнителя, если целевой статус
 * без него невозможен, и причину, если переход — откат, отклонение или отмена.
 * Когда не нужно ни того, ни другого, окно не открывается вовсе — вызывающая
 * сторона выполняет действие сразу.
 */

/** Заказ, к которому применяется действие. */
export interface OrderActionOrder {
  readonly id: number;
  /** Номер для отчёта и подписи: `DH-000161`. */
  readonly label: string;
  readonly assigned: Readonly<Partial<Record<AssigneeKind, number | null>>>;
}

export interface OrderAction {
  readonly toStatus: OrderStatus;
  readonly label: string;
  readonly kind: TransitionKindName;
  readonly requiresComment: boolean;
}

export interface OrderActionTarget {
  readonly orders: readonly OrderActionOrder[];
  readonly action: OrderAction;
}

/**
 * Чего не хватает для действия.
 *
 * Исполнителя спрашиваем, если ХОТЯ БЫ ОДНОМУ из заказов его недостаёт.
 * Когда назначены все — поля нет: подставлять его «на всякий случай» значит
 * молча переназначить чужую работу тому, кого выбрали последним.
 */
export function actionNeedsAssignee(target: OrderActionTarget): AssigneeKind | null {
  for (const order of target.orders) {
    const missing = missingAssigneeFor(target.action.toStatus, order.assigned);
    if (missing !== null) return missing;
  }
  return null;
}

/**
 * Нужно ли открывать окно, или действие можно выполнить сразу по нажатию.
 *
 * Массовое действие подтверждается ВСЕГДА, даже когда спрашивать нечего:
 * одно нажатие, меняющее разом два десятка заказов, обязано показать, что
 * именно и со сколькими произойдёт. Для одиночной строки такого требования
 * нет — там кнопка подписана действием и стоит в строке того заказа, к
 * которому относится, а ошибочный переход отыгрывается откатом.
 */
export function actionNeedsDialog(target: OrderActionTarget): boolean {
  return (
    target.orders.length > 1 ||
    target.action.requiresComment ||
    actionNeedsAssignee(target) !== null
  );
}

export function OrderActionDialog({
  target,
  onClose,
  onDone,
}: {
  readonly target: OrderActionTarget | null;
  readonly onClose: () => void;
  /** Вызывается после успешного выполнения — обновить список и снять выделение. */
  readonly onDone: () => void;
}): ReactElement | null {
  const toast = useToast();
  const { t } = useLocale();

  const [comment, setComment] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [failures, setFailures] = useState<readonly { id: number; message: string }[]>([]);

  // Каждое новое действие открывает окно с чистого листа: причина отмены,
  // оставшаяся в поле от прошлого заказа, попала бы в историю следующего.
  useEffect(() => {
    setComment('');
    setAssigneeId('');
    setFailures([]);
  }, [target]);

  const run = trpc.orders.changeStatusBatch.useMutation();

  if (target === null) return null;

  const { orders, action } = target;
  const needsAssignee = actionNeedsAssignee(target);
  const isBulk = orders.length > 1;

  const commentReady = !action.requiresComment || comment.trim().length >= 3;
  const assigneeReady = needsAssignee === null || assigneeId !== '';

  const submit = (): void => {
    run.mutate(
      {
        ids: orders.map((order) => order.id),
        toStatus: action.toStatus,
        ...(action.requiresComment ? { comment: comment.trim() } : {}),
        ...(needsAssignee === null ? {} : { assigneeId: Number.parseInt(assigneeId, 10) }),
      },
      {
        onSuccess(result) {
          const byId = new Map(orders.map((order) => [order.id, order.label]));
          const failed = result.results
            .filter((entry) => !entry.ok)
            .map((entry) => ({
              id: entry.id,
              message: `${byId.get(entry.id) ?? `#${entry.id.toString()}`}: ${entry.message ?? 'отказано'}`,
            }));

          if (failed.length === 0) {
            toast.success(
              isBulk
                ? `${action.label}: ${pluralize(result.succeeded, ['заказ', 'заказа', 'заказов'])}`
                : action.label,
              isBulk ? undefined : (orders[0]?.label ?? undefined),
            );
            onDone();
            onClose();
            return;
          }

          /*
            Часть заказов не прошла — окно остаётся открытым со списком причин.
            Закрыть его и показать «готово» было бы враньём, а показать одну
            общую ошибку — бесполезно: причины у заказов разные, и человеку
            нужно знать, с каким именно разбираться.
          */
          setFailures(failed.map((entry) => ({ id: entry.id, message: entry.message })));
          if (result.succeeded > 0) onDone();
        },
      },
    );
  };

  return (
    <Modal
      open
      title={action.label}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {failures.length > 0 ? 'Закрыть' : 'Отмена'}
          </Button>
          <Button
            variant={action.kind === TransitionKind.CANCEL ? 'danger' : 'primary'}
            loading={run.isPending}
            disabled={!commentReady || !assigneeReady}
            onClick={submit}
          >
            {isBulk ? `Применить к ${orders.length.toString()}` : 'Подтвердить'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError message={run.error?.message ?? null} />

        <p className="text-caption text-secondary">
          {isBulk
            ? `${pluralize(orders.length, ['Заказ', 'Заказа', 'Заказов'])} перейдут в статус «${t(ORDER_STATUS_LABELS, action.toStatus)}».`
            : `Заказ ${orders[0]?.label ?? ''} перейдёт в статус «${t(ORDER_STATUS_LABELS, action.toStatus)}».`}
        </p>

        {needsAssignee !== null && (
          <AssigneePicker
            role={needsAssignee}
            value={assigneeId}
            onChange={setAssigneeId}
            hint={
              isBulk
                ? 'Будет назначен на все выбранные заказы, у которых исполнителя ещё нет'
                : undefined
            }
          />
        )}

        {action.requiresComment && (
          <Field
            label="Причина"
            required
            hint="Попадёт в историю заказа и в уведомление участникам"
          >
            <Textarea
              rows={3}
              value={comment}
              autoFocus
              onChange={(event) => {
                setComment(event.target.value);
              }}
              placeholder="Например: размеры не совпали с проёмом"
            />
          </Field>
        )}

        {failures.length > 0 && (
          <div
            role="alert"
            className="rounded-tile border border-danger/30 bg-danger/[0.06] p-3"
          >
            <p className="text-caption font-medium text-danger">
              {`Не удалось: ${pluralize(failures.length, ['заказ', 'заказа', 'заказов'])}`}
            </p>
            <ul className="mt-1.5 space-y-1">
              {failures.map((failure) => (
                <li key={failure.id} className="text-footnote leading-snug text-secondary">
                  {failure.message}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-footnote text-muted">
              Остальные заказы переведены. Повторять действие по ним не нужно.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Выбор исполнителя на роль, которую требует целевой статус.
 *
 * Список — только активные сотрудники с этой ролью: назначить постороннего
 * невозможно, и сервер такую попытку отклонит независимо от того, что
 * покажет этот список.
 */
function AssigneePicker({
  role,
  value,
  onChange,
  hint,
}: {
  readonly role: AssigneeKind;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly hint?: string;
}): ReactElement {
  const { t } = useLocale();
  const candidates = trpc.users.listByRole.useQuery({ role: role satisfies Role });

  return (
    <Field label={t(ROLE_LABELS, role)} required hint={hint}>
      <Select
        value={value}
        autoFocus
        disabled={candidates.isLoading}
        placeholder={candidates.isLoading ? 'Загрузка…' : 'Выберите исполнителя'}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        options={(candidates.data ?? []).map((person) => ({
          value: person.id.toString(),
          label: person.fullName,
        }))}
      />
    </Field>
  );
}
