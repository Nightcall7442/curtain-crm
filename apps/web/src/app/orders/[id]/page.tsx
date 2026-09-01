'use client';

import {
  formatDimensions,
  formatMoney,
  formatPhone,
  isTerminalStatus,
  ORDER_ITEM_KIND_LABELS_RU,
  ORDER_STATUS_LABELS_RU,
  parseMoney,
  ROLE_LABELS_RU,
  TransitionKind,
  type AssignableRole,
  type OrderStatus,
} from '@curtain-crm/shared';
import { ArrowLeft, MessageSquare, Phone, Send } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import { OrderManagePanel } from '@/components/orders/OrderManagePanel';
import { OrderPhotos } from '@/components/orders/OrderPhotos';
import { OrderPurchases } from '@/components/orders/OrderPurchases';
import { VoiceRecorder } from '@/components/orders/VoiceRecorder';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { OrderStatusBadge, OrderTypeBadge, PriorityBadge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, EmptyState, ErrorState, Skeleton } from '@/components/ui/Card';
import { controlClass } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { formatDate, formatDateTime, formatQuantity } from '@/lib/utils';

/**
 * Карточка заказа.
 *
 * Кнопки действий строятся строго по ответу `orders.availableTransitions`:
 * фронтенд не решает сам, что доступно этой роли. Обязательность комментария
 * тоже приходит оттуда — правило живёт в таблице переходов, а не в двух местах.
 */
export default function OrderDetailPage(): ReactElement {
  const toast = useToast();
  const params = useParams<{ id: string }>();
  const orderId = Number.parseInt(params.id, 10);

  const { isManagement } = useAuth();
  const utils = trpc.useUtils();
  const [comment, setComment] = useState('');
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');

  const order = trpc.orders.byId.useQuery({ id: orderId }, { enabled: Number.isInteger(orderId) });
  const transitions = trpc.orders.availableTransitions.useQuery(
    { id: orderId },
    { enabled: Number.isInteger(orderId) },
  );
  const history = trpc.orders.history.useQuery(
    { id: orderId },
    { enabled: Number.isInteger(orderId) },
  );
  const comments = trpc.orderComments.listByOrder.useQuery(
    { orderId },
    { enabled: Number.isInteger(orderId) },
  );
  // Себестоимость и маржа показываются в блоке «Закупки» — там же,
  // где их формируют, чтобы цифра и её причина были на одном экране.

  const refetchAll = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.orders.availableTransitions.invalidate({ id: orderId }),
      utils.orders.history.invalidate({ id: orderId }),
    ]);
  };

  const changeStatus = trpc.orders.changeStatus.useMutation({
    async onSuccess(_result, variables) {
      setPendingStatus(null);
      setReason('');
      await refetchAll();
      // Называем новый статус: сотрудник нажимает кнопку перехода десятки раз
      // за смену, и подтверждение «заказ передан на пошив» отличается от
      // «заказ принят» — из одного факта «сохранено» этого не видно.
      toast.success(`Заказ переведён: ${ORDER_STATUS_LABELS_RU[variables.toStatus]}`);
    },
    onError(error) {
      toast.error('Не удалось сменить статус', error.message);
    },
  });

  const addComment = trpc.orderComments.add.useMutation({
    async onSuccess() {
      setComment('');
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
    onError(error) {
      // Текст комментария намеренно НЕ очищается при ошибке: он остаётся
      // в поле, и написанное не пропадает вместе с неудачным запросом.
      toast.error('Комментарий не отправлен', error.message);
    },
  });

  if (!Number.isInteger(orderId)) {
    return (
      <Card>
        <ErrorState message="Некорректный номер заказа в адресе страницы" />
      </Card>
    );
  }

  if (order.isError) {
    return (
      <Card>
        <ErrorState
          message={order.error.message}
          onRetry={() => {
            void order.refetch();
          }}
        />
      </Card>
    );
  }

  if (order.isLoading || order.data === undefined) {
    return <Skeleton className="h-96" />;
  }

  const data = order.data;

  return (
    /*
      Две колонки от `lg` (ревизия «Диспетчерская», П2): слева — жизнь заказа
      (позиции, закупки, фото, история, комментарии), справа — узкая колонка
      управления, прилипающая при прокрутке. Раньше все секции шли простынёй
      во всю ширину: на обычном мониторе половина экрана пустовала, а до
      комментариев было шесть прокруток.
    */
    <div className="space-y-4">
      {/* --- Шапка заказа --------------------------------------------------- */}
      <Card>
        <CardBody className="flex flex-wrap items-start gap-4">
          <Link
            href="/orders"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-subtle text-secondary transition-colors hover:bg-raised hover:text-primary"
            aria-label="К списку заказов"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-heading font-semibold text-primary">
                {data.orderNumber ?? `#${data.id.toString()}`}
              </h2>
              <OrderStatusBadge status={data.status} />
              <PriorityBadge priority={data.priority} />
              <OrderTypeBadge orderType={data.orderType} />
            </div>

            <p className="mt-1 text-caption text-secondary">
              {data.clientName}
              <a href={`tel:${data.clientPhone}`} className="ml-3 inline-flex items-center gap-1 hover:text-accent">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {formatPhone(data.clientPhone)}
              </a>
            </p>

            {data.installAddress !== null && (
              <p className="mt-1 text-footnote text-muted">{data.installAddress}</p>
            )}
          </div>

          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-1 text-footnote sm:grid-cols-3">
            <MoneyItem label="Стоимость работ" value={data.workPrice} />
            <MoneyItem label="Предоплата" value={data.deposit} />
            <MoneyItem label="Остаток" value={data.remainingPayment} />
            <div>
              <dt className="text-muted">Срок</dt>
              <dd className="text-primary">{formatDate(data.deadline)}</dd>
            </div>
            <div>
              <dt className="text-muted">Филиал</dt>
              <dd className="text-primary">{data.branch.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Создал</dt>
              <dd className="text-primary">{data.creator.fullName}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      {/*
        Правая колонка — управление. `sticky` держит действия под рукой,
        пока левая колонка прокручивается; в один столбец (до `lg`) порядок
        в разметке ставит её ПЕРВОЙ — действия важнее длинных списков.
      */}
      <div className="space-y-4 lg:sticky lg:top-20 lg:order-2">
      {/* --- Действия ------------------------------------------------------- */}
      <Card>
        <CardHeader title="Действия по заказу" />
        <CardBody>
          {transitions.isLoading ? (
            <Skeleton className="h-10" />
          ) : transitions.data === undefined || transitions.data.length === 0 ? (
            <EmptyState
              message="Доступных действий нет"
              hint="Либо заказ закрыт, либо этот этап ведёт другой сотрудник"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {transitions.data.map((transition) => (
                <button
                  key={transition.to}
                  type="button"
                  disabled={changeStatus.isPending}
                  onClick={() => {
                    if (transition.requiresComment) {
                      setPendingStatus(transition.to);
                      setReason('');
                      return;
                    }
                    changeStatus.mutate({ id: orderId, toStatus: transition.to });
                  }}
                  className={
                    transition.kind === TransitionKind.FORWARD
                      ? 'rounded border border-positive/40 bg-positive/10 px-3 py-1.5 text-caption text-positive transition-colors hover:bg-positive/20 disabled:opacity-50'
                      : transition.kind === TransitionKind.CANCEL
                        ? 'rounded border border-danger/40 bg-danger/10 px-3 py-1.5 text-caption text-danger transition-colors hover:bg-danger/20 disabled:opacity-50'
                        : 'rounded border border-warning/40 bg-warning/10 px-3 py-1.5 text-caption text-warning transition-colors hover:bg-warning/20 disabled:opacity-50'
                  }
                >
                  {transition.label}
                </button>
              ))}
            </div>
          )}

          {/* Форма причины — появляется только для действий, где она обязательна */}
          {pendingStatus !== null && (
            <div className="mt-4 rounded border border-warning/30 bg-warning/5 p-3">
              <p className="text-caption text-primary">
                {`Переход в «${ORDER_STATUS_LABELS_RU[pendingStatus]}» требует причины`}
              </p>
              <textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
                rows={2}
                placeholder="Опишите причину — она попадёт в историю заказа и в уведомление участникам"
                className={controlClass('md', 'mt-2')}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={reason.trim().length < 3 || changeStatus.isPending}
                  onClick={() => {
                    changeStatus.mutate({
                      id: orderId,
                      toStatus: pendingStatus,
                      comment: reason.trim(),
                    });
                  }}
                  className="pressable rounded-tile bg-accent px-3.5 py-2 text-caption font-medium text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Подтвердить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingStatus(null);
                  }}
                  className="pressable rounded-tile border border-subtle px-3.5 py-2 text-caption text-secondary hover:bg-raised hover:text-primary"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {changeStatus.error !== null && (
            <p role="alert" className="mt-3 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-footnote text-danger">
              {changeStatus.error.message}
            </p>
          )}
        </CardBody>
      </Card>

      {/* --- Управление (только руководство) -------------------------------- */}
      {isManagement && (
        <OrderManagePanel
          orderId={orderId}
          current={{
            master: data.masterId,
            sewer: data.sewerId,
            qc: data.qcId,
            installer: data.installerId,
          }}
          workPrice={data.workPrice}
          deposit={data.deposit}
          isClosed={isTerminalStatus(data.status)}
        />
      )}

      {/*
        Руководителю карточка «Исполнители» не показывается: те же четыре роли
        стоят в «Управлении заказом», уже выпадающими списками. Читать их
        дважды незачем.
      */}
      {!isManagement && (
        <Card>
          <CardHeader title="Исполнители" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-footnote">
              <Assignee role="master" person={data.master} />
              <Assignee role="sewer" person={data.sewer} />
              <Assignee role="qc" person={data.qc} />
              <Assignee role="installer" person={data.installer} />
            </dl>
          </CardBody>
        </Card>
      )}
      </div>

      {/* --- Левая колонка: жизнь заказа ------------------------------------ */}
      <div className="space-y-4 lg:col-span-2 lg:order-1">
      <section className="grid gap-3">
        {/* --- Позиции ------------------------------------------------------ */}
        <Card>
          <CardHeader title="Позиции заказа" />
          <CardBody>
            {data.items.length === 0 ? (
              <EmptyState message="В заказе нет позиций" />
            ) : (
              <ul className="space-y-4">
                {data.items.map((item, index) => (
                  <li key={item.id} className="rounded border border-subtle bg-base/40 p-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-caption font-medium text-primary">
                        {`${(index + 1).toString()}. ${item.model ?? 'Без модели'}`}
                      </span>
                      <span className="text-footnote text-muted">
                        {ORDER_ITEM_KIND_LABELS_RU[item.kind]}
                        {item.quantity > 1 ? ` · ${item.quantity.toString()} шт` : ''}
                      </span>
                    </div>

                    {/*
                      `auto-fit`, а не брейкпоинты: ширина карточки зависит
                      от роли, а не от экрана — руководителю позиции показаны
                      во всю ширину, сотруднику в половину. Медиазапросы Tailwind
                      смотрят на окно и в обоих случаях дали бы одно и то же:
                      либо две колонки на всю ширину с провалом посередине,
                      либо четыре — с переносом в узкой.
                    */}
                    <dl className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-1.5 text-footnote">
                      {item.widthCm !== null && item.heightCm !== null && (
                        <Detail
                          label="Размеры"
                          value={formatDimensions({
                            widthCm: Number.parseFloat(item.widthCm),
                            heightCm: Number.parseFloat(item.heightCm),
                            areaM2: item.areaM2 === null ? 0 : Number.parseFloat(item.areaM2),
                            normalized: '',
                          })}
                        />
                      )}
                      {item.areaM2 !== null && (
                        <Detail label="Площадь" value={`${formatQuantity(Number.parseFloat(item.areaM2), 2)} м²`} />
                      )}
                      {item.materials.length > 0 && (
                        <Detail label="Материалы" value={item.materials.join(', ')} />
                      )}
                      {item.materialOptions.length > 0 && (
                        <Detail label="Опции материала" value={item.materialOptions.join(', ')} />
                      )}
                      {item.color !== null && <Detail label="Цвет" value={item.color} />}
                      {item.cornice !== null && <Detail label="Карниз, код" value={item.cornice} />}
                      {item.corniceRotation !== null && (
                        <Detail label="Поворот карниза" value={item.corniceRotation} />
                      )}
                      {item.tulle !== null && <Detail label="Тюль, код" value={item.tulle} />}
                      {item.hasProtection && (
                        <Detail label="Антимоскитная сетка" value="Нужна" />
                      )}
                      {item.accessories.length > 0 && (
                        <Detail
                          label="Аксессуары"
                          value={item.accessories
                            .map(
                              (accessory) =>
                                `${accessory.name} × ${accessory.quantity.toString()}` +
                                (accessory.code === null ? '' : ` (${accessory.code})`),
                            )
                            .join(', ')}
                          className="col-span-2"
                        />
                      )}
                      {item.characteristics !== null && (
                        <Detail
                          label="Характеристики"
                          value={item.characteristics}
                          className="col-span-2"
                        />
                      )}
                    </dl>

                    {item.comment !== null && (
                      <p className="mt-2 text-footnote text-muted">{item.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

      </section>

      {/* --- Закупки и фото ------------------------------------------------- */}
      <OrderPurchases orderId={orderId} />
      <OrderPhotos orderId={orderId} orderStatus={data.status} />

      {/* --- История и комментарии ------------------------------------------ */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="История статусов" />
          <CardBody>
            {history.isLoading ? (
              <Skeleton className="h-32" />
            ) : history.data === undefined || history.data.length === 0 ? (
              <EmptyState message="История пуста" />
            ) : (
              <ol className="space-y-4">
                {history.data.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-subtle pl-3">
                    <div className="flex flex-wrap items-center gap-2 text-footnote">
                      {entry.fromStatus !== null && (
                        <>
                          <span className="text-muted">
                            {ORDER_STATUS_LABELS_RU[entry.fromStatus]}
                          </span>
                          <span aria-hidden className="text-muted">
                            →
                          </span>
                        </>
                      )}
                      <span className="text-primary">
                        {ORDER_STATUS_LABELS_RU[entry.toStatus]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-overline text-muted">
                      {`${entry.changedByName} · ${formatDateTime(entry.createdAt)}`}
                    </p>
                    {entry.comment !== null && (
                      <p className="mt-1 text-footnote text-secondary">{entry.comment}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Комментарии" icon={<MessageSquare className="h-4 w-4" />} />
          <CardBody>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (comment.trim().length === 0) return;
                addComment.mutate({ orderId, body: comment.trim() });
              }}
              className="mb-3 flex gap-2"
            >
              <input
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                }}
                placeholder="Написать комментарий участникам заказа"
                className={controlClass('md', 'min-w-0 flex-1')}
              />
              <button
                type="submit"
                disabled={addComment.isPending || comment.trim().length === 0}
                aria-label="Отправить"
                className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            <VoiceRecorder orderId={orderId} />

            {comments.isLoading ? (
              <Skeleton className="h-24" />
            ) : comments.data === undefined || comments.data.length === 0 ? (
              <EmptyState message="Комментариев пока нет" />
            ) : (
              <ul className="space-y-2.5">
                {comments.data.map((entry) => (
                  <li key={entry.id} className="rounded border border-subtle bg-base/40 p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-footnote text-primary">{entry.authorName}</span>
                      <span className="text-overline text-muted">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </div>

                    {entry.isVoice ? (
                      <div className="mt-1.5">
                        {entry.voiceUrl === null ? (
                          <span className="text-footnote text-muted">
                            Голосовое сообщение недоступно
                          </span>
                        ) : (
                          <audio controls src={entry.voiceUrl} className="h-8 w-full">
                            <track kind="captions" />
                          </audio>
                        )}
                        {entry.body !== null && (
                          <p className="mt-1 text-footnote text-secondary">{entry.body}</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-footnote text-secondary">{entry.body}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
      </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string;
  /** Для длинных значений вроде характеристик — занять всю ширину сетки. */
  readonly className?: string;
}): ReactElement {
  return (
    <div className={className}>
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-pre-line text-primary">{value}</dd>
    </div>
  );
}

function MoneyItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null;
}): ReactElement {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-primary">{value === null ? '—' : formatMoney(parseMoney(value))}</dd>
    </div>
  );
}

function Assignee({
  role,
  person,
}: {
  readonly role: AssignableRole;
  readonly person: { readonly fullName: string; readonly phone: string } | null;
}): ReactElement {
  return (
    <div>
      <dt className="text-muted">{ROLE_LABELS_RU[role]}</dt>
      <dd className="text-primary">
        {person === null ? <span className="text-muted">не назначен</span> : person.fullName}
      </dd>
    </div>
  );
}
