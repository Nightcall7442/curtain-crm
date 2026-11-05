import { PLURAL_POINTS, pluralize } from '@curtain-crm/shared';
import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, fonts, hairline, radius, sizes, spacing, typography } from '../theme';

import { Card, CardLink, CardTitle, Empty, ErrorState, Skeleton } from './Card';
import { Icon } from './Icon';
import type { RouterOutputs } from '../lib/trpc';
import { useLocale } from '../hooks/useLocale';

/**
 * Табло рейтинга сотрудников.
 *
 * Стоит на главном экране, а не прячется за ссылкой: соревнование работает,
 * только когда его видно без нажатий. Раньше здесь была одна строка «1 место
 * из 18» — она сообщала результат, но не показывала, с кем идёт борьба.
 *
 * Пятёрка лучших поимённо, своя строка закреплена внизу, если в пятёрку не
 * попал. Остальные не перечисляются — это решение заказчика: отстающих не
 * вывешивают на всю мастерскую.
 *
 * Данные приходят из `rating.me`, где сервер сам решает, что показать
 * рядовому сотруднику. Чужих метрик в ответе нет вовсе.
 */

type RatingData = RouterOutputs['rating']['me'];

export function RatingBoard({
  data,
  isLoading,
  isError,
  onPressAll,
}: {
  readonly data: RatingData | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onPressAll: () => void;
}): ReactElement {
  const { m } = useLocale();
  const me = data?.me ?? null;

  /**
   * Показывать ли свою строку отдельно.
   *
   * Только когда сотрудник НЕ в пятёрке: иначе она продублировала бы уже
   * видимую подсвеченную строку пьедестала.
   */
  const isInPodium = data?.podium.some((entry) => entry.isMe) ?? false;
  const showOwnRow = me !== null && me.unratedReason === null && !isInPodium;
  /*
    Ни у кого ни балла — соревнование ещё не началось.

    Иначе табло показывало пятерых на первом месте с «0 баллов» и кубком у
    каждого, а ниже — «⋯» и «Вы», тоже первым: разрыв, которого нет.

    «Ни балла» — это ровно ноль или пусто, а не «не больше нуля». В балл
    входят и штрафы дисциплины, и он бывает отрицательным: второго числа у
    лидеров ещё ноль, а у опоздавшего уже «−2».
  */
  const nobodyScored = (data?.podium ?? []).every(
    (entry) => entry.score === null || entry.score === 0,
  );
  /*
    Свой штраф виден и до начала соревнования. Раньше «не началось»
    прятало и свою строку: опоздавший видел на главной «соревнования нет»,
    а в рейтинге — «−2» и последнее место. Пятёрка с нулями по-прежнему не
    рисуется, а своя строка со штрафом стоит под пояснением.
  */
  const ownPenalty =
    showOwnRow && nobodyScored && me.score !== null && me.score !== 0 ? me : null;
  /* Кубок — только единоличному лидеру: у ничьей за первое место его нет. */
  const leaders = (data?.podium ?? []).filter((entry) => entry.place === 1).length;
  const lastPodiumPlace = data?.podium.at(-1)?.place ?? null;
  /* «⋯» означает «ниже пятёрки» — при равном с ней месте разрыва нет. */
  const showGap = me?.place != null && lastPodiumPlace !== null && me.place > lastPodiumPlace;

  return (
    <Card>
      <CardTitle
        title={m('rating.title')}
        icon="rating"
        action={<CardLink label={m('rating.more')} onPress={onPressAll} />}
      />

      {isError ? (
        <ErrorState />
      ) : isLoading || data === undefined ? (
        <Skeleton rows={4} />
      ) : data.podium.length === 0 || nobodyScored ? (
        <>
          <Empty
            message={m('rating.notStarted')}
            hint={m('rating.notStartedHint')}
          />
          {ownPenalty !== null && (
            <BoardRow
              // Штраф виден, а места за него нет — как на табло руководителя.
              place={null}
              name={m('rating.You')}
              score={ownPenalty.score}
              isMe
              isLast
              medal={false}
            />
          )}
        </>
      ) : (
        <View>
          {data.podium.map((entry, index) => (
            <BoardRow
              key={entry.userId}
              // Без баллов места нет: при нуле это лишь порядок списка.
              place={(entry.score ?? 0) > 0 ? entry.place : null}
              name={entry.fullName}
              score={entry.score}
              isMe={entry.isMe}
              isLast={index === data.podium.length - 1 && !showOwnRow}
              medal={entry.place === 1 && leaders === 1 && (entry.score ?? 0) > 0}
            />
          ))}

          {showOwnRow && (
            <>
              {/*
                Разрыв между пятёркой и своей строкой.
                Без него строка читалась бы как шестое место, хотя между ними
                могут быть десятки других.
              */}
              {showGap && <Text style={styles.gap}>⋯</Text>}

              <BoardRow
                place={(me.score ?? 0) > 0 ? me.place : null}
                name={m('rating.You')}
                score={me.score}
                isMe
                isLast
                medal={false}
              />
            </>
          )}
        </View>
      )}

      {me?.unratedReason !== null && me?.unratedReason !== undefined && (
        <Text style={styles.unrated}>{me.unratedReason}</Text>
      )}
    </Card>
  );
}

/**
 * Строка табло.
 *
 * Место набрано моноширинно по ширине: в столбце «1 … 12 … 18» цифры обязаны
 * стоять друг под другом, иначе колонка выглядит рваной.
 */
function BoardRow({
  place,
  name,
  score,
  isMe,
  isLast,
  medal,
}: {
  readonly place: number | null;
  readonly name: string;
  readonly score: number | null;
  readonly isMe: boolean;
  readonly isLast: boolean;
  /** Кубок лидера: только у единственного первого места с баллами. */
  readonly medal: boolean;
}): ReactElement {
  const { locale } = useLocale();
  return (
    <View style={[styles.row, isMe ? styles.rowMine : null]}>
      {/* Тройка выделяется только за набранные баллы: ноль и штраф местом не награждаются. */}
      <Text
        style={[
          styles.place,
          place !== null && place <= 3 && (score ?? 0) > 0 ? styles.placeTop : null,
        ]}
      >
        {place === null ? '—' : place.toString()}
      </Text>

      <View style={[styles.body, isLast ? null : styles.divider]}>
        <Text style={[styles.name, isMe ? styles.nameMine : null]} numberOfLines={1}>
          {name}
        </Text>

        {/* Медаль только у первого: три подряд превращают список в ёлку. */}
        {medal && <Icon name="rating" size={15} color={colors.accentStrong} />}

        {/*
          Штраф — терракотой и с типографским минусом, как баллы дисциплины в
          рейтинге: дефис «-2» рядом с «−2» там читался другим знаком.
        */}
        <Text style={[styles.score, score !== null && score < 0 ? styles.scoreNegative : null]}>
          {score === null ? '—' : `${score < 0 ? '\u2212' : ''}${scoreLabel(Math.abs(score), locale)}`}
        </Text>
      </View>
    </View>
  );
}

/** «2 балла», «2 ball» — без знака: знак ставит строка. */
function scoreLabel(points: number, locale: string): string {
  return locale === 'uz' ? `${points.toString()} ball` : pluralize(points, PLURAL_POINTS);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.touchTarget,
  },
  rowMine: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    // Подсветка выходит за внутренний отступ карточки, чтобы строка читалась
    // как выделенная целиком, а не как подкрашенный кусок текста.
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  place: {
    ...typography.value,
    color: colors.textMuted,
    width: 26,
    fontVariant: ['tabular-nums'],
  },
  placeTop: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  divider: {
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  nameMine: {
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    fontWeight: '600',
  },
  score: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  scoreNegative: {
    color: colors.danger,
  },
  gap: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  unrated: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
