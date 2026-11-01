'use client';

import { MONITOR_GROUPS, MONITOR_POLL_MS, MonitorGroup } from '@curtain-crm/shared';
import { TRPCClientError } from '@trpc/client';
import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { useStaleSince } from '@/components/monitor/useMonitorBoard';
import { useTvRuntime } from '@/components/monitor/useTvRuntime';
import { TvMessage, TvWall, type TvWallGroup } from '@/components/monitor/TvWall';
import { TV_TEXT } from '@/components/monitor/tvLabels';
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
 * Экран «всё сразу» (переписка с заказчиком 25.10): обе группы и очереди
 * ОТК и карнизов одновременно, без ротации. Группа, выключенная в ссылке,
 * отвечает отказом и больше не опрашивается; её очередь сервер не отдаёт.
 * Отозвали ссылку — на следующем опросе экран сменится на «Ссылка
 * недействительна».
 */
export default function TvLinkPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const { idle } = useTvRuntime();
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
  const queues = trpc.display.queues.useQuery({ token }, options);

  const link = queries.workshop.data?.link ?? queries.installation.data?.link ?? null;
  const locale = link?.locale ?? 'ru';
  const text = TV_TEXT[locale];
  const revoked =
    MONITOR_GROUPS.some((group) => errorCode(queries[group].error) === 'NOT_FOUND') ||
    errorCode(queues.error) === 'NOT_FOUND';
  const bothOff = MONITOR_GROUPS.every((group) => errorCode(queries[group].error) === 'FORBIDDEN');

  // Свежесть — по самому старому из удачных ответов: экран честно говорит, от какого он момента.
  const updatedAt = Math.min(
    ...[queries.workshop, queries.installation, queues]
      .map((query) => query.dataUpdatedAt)
      .filter((value) => value > 0),
  );
  const lastSuccess = Number.isFinite(updatedAt) ? updatedAt : 0;
  const stale = useStaleSince(lastSuccess);

  if (!valid || revoked || bothOff) {
    return <TvMessage title={text.invalidTitle} hint={text.invalidHint} />;
  }

  // Ссылка ещё не ответила: показываем обе группы заготовками, выключенная уйдёт с первым ответом.
  const groups: TvWallGroup[] = MONITOR_GROUPS.filter(
    (group) => link === null || (group === MonitorGroup.WORKSHOP ? link.showWorkshop : link.showInstallation),
  ).map((group) => ({ group, board: queries[group].data ?? null }));

  return (
    <TvWall
      groups={groups}
      queues={queues.data ?? null}
      branchName={link === null ? null : link.branchName}
      locale={locale}
      lastSuccessAt={lastSuccess === 0 ? null : new Date(lastSuccess)}
      stale={stale}
      idle={idle}
    />
  );
}
