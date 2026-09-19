import { formatIsoDateShort, formatTime, SHIFT_ACTIVITY_LABELS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { InstallationTripCard } from '../components/InstallationTripCard';
import { ShiftControl } from '../components/ShiftControl';
import { useIsCeo } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, tabBarSpace, typography } from '../theme';
import { useLocale, type Translate } from '../hooks/useLocale';

/**
 * Явка цеха глазами руководителя: кто сейчас в цеху и чем занят, кто уже
 * ушёл, и что ждёт установки.
 *
 * Список — тот же `shifts.openNow`, что и на главной: одна выдача, одна
 * цифра «на смене» везде. У каждого — во сколько пришёл и дело: «шьёт
 * DH-0012», «на установке DH-0013». Дело выводится из заказов, а не
 * спрашивается у человека: заказ «в пошиве» на швее — значит, шьёт.
 *
 * Своя смена директору здесь не нужна — он её не открывает, и карточка
 * «Проведите, чтобы начать смену» первой строкой была ему помехой: владелец
 * её зачеркнул. Админ — сотрудник и отмечается, ему карточка остаётся.
 */
export function AttendanceScreen(): ReactElement {
  const { m, t } = useLocale();
  const isCeo = useIsCeo();

  const roster = trpc.shifts.openNow.useQuery();
  const queue = trpc.orders.installationQueue.useQuery();
  const current = trpc.shifts.current.useQuery(undefined, { enabled: !isCeo });

  const refresh = (): void => {
    void roster.refetch();
    void queue.refetch();
  };

  if (roster.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={roster.error.message} />
      </View>
    );
  }

  const rows = roster.data ?? [];
  const working = rows.filter((row) => row.endedAt === null);
  const finished = rows.filter((row) => row.endedAt !== null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={roster.isFetching && !roster.isLoading}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      {!isCeo && (
        <ShiftControl showTimer={false}>
          <InstallationTripCard shiftOpen={(current.data ?? null) !== null} />
        </ShiftControl>
      )}

      <Card>
        <CardTitle title={m('attendance.now')} icon="people" />

        {roster.data === undefined ? (
          <Skeleton />
        ) : working.length === 0 ? (
          <Empty message={m('attendance.nobodyOpened')} hint={m('attendance.nobodyOpenedHint')} />
        ) : (
          working.map((row) => {
            /*
              Дело важнее перерыва: «на установке DH-0013» отвечает, где
              человек, перерыв — только чем занят. Без заказа на руках —
              сколько уже в цеху.
            */
            const doing =
              row.activity !== null
                ? `${t(SHIFT_ACTIVITY_LABELS, row.activity)}${row.activityOrder === null ? '' : ` ${row.activityOrder}`}`
                : row.onBreak
                  ? m('attendance.break')
                  : elapsed(row.startedAt, m);

            return (
              <View
                key={`${row.userId.toString()}-${row.startedAt.toISOString()}`}
                style={styles.row}
              >
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  <Text style={styles.meta}>
                    {m('attendance.sinceDoing', { start: clock(row.startedAt), doing })}
                  </Text>
                </View>

                <Pill
                  text={
                    row.onTrip
                      ? m('attendance.trip')
                      : row.onBreak
                        ? m('attendance.break')
                        : m('attendance.working')
                  }
                  tone={row.onTrip ? 'info' : row.onBreak ? 'warning' : 'positive'}
                />
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <CardTitle title={m('attendance.queue')} icon="orders" />

        {queue.data === undefined ? (
          <Skeleton rows={2} />
        ) : queue.data.length === 0 ? (
          <Empty message={m('attendance.queueEmpty')} />
        ) : (
          queue.data.map((order) => (
            <View key={order.id} style={styles.row}>
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {order.orderNumber}
                  <Text style={styles.metaInline}>
                    {` · ${order.deadline === null ? m('attendance.noDeadline') : formatIsoDateShort(order.deadline)}`}
                  </Text>
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {order.installAddress ?? m('attendance.noAddress')}
                </Text>
              </View>
              <Text
                style={order.installerName === null ? styles.unassigned : styles.installer}
                numberOfLines={2}
              >
                {order.installerName ?? m('attendance.noInstaller')}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <CardTitle title={m('attendance.left')} icon="shift" />

        {roster.data === undefined ? (
          <Skeleton rows={2} />
        ) : finished.length === 0 ? (
          <Empty message={m('attendance.nobodyClosed')} />
        ) : (
          finished.map((row) => (
            <View
              key={`${row.userId.toString()}-${row.startedAt.toISOString()}`}
              style={styles.row}
            >
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.fullName}
                </Text>
                <Text style={styles.meta}>
                  {`${clock(row.startedAt)} — ${
                    row.endedAt === null ? '' : clock(row.endedAt)
                  } · ${worked(row.startedAt, row.endedAt, m)}`}
                  {/* Закрыл сервер, не человек: уход не отмечен, время условное. */}
                  {row.autoClosed ? ` · ${m('home.autoClosed')}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* Людей, не смен: кто отлучался и вернулся — открыл вторую, но он один. */}
      <Text style={styles.note}>
        {m('attendance.note', { n: new Set(rows.map((row) => row.userId)).size })}
      </Text>
    </ScrollView>
  );
}

const clock = (value: Date): string => formatTime(value);

/** Сколько прошло с начала смены — в часах и минутах. */
function elapsed(startedAt: Date, m: Translate): string {
  return humanize(Date.now() - startedAt.getTime(), m);
}

function worked(startedAt: Date, endedAt: Date | null, m: Translate): string {
  if (endedAt === null) return '';
  return humanize(endedAt.getTime() - startedAt.getTime(), m);
}

function humanize(ms: number, m: Translate): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0
    ? m('shift.minutes', { n: minutes })
    : m('shift.hoursMinutes', { h: hours, m: minutes % 60 });
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  metaInline: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  installer: {
    ...typography.caption,
    color: colors.textPrimary,
    maxWidth: '40%',
    textAlign: 'right',
  },
  unassigned: {
    ...typography.caption,
    color: colors.textMuted,
    maxWidth: '40%',
    textAlign: 'right',
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
