import { useIsFocused } from '@react-navigation/native';
import {
  filterPeople,
  LIVE_STATUS_LABELS,
  LiveStatus,
  MONITOR_POLL_MS,
  MonitorGroup,
  type LiveStatus as LiveStatusName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Empty, ErrorState, Skeleton } from '../components/Card';
import { MonitorPodium } from '../components/monitor/MonitorPodium';
import { STATUS_COLOR } from '../components/monitor/monitorStyle';
import { PersonRow } from '../components/monitor/PersonRow';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

/** Статусы, которые бывают у группы: на выезд ездят только выездные. */
const GROUP_STATUSES: Readonly<Record<MonitorGroup, readonly LiveStatusName[]>> = {
  [MonitorGroup.WORKSHOP]: [
    LiveStatus.WORKING,
    LiveStatus.IDLE,
    LiveStatus.BREAK,
    LiveStatus.FINISHED,
    LiveStatus.ABSENT,
    LiveStatus.DAY_OFF,
  ],
  [MonitorGroup.INSTALLATION]: [
    LiveStatus.TRIP,
    LiveStatus.WORKING,
    LiveStatus.IDLE,
    LiveStatus.BREAK,
    LiveStatus.FINISHED,
    LiveStatus.ABSENT,
    LiveStatus.DAY_OFF,
  ],
};

/**
 * Табло «Цех» или «Установщики» в приложении: чипы статусов, лучшие
 * прошлого месяца и люди по месту. Снимок обновляется каждые
 * `MONITOR_POLL_MS`, но только пока экран открыт: свёрнутое табло не
 * тратит связь в цеху.
 */
export function MonitorBoardScreen({ route, navigation }: RootStackScreenProps<'MonitorBoard'>): ReactElement {
  const { group } = route.params;
  const { m, locale } = useLocale();
  const focused = useIsFocused();
  const [status, setStatus] = useState<LiveStatusName | 'all'>('all');
  const board = trpc.monitor.board.useQuery(
    { group },
    { refetchInterval: focused ? MONITOR_POLL_MS : false, refetchOnWindowFocus: focused },
  );

  if (board.data === undefined) {
    return (
      <View style={styles.content}>{board.isError ? <ErrorState /> : <Skeleton rows={6} />}</View>
    );
  }

  const data = board.data;
  const unit = data.unit === 'pieces' ? m('monitor.pieces') : m('monitor.orders');
  const people = filterPeople(data.people, status, '');
  const chips: readonly { key: LiveStatusName | 'all'; label: string; count: number }[] = [
    { key: 'all', label: m('monitor.all'), count: data.people.length },
    ...GROUP_STATUSES[group].map((key) => ({
      key,
      label: LIVE_STATUS_LABELS[locale][key],
      count: data.statusCounts[key],
    })),
  ];

  return (
    <FlatList
      data={people}
      keyExtractor={(person) => person.userId.toString()}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={board.isFetching && !board.isLoading}
          onRefresh={() => {
            void board.refetch();
          }}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.summary}>
            {m('monitor.onShift', { n: data.summary.onShift, total: data.summary.headcount })}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
          >
            {chips.map((chip) => {
              const active = chip.key === status;
              return (
                <Pressable
                  key={chip.key}
                  onPress={() => {
                    setStatus(chip.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipActive : null]}
                >
                  {chip.key !== 'all' && (
                    <View style={[styles.chipDot, { backgroundColor: STATUS_COLOR[chip.key] }]} />
                  )}
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {`${chip.label} ${chip.count.toString()}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {status === 'all' && <MonitorPodium board={data} />}
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={<Empty message={data.people.length === 0 ? m('monitor.empty') : m('monitor.noneFiltered')} />}
      renderItem={({ item }) => (
        <PersonRow
          person={item}
          group={group}
          unit={unit}
          onPress={() => {
            navigation.navigate('MonitorPerson', { userId: item.userId });
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  header: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  summary: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // Ряд — по содержимому: иначе горизонтальный ScrollView растягивается и забирает прокрутку списка.
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  separator: {
    height: spacing.md,
  },
});
