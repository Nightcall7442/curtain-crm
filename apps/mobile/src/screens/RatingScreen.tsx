import {
  formatDayRange,
  monthName,
  RATING_COMPONENT_LABELS,
  RATING_SCOPE_LABELS,
  RATING_SCOPES,
  RatingScope,
  ROLE_LABELS,
  type RatingScope as RatingScopeName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Progress } from '../components/Card';
import { useLocale } from '../hooks/useLocale';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Рейтинг сотрудников — соревнование.
 *
 * Экран отвечает на один вопрос: «где я и до кого тянуться». Поэтому здесь
 * пятёрка лучших и СВОЯ строка, а не полная таблица: список из двадцати
 * фамилий с последним местом внизу — это не мотивация, а публичный выговор.
 *
 * Всё, что показано, приходит из `rating.me`. Сервер сам решает, что отдать
 * рядовому сотруднику: чужих метрик и выручки в ответе нет вовсе, поэтому
 * их невозможно достать, подобрав параметры запроса.
 */
export function RatingScreen(): ReactElement {
  const { t } = useLocale();
  const [scope, setScope] = useState<RatingScopeName>(RatingScope.MONTH);

  const rating = trpc.rating.me.useQuery({ scope });
  const utils = trpc.useUtils();

  const data = rating.data;
  const isRefreshing = rating.isFetching && !rating.isLoading;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void utils.rating.me.invalidate();
          }}
          tintColor={colors.accent}
        />
      }
    >
      {/* Период ------------------------------------------------------------ */}
      <View style={styles.scopeRow}>
        {RATING_SCOPES.map((value) => {
          const active = scope === value;

          return (
            <Pressable
              key={value}
              onPress={() => {
                setScope(value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.scopeButton, active ? styles.scopeButtonActive : null]}
            >
              <Text style={[styles.scopeText, active ? styles.scopeTextActive : null]}>
                {t(RATING_SCOPE_LABELS, value)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {data !== undefined && (
        <Text style={styles.periodCaption}>
          {scope === RatingScope.WEEK
            ? formatDayRange(new Date(data.period.start), new Date(data.period.end))
            : `${monthName(new Date(data.period.start).getUTCMonth() + 1)} ${new Date(data.period.start).getUTCFullYear().toString()}`}
          {` · ${data.participants.toString()} участников`}
        </Text>
      )}

      {/* Своя строка ------------------------------------------------------- */}
      <MyPlaceCard data={data} isLoading={rating.isLoading} />

      {/* Пьедестал --------------------------------------------------------- */}
      <Card>
        <CardTitle title="Лучшие за период" icon="rating" />

        {data === undefined ? (
          <Empty message="Загружаем таблицу" />
        ) : data.podium.length === 0 ? (
          <Empty
            message="За период ещё нет закрытых заказов"
            hint="Строки появятся, когда первый заказ дойдёт до статуса «Выполнен»"
          />
        ) : (
          <View>
            {data.podium.map((entry) => (
              <PodiumRow key={entry.userId} entry={entry} />
            ))}
          </View>
        )}
      </Card>

      <Text style={styles.footnote}>
        Балл собирается из объёма работы, качества (заказы без возврата на переделку) и
        попадания в срок. В зачёт идут только заказы, закрытые внутри периода.
      </Text>
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */

type RatingData = RouterOutputs['rating']['me'];

/**
 * Собственное место — самая важная карточка экрана, поэтому она выше
 * пьедестала: своё положение сотрудник ищет первым, а не список лидеров.
 */
function MyPlaceCard({
  data,
  isLoading,
}: {
  readonly data: RatingData | undefined;
  readonly isLoading: boolean;
}): ReactElement {
  const { t } = useLocale();

  if (isLoading || data === undefined) {
    return (
      <Card>
        <Empty message="Считаем ваше место" />
      </Card>
    );
  }

  const me = data.me;

  if (me === null) {
    return (
      <Card>
        <Empty
          message="Вас нет в рейтинге за этот период"
          hint="Так бывает у учётной записи, которую отключили"
        />
      </Card>
    );
  }

  if (me.unratedReason !== null) {
    return (
      <Card>
        <CardTitle title="Вы вне конкурса" icon="escalated" />
        <Text style={styles.unrated}>{me.unratedReason}</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.myCard}>
      <View style={styles.myHeader}>
        <View>
          <Text style={styles.myLabel}>Ваше место</Text>
          <View style={styles.myPlaceRow}>
            <Text style={styles.myPlace}>{me.place === null ? '—' : me.place.toString()}</Text>
            <Text style={styles.myPlaceTotal}>{` из ${data.participants.toString()}`}</Text>
          </View>
        </View>

        <View style={styles.myScoreBlock}>
          <Text style={styles.myLabel}>Балл</Text>
          <Text style={styles.myScore}>{me.score === null ? '—' : me.score.toString()}</Text>
        </View>
      </View>

      <Progress percent={me.score ?? 0} />

      <View style={styles.myFooter}>
        <PlaceDelta value={me.placeDelta} />
        <Text style={styles.myOrders}>{`Закрыто заказов: ${me.ordersCount.toString()}`}</Text>
      </View>

      {/*
        Разбивка балла показана и здесь, а не только в панели у руководства:
        сотрудник, который видит одну итоговую цифру, не знает, что именно
        подтягивать — объём, качество или сроки.
      */}
      {me.byRole.map((entry) => (
        <View key={entry.role} style={styles.breakdown}>
          <Text style={styles.breakdownRole}>{t(ROLE_LABELS, entry.role)}</Text>
          <View style={styles.breakdownRow}>
            <Component label={t(RATING_COMPONENT_LABELS, 'volume')} value={entry.volumeScore} />
            <Component label={t(RATING_COMPONENT_LABELS, 'quality')} value={entry.qualityPercent} />
            <Component
              label={t(RATING_COMPONENT_LABELS, 'punctuality')}
              value={entry.punctualityPercent}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Одна строка пьедестала. */
function PodiumRow({
  entry,
}: {
  readonly entry: RatingData['podium'][number];
}): ReactElement {
  return (
    <View style={[styles.podiumRow, entry.isMe ? styles.podiumRowMine : null]}>
      <Text style={styles.podiumPlace}>{entry.place === null ? '—' : entry.place.toString()}</Text>

      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.fullName}
      </Text>

      {/*
        Пометка «вы» — отдельным текстом, а не хвостом имени.
        Внутри одного `Text` с `numberOfLines={1}` многоточие съедает именно
        конец строки, то есть ровно эту пометку: сотрудник с длинной фамилией
        переставал видеть, где в списке он сам.
      */}
      {entry.isMe && <Text style={styles.podiumMine}>вы</Text>}

      <Text style={styles.podiumScore}>{entry.score === null ? '—' : entry.score.toString()}</Text>
    </View>
  );
}

/**
 * Изменение места к предыдущему периоду.
 *
 * Стрелка нарисована текстовым глифом, как и иконки вкладок: тянуть
 * иконочный шрифт ради двух символов незачем. Знак напечатан рядом, поэтому
 * направление читается и без цвета.
 */
function PlaceDelta({ value }: { readonly value: number | null }): ReactElement {
  if (value === null) {
    return <Text style={styles.deltaNeutral}>Сравнить не с чем</Text>;
  }

  if (value === 0) {
    return <Text style={styles.deltaNeutral}>Место не изменилось</Text>;
  }

  const isUp = value > 0;

  return (
    <Text style={[styles.delta, { color: isUp ? colors.positive : colors.danger }]}>
      {`${isUp ? '↑' : '↓'} ${Math.abs(value).toString()} к прошлому периоду`}
    </Text>
  );
}

/** Компонент балла: подпись и процент. */
function Component({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number | null;
}): ReactElement {
  return (
    <View style={styles.component}>
      <Text style={styles.componentLabel}>{label}</Text>
      <Text style={styles.componentValue}>
        {value === null ? '—' : `${Math.round(value).toString()}%`}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  scopeRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 3,
  },
  scopeButton: {
    minHeight: 44,
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  scopeButtonActive: {
    backgroundColor: colors.surface,
  },
  scopeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  scopeTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  periodCaption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  myCard: {
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  myHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  myLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  myPlaceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  myPlace: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  myPlaceTotal: {
    ...typography.caption,
    color: colors.textMuted,
  },
  myScoreBlock: {
    alignItems: 'flex-end',
  },
  myScore: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.accent,
  },
  myFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  myOrders: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  delta: {
    ...typography.caption,
    fontWeight: '600',
  },
  deltaNeutral: {
    ...typography.caption,
    color: colors.textMuted,
  },
  breakdown: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breakdownRole: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  component: {
    flex: 1,
  },
  componentLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  componentValue: {
    ...typography.value,
    marginTop: 2,
  },
  unrated: {
    ...typography.body,
    color: colors.textSecondary,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  podiumRowMine: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  podiumPlace: {
    ...typography.value,
    color: colors.textMuted,
    width: 26,
  },
  podiumMine: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
    marginHorizontal: spacing.sm,
  },
  podiumName: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  podiumScore: {
    ...typography.value,
    color: colors.accentStrong,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
  },
});
