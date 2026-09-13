import {
  RATING_SCOPE_LABELS,
  RATING_SCOPES,
  RatingScope,
  type RatingScope as RatingScopeName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { ChipSelect } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, tabBarSpace, typography } from '../theme';

/**
 * Рейтинг всех сотрудников — директору.
 *
 * Та же таблица, что в панели (`rating.board`), но без аналитики: место,
 * имя, балл и сколько этапов закрыто. Кто вне конкурса — внизу серым с
 * причиной, чтобы не гадать, почему человека нет в списке.
 */
export function RatingBoardScreen(): ReactElement {
  const { t, m } = useLocale();
  const [scope, setScope] = useState<RatingScopeName>(RatingScope.MONTH);
  const now = new Date();
  const board = trpc.rating.board.useQuery({
    scope,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const rows = board.data?.rows ?? [];
  const ranked = rows.filter((row) => row.place !== null);
  const unranked = rows.filter((row) => row.place === null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={board.isFetching && !board.isLoading}
          onRefresh={() => {
            void board.refetch();
          }}
        />
      }
    >
      <ChipSelect
        value={scope}
        onChange={setScope}
        options={RATING_SCOPES.map((value) => ({ value, label: t(RATING_SCOPE_LABELS, value) }))}
      />

      <Card>
        <CardTitle title={m('ratingBoard.title')} icon="rating" />
        {board.isError ? (
          <ErrorState message={board.error.message} />
        ) : board.isLoading ? (
          <Skeleton rows={5} />
        ) : ranked.length === 0 ? (
          <Empty message={m('ratingBoard.empty')} />
        ) : (
          ranked.map((row) => (
            <View key={row.userId} style={styles.row}>
              <Text style={styles.place}>{row.place}</Text>
              <View style={styles.text}>
                <Text style={styles.name}>{row.fullName}</Text>
                <Text style={styles.meta}>{m('ratingBoard.stages', { n: row.ordersCount })}</Text>
              </View>
              <Text style={styles.score}>{row.score ?? 0}</Text>
              {row.placeDelta !== null && row.placeDelta !== 0 && (
                <Text style={[styles.delta, row.placeDelta > 0 ? styles.up : styles.down]}>
                  {row.placeDelta > 0 ? `↑${String(row.placeDelta)}` : `↓${String(-row.placeDelta)}`}
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      {unranked.length > 0 && (
        <Card>
          <CardTitle title={m('ratingBoard.unranked')} icon="people" />
          {unranked.map((row) => (
            <View key={row.userId} style={styles.row}>
              <View style={styles.text}>
                <Text style={styles.nameMuted}>{row.fullName}</Text>
                {row.unratedReason !== null && <Text style={styles.meta}>{row.unratedReason}</Text>}
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.xs,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  place: {
    ...typography.value,
    color: colors.textSecondary,
    width: 28,
    textAlign: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  nameMuted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  score: {
    ...typography.value,
    color: colors.textPrimary,
  },
  delta: {
    ...typography.caption,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'right',
  },
  up: {
    color: colors.positive,
  },
  down: {
    color: colors.danger,
  },
});
