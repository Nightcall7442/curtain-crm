import { CorniceStatus, type CorniceStatus as CorniceStatusName } from '../enums/corniceStatus.enum';
import { OrderStatus, type OrderStatus as OrderStatusName } from '../enums/orderStatus.enum';
import type { Translated } from '../i18n/locale';

/**
 * Очереди на ТВ: контроль качества и карнизы.
 *
 * Заказчик (переписка 25.10): «справа — контроль качества, очередь с
 * исполнителями; рядом — очередь на карнизы: номер заказа, исполнитель,
 * статус». Статус в очереди — короткий, для экрана в цеху: длинные подписи
 * статусов заказа («Брак, возврат на доработку») на ТВ не помещаются.
 */
export const QUEUE_STATUSES = ['sewn', 'checking', 'failed', 'waiting', 'taken'] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QueueStatus = {
  /** Пошив завершён, в ОТК ещё не передан. */
  SEWN: 'sewn',
  /** На контроле качества. */
  CHECKING: 'checking',
  /** ОТК нашёл брак — ждёт решения. */
  FAILED: 'failed',
  /** Карниз ждёт карнизчика. */
  WAITING: 'waiting',
  /** Карниз взят в работу. */
  TAKEN: 'taken',
} as const satisfies Record<string, QueueStatus>;

export const QUEUE_STATUS_LABELS: Translated<QueueStatus> = {
  ru: { sewn: 'Сшит, ждёт ОТК', checking: 'На контроле', failed: 'Брак', waiting: 'Ждёт карнизчика', taken: 'В работе' },
  uz: { sewn: 'Tikildi, OTK kutmoqda', checking: 'Nazoratda', failed: 'Brak', waiting: 'Karnizchini kutmoqda', taken: 'Ishda' },
};

/** Статусы заказа, при которых он стоит в очереди ОТК. */
export const QC_QUEUE_ORDER_STATUSES: readonly OrderStatusName[] = [
  OrderStatus.SEWING_DONE,
  OrderStatus.PENDING_QC,
  OrderStatus.QC_FAILED,
];

export function qcQueueStatusOf(status: OrderStatusName): QueueStatus | null {
  switch (status) {
    case OrderStatus.SEWING_DONE:
      return QueueStatus.SEWN;
    case OrderStatus.PENDING_QC:
      return QueueStatus.CHECKING;
    case OrderStatus.QC_FAILED:
      return QueueStatus.FAILED;
    default:
      return null;
  }
}

export function corniceQueueStatusOf(status: CorniceStatusName): QueueStatus | null {
  switch (status) {
    case CorniceStatus.PENDING:
      return QueueStatus.WAITING;
    case CorniceStatus.IN_PROGRESS:
      return QueueStatus.TAKEN;
    default:
      return null;
  }
}

/** Сколько строк в очереди на ТВ: больше экран не вместит, а сервер не тащит лишнего. */
export const QUEUE_LIMIT = 30;
