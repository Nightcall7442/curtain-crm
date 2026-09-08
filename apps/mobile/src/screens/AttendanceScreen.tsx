import { useMemo, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { InstallationTripCard } from '../components/InstallationTripCard';
import { ShiftControl } from '../components/ShiftControl';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, tabBarSpace, typography } from '../theme';

/**
 * Явка цеха: кто пришёл, во сколько, кто сейчас на месте, кто на перерыве и
 * кто уехал на установку. Плюс собственная отметка сверху.
 *
 * Это то, что видит руководство — директор и админ — вместо экрана одной
 * своей смены. Раньше экран показывал только чужую явку, и отметиться сам
 * руководитель из приложения не мог вовсе: его часов в табеле просто не
 * было. Теперь отмечаются все и все по GPS — тем же жестом и с той же
 * проверкой филиала, что у остальных.
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
  const trips = trpc.shifts.activeTrips.useQuery();
  const current = trpc.shifts.current.useQuery();

  const refresh = (): void => {
    void shifts.refetch();
    void breaks.refetch();
    void trips.refetch();
  };

  /** Кто сейчас на перерыве — по id, чтобы пометить строку в общем списке. */
  const onBreak = useMemo(
    () => new Map((breaks.data ?? []).map((item) => [item.userId, item])),
    [breaks.data],
  );

  /** Кто сейчас на установке — так же пометкой, а не отдельным списком. */
  const onTrip = useMemo(
    () => new Map((trips.data ?? []).map((item) => [item.userId, item])),
    [trips.data],
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
      {/*
        Своя смена — первым делом: руководитель тоже отмечается, и по тем же
        правилам. Кольцо таймера здесь выключено — под ним список явки, и
        два крупных блока подряд разводят внимание.
      */}
      <ShiftControl showTimer={false}>
        <InstallationTripCard shiftOpen={(current.data ?? null) !== null} />
      </ShiftControl>

      <Card>
        <CardTitle title="Сейчас в цеху" icon="people" />

        {shifts.data === undefined ? (
          <Skeleton />
        ) : working.length === 0 ? (
          <Empty message="Смену никто не открыл" hint="Здесь появятся те, кто отметился" />
        ) : (
          working.map((row) => {
            const rest = onBreak.get(row.userId);
            const trip = onTrip.get(row.userId);

            /*
              Выезд важнее перерыва, если вдруг открыты оба: «на установке»
              отвечает на вопрос «где человек», а перерыв — только на «чем
              занят». Одновременно они не открываются, но состояние из двух
              источников обязано иметь однозначный порядок.
            */
            const meta =
              trip !== undefined
                ? `с ${clock(row.startedAt)} · на установке с ${clock(trip.startedAt)}${
                    trip.orderNumber === null ? '' : ` · ${trip.orderNumber}`
                  }`
                : rest !== undefined
                  ? `с ${clock(row.startedAt)} · перерыв с ${clock(rest.startedAt)}`
                  : `с ${clock(row.startedAt)} · ${elapsed(row.startedAt)}`;

            return (
              <View key={`${row.userId.toString()}-${row.startedAt.toISOString()}`} style={styles.row}>
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.userFullName}
                  </Text>
                  <Text style={styles.meta}>{meta}</Text>
                </View>

                {/*
                  Перерыв и выезд — пометки, а не отдельные списки. Человек
                  и на перерыве, и на объекте всё равно на смене, и вынести
                  его в другую карточку значило бы дважды отвечать на вопрос
                  «кто сегодня работает».
                */}
                <Pill
                  text={trip !== undefined ? 'установка' : rest !== undefined ? 'перерыв' : 'работает'}
                  tone={trip !== undefined ? 'info' : rest !== undefined ? 'warning' : 'positive'}
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
