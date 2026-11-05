import {
  formatDisciplinePoints,
  formatMonthPeriod,
  type Locale,
  monthName,
  monthNameGenitive,
  RATING_COMPONENT_LABELS,
  RATING_SCOPE_LABELS,
  RATING_SCOPES,
  RatingScope,
  ROLE_LABELS,
  SEWER_CATEGORY_FEE_PERCENT,
  SEWER_CATEGORY_LABELS,
  type RatingScope as RatingScopeName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Progress } from '../components/Card';
import { DisciplineCard } from '../components/DisciplineCard';
import { useLocale } from '../hooks/useLocale';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { colors, radius, spacing, typography, fonts } from '../theme';

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
  const { t, m, locale } = useLocale();
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
          {/* Месяцы — на языке интерфейса: прежде узбекская подпись выходила
              «Ноябрь 2026 · 20 ishtirokchi». */}
          {scope === RatingScope.WEEK
            ? dayRange(new Date(data.period.start), new Date(data.period.end), locale)
            : `${monthName(new Date(data.period.start).getUTCMonth() + 1, locale)} ${new Date(data.period.start).getUTCFullYear().toString()}`}
          {m('rating.participants', { n: data.participants })}
        </Text>
      )}

      {/* Своя строка ------------------------------------------------------- */}
      <MyPlaceCard data={data} isLoading={rating.isLoading} />

      {/*
        Дисциплина — рядом с рейтингом, а не в профиле: опоздания и
        поощрения входят в тот же балл, и владелец попросил держать их здесь.
      */}
      <DisciplineCard period={{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }} />

      {/* Пьедестал --------------------------------------------------------- */}
      <Card>
        <CardTitle title={m('rating.best')} icon="rating" />

        {data === undefined ? (
          <Empty message={m('rating.loading')} />
        ) : data.podium.every((entry) => (entry.score ?? 0) <= 0) ? (
          /* Пусто и «у всех ноль» — одно и то же: пятеро на первом месте с
             нулём баллов читались как ничья, хотя соревнование не началось. */
          <Empty
            message={m('rating.noOrders')}
            hint={m('rating.noOrdersHint')}
          />
        ) : (
          <View>
            {data.podium.map((entry, index) => (
              <PodiumRow
                key={entry.userId}
                entry={entry}
                isLast={index === data.podium.length - 1}
              />
            ))}
          </View>
        )}
      </Card>

      <Text style={styles.footnote}>{m('rating.footnote')}</Text>
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
  const { t, m, locale } = useLocale();

  if (isLoading || data === undefined) {
    return (
      <Card>
        <Empty message={m('rating.computing')} />
      </Card>
    );
  }

  const me = data.me;

  if (me === null) {
    return (
      <Card>
        <Empty
          message={m('rating.notInList')}
          hint={m('rating.notInListHint')}
        />
      </Card>
    );
  }

  if (me.unratedReason !== null) {
    return (
      <Card>
        <CardTitle title={m('rating.unrated')} icon="escalated" />
        <Text style={styles.unrated}>{me.unratedReason}</Text>
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.myHeader}>
        <View>
          <Text style={styles.myLabel}>{m('rating.yourPlace')}</Text>
          <View style={styles.myPlaceRow}>
            <Text style={styles.myPlace}>{me.place === null ? '—' : me.place.toString()}</Text>
            <Text style={styles.myPlaceTotal}>{m('rating.of', { n: data.participants })}</Text>
          </View>
        </View>

        <View style={styles.myScoreBlock}>
          <Text style={styles.myLabel}>{m('rating.score')}</Text>
          <Text style={styles.myScore}>{me.score === null ? '—' : me.score.toString()}</Text>
        </View>
      </View>

      <Progress percent={me.score ?? 0} />

      <View style={styles.myFooter}>
        <PlaceDelta value={me.placeDelta} />
        <Text style={styles.myOrders}>{m('rating.closedOrders', { n: me.ordersCount })}</Text>
      </View>

      {/*
        Разбивка балла показана и здесь, а не только в панели у руководства:
        сотрудник, который видит одну итоговую цифру, не знает, что именно
        подтягивать — объём, качество или сроки.
      */}
      {/* Швея видит свою категорию тут же: она и есть цена балла в сумах. */}
      {me.sewerCategory !== null && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownRole}>{m('profile.sewerCategory')}</Text>
          <Text style={styles.disciplinePoints}>{SEWER_CATEGORY_LABELS[locale][me.sewerCategory.category]}</Text>
          <Text style={styles.breakdownRole}>
            {m('profile.sewerCategoryHint', {
              period: formatMonthPeriod(me.sewerCategory.period.year, me.sewerCategory.period.month, locale),
              pct: SEWER_CATEGORY_FEE_PERCENT[me.sewerCategory.category],
            })}
          </Text>
        </View>
      )}
      {me.disciplinePoints !== 0 && (
        <View style={styles.breakdown}>
          <Text style={styles.breakdownRole}>{m('discipline.title')}</Text>
          <Text style={[styles.disciplinePoints, me.disciplinePoints < 0 ? styles.disciplineNegative : null]}>
            {formatDisciplinePoints(me.disciplinePoints)}
          </Text>
        </View>
      )}
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
  isLast,
}: {
  readonly entry: RatingData['podium'][number];
  /** Последняя строка — без линии: её край и так задаёт карточка. */
  readonly isLast: boolean;
}): ReactElement {
  const { m } = useLocale();
  return (
    <View
      style={[
        styles.podiumRow,
        isLast ? null : styles.podiumDivider,
        entry.isMe ? styles.podiumRowMine : null,
      ]}
    >
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
      {entry.isMe && <Text style={styles.podiumMine}>{m('rating.you')}</Text>}

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
  const { m } = useLocale();
  if (value === null) {
    return <Text style={styles.deltaNeutral}>{m('rating.noCompare')}</Text>;
  }

  if (value === 0) {
    return <Text style={styles.deltaNeutral}>{m('rating.noChange')}</Text>;
  }

  const isUp = value > 0;

  return (
    <Text style={[styles.delta, { color: isUp ? colors.positive : colors.danger }]}>
      {m('rating.delta', { arrow: isUp ? '↑' : '↓', n: Math.abs(value) })}
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

/**
 * Подпись недели: «2 — 8 ноября», «2 — 8 noyabr».
 *
 * Своя, а не `formatDayRange` из общего пакета: та знает только русские
 * названия месяцев. Конец периода — полуинтервал (первый день следующей
 * недели), поэтому берётся предыдущий день, иначе неделя вышла бы
 * восьмидневной.
 */
function dayRange(start: Date, end: Date, locale: Locale): string {
  const last = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const lastPart = `${last.getUTCDate().toString()} ${monthNameGenitive(last.getUTCMonth() + 1, locale)}`;
  const startPart =
    start.getUTCMonth() === last.getUTCMonth()
      ? start.getUTCDate().toString()
      : `${start.getUTCDate().toString()} ${monthNameGenitive(start.getUTCMonth() + 1, locale)}`;
  return `${startPart} — ${lastPart}`;
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  disciplinePoints: {
    ...typography.value,
    color: colors.positive,
  },
  disciplineNegative: {
    color: colors.danger,
  },
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
    borderRadius: radius.pill,
    alignItems: 'center',
    // Подпись по центру кнопки: с одними вертикальными полями она стояла
    // на 5 точек выше середины (8 сверху, 18 снизу).
    justifyContent: 'center',
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
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    color: colors.accent,
    fontWeight: '600',
  },
  periodCaption: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
    fontSize: 26,
    fontWeight: '700',
    color: colors.accent,
  },
  myFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Не помещаются в строку (узбекские подписи длиннее) — вторая встаёт
    // под первую целиком, а не рвётся посередине с одинокой цифрой.
    flexWrap: 'wrap',
    columnGap: spacing.md,
    rowGap: spacing.xs,
    marginTop: spacing.md,
  },
  myOrders: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  delta: {
    ...typography.caption,
    fontFamily: fonts.semibold,
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
    ...typography.footnote,
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
  },
  podiumDivider: {
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
    fontFamily: fonts.semibold,
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
    ...typography.footnote,
    color: colors.textMuted,
  },
});
