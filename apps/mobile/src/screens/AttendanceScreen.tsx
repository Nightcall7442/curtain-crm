import { useMemo, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, tabBarSpace, typography } from '../theme';

/**
 * Явка цеха: кто пришёл, во сколько, кто сейчас на месте и кто на перерыве.
 *
 * Это то, что видит директор вместо свайпа отметки. Сам он смену не
 * открывает — ему нужно знать, кто открыл, — и лента с кольцом таймера на
 * его экране была просто занятым местом.
 *
 * Считается по сменам сегодняшнего дня, а не по «списку сотрудников со
 * статусом»: смена — это факт с временем начала, и вопрос «во сколько
 * пришёл» отвечается ею напрямую. Кого сегодня нет, того в списке нет —
 * отсутствие видно по короткому списку, а не по строке «не пришёл».
 */
export function AttendanceScreen(): ReactElement {
  /* Границы суток берутся на каждый рендер, а не запоминаются: экран живёт
     открытым и после полуночи должен показывать уже новый день. */
  const { from, to } = todayBounds();

  const shifts = trpc.shifts.list.useQuery({ page: 1, pageSize: 100, from, to });
  const breaks = trpc.shifts.activeBreaks.useQuery();

  const refresh = (): void => {
    void shifts.refetch();
    void breaks.refetch();
  };

  /** Кто сейчас на перерыве — по id, чтобы пометить строку в общем списке. */
  const onBreak = useMemo(
    () => new Map((breaks.data ?? []).map((item) => [item.userId, item])),
    [breaks.data],
  );

  if (shifts.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={shifts.error.message} />
      </View>
    );
  }

  const rows = shifts.data?.items ?? [];
  const working = rows.filter((row) => row.endedAt === null);
  const finished = rows.filter((row) => row.endedAt !== null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={shifts.isFetching && !shifts.isLoading}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      <Card>
        <CardTitle title="Сейчас в цеху" icon="people" />

        {shifts.data === undefined ? (
          <Skeleton />
        ) : working.length === 0 ? (
          <Empty message="Смену никто не открыл" hint="Здесь появятся те, кто отметился" />
        ) : (
          working.map((row) => {
            const rest = onBreak.get(row.userId);

            return (
              <View key={`${row.userId.toString()}-${row.startedAt.toISOString()}`} style={styles.row}>
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.userFullName}
                  </Text>
                  <Text style={styles.meta}>
                    {rest === undefined
                      ? `с ${clock(row.startedAt)} · ${elapsed(row.startedAt)}`
                      : `с ${clock(row.startedAt)} · перерыв с ${clock(rest.startedAt)}`}
                  </Text>
                </View>

                {/*
                  Перерыв — отдельная пометка, а не отдельный список. Человек
                  на перерыве всё равно на смене, и вынести его в другую
                  карточку значило бы дважды отвечать на вопрос «кто на
                  месте».
                */}
                <Pill
                  text={rest === undefined ? 'работает' : 'перерыв'}
                  tone={rest === undefined ? 'positive' : 'warning'}
                />
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <CardTitle title="Уже ушли" icon="shift" />

        {shifts.data === undefined ? (
          <Skeleton rows={2} />
        ) : finished.length === 0 ? (
          <Empty message="Смены никто не закрыл" />
        ) : (
          finished.map((row) => (
            <View key={`${row.userId.toString()}-${row.startedAt.toISOString()}`} style={styles.row}>
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.userFullName}
                </Text>
                <Text style={styles.meta}>
                  {`${clock(row.startedAt)} — ${
                    row.endedAt === null ? '' : clock(row.endedAt)
                  } · ${worked(row.startedAt, row.endedAt)}`}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <Text style={styles.note}>
        {`Сегодня отметились: ${rows.length.toString()}. Кого нет в списке — тот
        смену не открывал.`}
      </Text>
    </ScrollView>
  );
}

/** Полночь сегодняшняя и завтрашняя — окно, за которое берутся смены. */
function todayBounds(): { readonly from: Date; readonly to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

const clock = (value: Date): string =>
  value.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

/** Сколько прошло с начала смены — в часах и минутах. */
function elapsed(startedAt: Date): string {
  return humanize(Date.now() - startedAt.getTime());
}

function worked(startedAt: Date, endedAt: Date | null): string {
  if (endedAt === null) return '';
  return humanize(endedAt.getTime() - startedAt.getTime());
}

function humanize(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes.toString()} мин` : `${hours.toString()} ч ${(minutes % 60).toString()} мин`;
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
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
