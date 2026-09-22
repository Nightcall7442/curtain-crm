import { formatIsoDateShort } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardShadow, colors, radius, spacing, typography, fonts } from '../theme';

import { Card, CardTitle, Skeleton } from './Card';
import { useLocale, type Translate } from '../hooks/useLocale';

/**
 * Ближайшие события: дни рождения и одобренные выходные.
 *
 * Единственное место в приложении, где сотрудник видит не работу, а людей.
 * Поэтому карточки крупные и с фотографией: список фамилий никого не
 * заставит подойти и поздравить, а лицо — заставит.
 *
 * Раньше карточка звалась «Дни рождения» и их же одних и показывала.
 * Владелец: «тут не только дни рождения» — рядом встали выходные: кого не
 * будет на месте, видно там же, где именинники.
 *
 * Возраст не показывается. Дата и «через сколько» — всё, что нужно, чтобы
 * поздравить; объявлять всему цеху, сколько человеку лет, для этого не
 * требуется. Руководству возраст по-прежнему виден в панели.
 */

/** Сколько дней вперёд считается «ближайшим». */
const HORIZON_DAYS = 30;

export interface StaffEvent {
  readonly id: string;
  readonly kind: 'birthday' | 'day_off';
  readonly userId: number;
  readonly fullName: string;
  readonly jobTitle: string | null;
  /** Дата события: день рождения или первый день выходных. */
  readonly date: string;
  /** Последний день выходных; у дня рождения — `null`. */
  readonly endDate: string | null;
  readonly daysUntil: number;
  readonly avatarUrl: string | null;
}

/** «сегодня» / «завтра» / «через 5 дней» — человеческий счёт, а не число. */
function whenLabel(daysUntil: number, m: Translate): string {
  if (daysUntil === 0) return m('birthday.today');
  if (daysUntil === 1) return m('birthday.tomorrow');

  // 2–4 → «дня», остальное → «дней». Для 12–14 всегда «дней».
  const tail = daysUntil % 10;
  const teen = daysUntil % 100 >= 12 && daysUntil % 100 <= 14;
  const word = !teen && tail >= 2 && tail <= 4 ? m('birthday.day2') : m('birthday.day5');
  return m('birthday.inDays', { n: daysUntil, word });
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function EventsBoard({
  events,
  isLoading,
}: {
  readonly events: readonly StaffEvent[];
  readonly isLoading: boolean;
}): ReactElement | null {
  const { m } = useLocale();
  /*
    Пустую карточку не показываем вовсе.

    «Ближайших событий нет» — сообщение ни о чём: оно занимает экран и
    ничего не меняет в работе. Месяц без именинников и отгулов в коллективе
    из восемнадцати человек — обычное дело.
  */
  if (!isLoading && events.length === 0) return null;

  return (
    <Card>
      <CardTitle title={m('events.title')} icon="calendar" />

      {isLoading ? (
        <Skeleton />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {events.map((person) => {
            const isToday = person.daysUntil === 0;
            const isDayOff = person.kind === 'day_off';

            return (
              <View
                key={person.id}
                style={[styles.person, isToday && !isDayOff ? styles.personToday : null]}
              >
                {person.avatarUrl === null ? (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <Text style={styles.initials}>{initials(person.fullName)}</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: person.avatarUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                )}

                <Text style={styles.name} numberOfLines={2}>
                  {person.fullName}
                </Text>

                {person.jobTitle !== null && (
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {person.jobTitle}
                  </Text>
                )}

                <Text style={[styles.when, isToday && !isDayOff ? styles.whenToday : null]}>
                  {isDayOff
                    ? m('events.dayOff')
                    : isToday
                      ? m('birthday.todayMark')
                      : whenLabel(person.daysUntil, m)}
                </Text>
                <Text style={styles.date}>
                  {/* Выходной на несколько дней — диапазоном: «24.09 – 26.09». */}
                  {person.endDate === null || person.endDate === person.date
                    ? formatIsoDateShort(person.date)
                    : `${formatIsoDateShort(person.date)} – ${formatIsoDateShort(person.endDate)}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {!isLoading && events.length > 0 && (
        <Text style={styles.footnote}>{m('birthday.horizon', { n: HORIZON_DAYS })}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  person: {
    width: 108,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  // Именинника дня выделяем фоном, а не только подписью: карточка должна
  // цеплять взгляд с первого экрана, иначе поздравят те же, кто и так помнит.
  personToday: {
    backgroundColor: colors.accentSoft,
    ...cardShadow,
  },
  photo: {
    width: 64,
    // Формат корпоративной съёмки — тот же, что в профиле (309×433).
    aspectRatio: 309 / 433,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  name: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  jobTitle: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  when: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  whenToday: {
    color: colors.accentStrong,
    fontWeight: '700',
  },
  date: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
