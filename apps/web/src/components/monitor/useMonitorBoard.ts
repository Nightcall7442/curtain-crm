'use client';

import {
  MONITOR_POLL_MS,
  MONITOR_STALE_AFTER_MS,
  type MonitorGroup,
} from '@curtain-crm/shared';
import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { trpc } from '@/lib/trpc';

import type { BoardData } from './labels';

/**
 * Данные устарели: последний удачный ответ старше `MONITOR_STALE_AFTER_MS`.
 *
 * Таймер ставится на тот момент, когда данные устареют, а не тикает каждую
 * секунду: табло перерисовывается по ответам сервера, а не по часам.
 * `updatedAt` — `dataUpdatedAt` запроса, 0 — данных ещё не было.
 */
export function useStaleSince(updatedAt: number): boolean {
  const [staleFor, setStaleFor] = useState(0);

  useEffect(() => {
    if (updatedAt === 0) return undefined;
    const left = updatedAt + MONITOR_STALE_AFTER_MS - Date.now();
    if (left <= 0) {
      setStaleFor(updatedAt);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStaleFor(updatedAt);
    }, left);
    return () => {
      window.clearTimeout(timer);
    };
  }, [updatedAt]);

  // Отметка устаревания относится к конкретному ответу: пришёл новый — данные снова свежие.
  return updatedAt !== 0 && staleFor === updatedAt;
}

export interface MonitorBoardState {
  readonly board: BoardData | null;
  readonly isLoading: boolean;
  /** Последний запрос не удался. Данные, если были, остаются на экране. */
  readonly isError: boolean;
  readonly errorMessage: string | null;
  readonly refetch: () => void;
  readonly lastSuccessAt: Date | null;
  readonly stale: boolean;
}

/**
 * Снимок табло с опросом раз в `MONITOR_POLL_MS`.
 *
 * Во вкладке в фоне опрос стоит: табло никто не видит, а сервер считает.
 * При смене филиала на экране остаются прежние карточки, пока не придут
 * новые, — пустой экран на полсекунды читается как «все ушли».
 */
export function useMonitorBoard(group: MonitorGroup, branchId: number | null): MonitorBoardState {
  const query = trpc.monitor.board.useQuery(branchId === null ? { group } : { group, branchId }, {
    refetchInterval: MONITOR_POLL_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
  const stale = useStaleSince(query.dataUpdatedAt);

  return {
    board: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    errorMessage: query.error?.message ?? null,
    refetch: () => {
      void query.refetch();
    },
    lastSuccessAt: query.dataUpdatedAt === 0 ? null : new Date(query.dataUpdatedAt),
    stale,
  };
}
