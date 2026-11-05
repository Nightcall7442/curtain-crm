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
import { colors, fonts, hairline, spacing, tabBarSpace, typography } from '../theme';

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
  /*
    Место — только за набранные баллы.

    В начале периода у всех ноль, сервер ставит всех на общее первое место,
    и экран показывал двадцать «первых» с зелёными стрелками «↑18», «↑17» —
    будто все победили. Пока ни у кого нет балла больше нуля, соревнования
    ещё нет: показываем готовое «За период никто не набрал баллов». А когда
    лидеры есть, место и стрелку получают только они — ноль местом не
    награждается.
  */
  const hasLeaders = ranked.some((row) => (row.score ?? 0) > 0);

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
        ) : !hasLeaders ? (
          <Empty message={m('ratingBoard.empty')} />
        ) : (
          ranked.map((row, index) => {
            const scored = (row.score ?? 0) > 0;
            const delta = scored ? row.placeDelta : null;
            return (
              <View
                key={row.userId}
                style={[styles.row, index < ranked.length - 1 ? styles.divider : null]}
              >
                <Text style={styles.place}>{scored ? row.place : '—'}</Text>
                <View style={styles.text}>
                  <Text style={styles.name}>{row.fullName}</Text>
                  <Text style={styles.meta}>{m('ratingBoard.stages', { n: row.ordersCount })}</Text>
                </View>
                <Text style={styles.score}>{row.score ?? 0}</Text>
                {/*
                  Колонка стрелки есть в каждой строке, даже пустая: иначе в
                  строках без стрелки балл уезжал к правому краю на 36 px, и
                  колонка баллов шла зигзагом.
                */}
                <Text
                  style={[
                    styles.delta,
                    delta !== null && delta > 0 ? styles.up : styles.down,
                  ]}
                >
                  {delta === null || delta === 0
                    ? ''
                    : delta > 0
                      ? `↑${String(delta)}`
                      : `↓${String(-delta)}`}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      {unranked.length > 0 && (
        <Card>
          <CardTitle title={m('ratingBoard.unranked')} icon="people" />
          {unranked.map((row, index) => (
            <View
              key={row.userId}
              style={[styles.row, index < unranked.length - 1 ? styles.divider : null]}
            >
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

/** Ширина колонки балла: четыре табличные цифры полужирным 15. */
const SCORE_WIDTH = 40;
/** Ширина колонки стрелки: «↑18» — стрелка и две цифры. */
const DELTA_WIDTH = 36;

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
  },
  /* Под последней строкой черты нет: её дублирует край карточки. */
  divider: {
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
  /*
    Балл и стрелка — колонки постоянной ширины, по правому краю и с
    табличными цифрами: «0», «12» и «128» встают под одну вертикаль.
  */
  score: {
    ...typography.value,
    color: colors.textPrimary,
    minWidth: SCORE_WIDTH,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  delta: {
    ...typography.caption,
    // Вес — семейством: `fontWeight` поверх Medium в браузере дорисовывается грубым жирным.
    fontFamily: fonts.bold,
    width: DELTA_WIDTH,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  up: {
    color: colors.positive,
  },
  down: {
    color: colors.danger,
  },
});
