'use client';

import {
  MONITOR_GROUP_LABELS,
  MONITOR_GROUPS,
  MONITOR_POLL_MS,
  MonitorGroup,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';
import { TRPCClientError } from '@trpc/client';
import { useParams } from 'next/navigation';
import { useState, type ReactElement } from 'react';

import { TvBoard, TvMessage } from '@/components/monitor/TvBoard';
import { TV_TEXT } from '@/components/monitor/tvLabels';
import { useStaleSince } from '@/components/monitor/useMonitorBoard';
import { useTvRotation } from '@/components/monitor/useTvRotation';
import { useTvRuntime } from '@/components/monitor/useTvRuntime';
import { trpc } from '@/lib/trpc';

/** Код ответа tRPC, если ошибка пришла от сервера. */
function errorCode(error: unknown): string | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data: unknown = error.data;
  return typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string' ? data.code : null;
}

/** Ссылки нет или группа на ней выключена: повторять незачем, ответ не изменится. */
const isFinal = (error: unknown): boolean => {
  const code = errorCode(error);
  return code === 'NOT_FOUND' || code === 'FORBIDDEN' || code === 'BAD_REQUEST';
};

/**
 * Табло для телевизора в цеху — по секретной ссылке, без входа.
 *
 * Обе группы запрашиваются сразу: та, что выключена в ссылке, отвечает
 * отказом и больше не опрашивается, а включённые сменяют друг друга без
 * ожидания загрузки. Отозвали ссылку — на следующем опросе экран сменится
 * на «Ссылка недействительна».
 */
export default function TvLinkPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const { idle } = useTvRuntime();
  const [pages, setPages] = useState(1);
  const valid = token.length >= 20 && token.length <= 100;

  const options = {
    enabled: valid,
    refetchInterval: (query: { readonly state: { readonly error: unknown } }) =>
      isFinal(query.state.error) ? false : MONITOR_POLL_MS,
    retry: (failureCount: number, error: unknown) => !isFinal(error) && failureCount < 3,
  };
  const queries = {
    [MonitorGroup.WORKSHOP]: trpc.display.board.useQuery({ token, group: MonitorGroup.WORKSHOP }, options),
    [MonitorGroup.INSTALLATION]: trpc.display.board.useQuery({ token, group: MonitorGroup.INSTALLATION }, options),
  } as const;

  const groups: MonitorGroupName[] = MONITOR_GROUPS.filter(
    (group) => queries[group].data !== undefined && errorCode(queries[group].error) !== 'FORBIDDEN',
  );
  const rotation = useTvRotation(groups, pages);
  const current = rotation.group ?? MonitorGroup.WORKSHOP;
  const query = queries[current];
  const stale = useStaleSince(query.dataUpdatedAt);

  const link = queries.workshop.data?.link ?? queries.installation.data?.link ?? null;
  const locale = link?.locale ?? 'ru';
  const text = TV_TEXT[locale];
  const revoked = MONITOR_GROUPS.some((group) => errorCode(queries[group].error) === 'NOT_FOUND');
  const bothOff = MONITOR_GROUPS.every((group) => errorCode(queries[group].error) === 'FORBIDDEN');

  if (!valid || revoked || bothOff) {
    return <TvMessage title={text.invalidTitle} hint={text.invalidHint} />;
  }

  const board = groups.includes(current) ? (query.data ?? null) : null;

  return (
    <TvBoard
      board={board}
      group={current}
      title={MONITOR_GROUP_LABELS[locale][current]}
      branchName={link === null ? null : link.branchName}
      locale={locale}
      lastSuccessAt={query.dataUpdatedAt === 0 ? null : new Date(query.dataUpdatedAt)}
      stale={stale}
      rotation={
        rotation.next === null
          ? null
          : {
              nextLabel: MONITOR_GROUP_LABELS[locale][rotation.next],
              startedAt: rotation.startedAt,
              durationMs: rotation.durationMs,
            }
      }
      idle={idle}
      onPagesChange={setPages}
    />
  );
}
