import { DayOffStatus } from '@curtain-crm/shared';

/**
 * Что нужно знать о запросе (выходной или опоздание), чтобы поставить его
 * в общий список в серверном порядке.
 *
 * `reviewedAt` обязателен: его отдают все четыре списка (`dayOff.my` —
 * тоже, с правок проверки). Прежде он был необязательным, и выходной без
 * него вставал в общий список по времени подачи, а не решения. `null` —
 * когда решения нет: у ждущих, а также у снятых руководителем (снятие
 * стирает отметку о решении). Такой запрос встаёт по времени подачи — так
 * же, как на сервере.
 */
export interface OrderedRequest {
  readonly id: number;
  readonly status: DayOffStatus;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
}

/**
 * Порядок сервера (`DAY_OFF_ORDER` и `LATE_ORDER`): ждущие решения сверху,
 * дальше — по времени решения или подачи, свежие первыми; при равенстве —
 * больший id выше.
 */
export function compareRequests(a: OrderedRequest, b: OrderedRequest): number {
  const rankA = a.status === DayOffStatus.PENDING ? 0 : 1;
  const rankB = b.status === DayOffStatus.PENDING ? 0 : 1;
  if (rankA !== rankB) return rankA - rankB;

  const timeA = (a.reviewedAt ?? a.createdAt).getTime();
  const timeB = (b.reviewedAt ?? b.createdAt).getTime();
  if (timeA !== timeB) return timeB - timeA;

  return b.id - a.id;
}

/**
 * Два списка, каждый уже упорядоченный сервером, — в один.
 *
 * Слиянием, а не сортировкой заново: внутри одного вида порядок остаётся
 * ровно серверным, даже когда ключа для сравнения не хватает (выходной без
 * `reviewedAt`). Сравнение решает только, чей запрос встанет следующим.
 */
export function mergeRequests<A extends OrderedRequest, B extends OrderedRequest>(
  first: readonly A[],
  second: readonly B[],
): (A | B)[] {
  const merged: (A | B)[] = [];
  let i = 0;
  let j = 0;

  while (i < first.length && j < second.length) {
    const a = first[i];
    const b = second[j];
    if (a === undefined || b === undefined) break;
    if (compareRequests(a, b) <= 0) {
      merged.push(a);
      i += 1;
    } else {
      merged.push(b);
      j += 1;
    }
  }

  return [...merged, ...first.slice(i), ...second.slice(j)];
}
