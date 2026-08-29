import { PLURAL_POINTS, pluralize } from '@curtain-crm/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from './Card';
import { Icon } from './Icon';
import type { RouterOutputs } from '../lib/trpc';

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
  const me = data?.me ?? null;

  /**
   * Показывать ли свою строку отдельно.
   *
   * Только когда сотрудник НЕ в пятёрке: иначе она продублировала бы уже
   * видимую подсвеченную строку пьедестала.
   */
  const isInPodium = data?.podium.some((entry) => entry.isMe) ?? false;
  const showOwnRow = me !== null && me.unratedReason === null && !isInPodium;

  return (
    <Card>
      <CardTitle
        title="Рейтинг сотрудников"
        icon="rating"
        action={
          <Pressable onPress={onPressAll} accessibilityRole="button" hitSlop={8}>
            {({ pressed }) => (
              <Text style={[styles.link, pressed ? styles.linkPressed : null]}>Подробнее</Text>
            )}
          </Pressable>
        }
      />

      {isError ? (
        <ErrorState />
      ) : isLoading || data === undefined ? (
        <Skeleton rows={4} />
      ) : data.podium.length === 0 ? (
        <Empty
          message="Соревнование ещё не началось"
          hint="Строки появятся, когда первый заказ месяца дойдёт до статуса «Выполнен»"
        />
      ) : (
        <View>
          {data.podium.map((entry, index) => (
            <BoardRow
              key={entry.userId}
              place={entry.place}
              name={entry.fullName}
              score={entry.score}
              isMe={entry.isMe}
              isLast={index === data.podium.length - 1 && !showOwnRow}
            />
          ))}

          {showOwnRow && (
            <>
              {/*
                Разрыв между пятёркой и своей строкой.
                Без него строка читалась бы как шестое место, хотя между ними
                могут быть десятки других.
              */}
              <Text style={styles.gap}>⋯</Text>

              <BoardRow
                place={me.place}
                name="Вы"
                score={me.score}
                isMe
                isLast
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
}: {
  readonly place: number | null;
  readonly name: string;
  readonly score: number | null;
  readonly isMe: boolean;
  readonly isLast: boolean;
}): ReactElement {
  return (
    <View style={[styles.row, isMe ? styles.rowMine : null]}>
      <Text style={[styles.place, place !== null && place <= 3 ? styles.placeTop : null]}>
        {place === null ? '—' : place.toString()}
      </Text>

      <View style={[styles.body, isLast ? null : styles.divider]}>
        <Text style={[styles.name, isMe ? styles.nameMine : null]} numberOfLines={1}>
          {name}
        </Text>

        {/* Медаль только у первого: три подряд превращают список в ёлку. */}
        {place === 1 && <Icon name="rating" size={15} color={colors.accentStrong} />}

        <Text style={styles.score}>
          {score === null ? '—' : pluralize(score, PLURAL_POINTS)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  linkPressed: {
    opacity: opacity.pressed,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
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
    fontWeight: '600',
  },
  score: {
    ...typography.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
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
