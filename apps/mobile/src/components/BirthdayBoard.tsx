import { formatIsoDateShort } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cardShadow, colors, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Skeleton } from './Card';

/**
 * Ближайшие дни рождения коллег.
 *
 * Единственное место в приложении, где сотрудник видит не работу, а людей.
 * Поэтому карточки крупные и с фотографией: список фамилий никого не
 * заставит подойти и поздравить, а лицо — заставит.
 *
 * Возраст не показывается. Дата и «через сколько» — всё, что нужно, чтобы
 * поздравить; объявлять всему цеху, сколько человеку лет, для этого не
 * требуется. Руководству возраст по-прежнему виден в панели.
 */

/** Сколько дней вперёд считается «ближайшим». */
const HORIZON_DAYS = 30;

export interface BirthdayPerson {
  readonly userId: number;
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly birthDate: string;
  readonly daysUntil: number;
  readonly avatarUrl: string | null;
}

/** «сегодня» / «завтра» / «через 5 дней» — человеческий счёт, а не число. */
function whenLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'сегодня';
  if (daysUntil === 1) return 'завтра';

  // 2–4 → «дня», остальное → «дней». Для 12–14 всегда «дней».
  const tail = daysUntil % 10;
  const teen = daysUntil % 100 >= 12 && daysUntil % 100 <= 14;
  const word = !teen && tail >= 2 && tail <= 4 ? 'дня' : 'дней';
  return `через ${daysUntil.toString()} ${word}`;
}

function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function BirthdayBoard({
  people,
  isLoading,
}: {
  readonly people: readonly BirthdayPerson[];
  readonly isLoading: boolean;
}): ReactElement | null {
  /*
    Пустую карточку не показываем вовсе.

    «Ближайших дней рождения нет» — сообщение ни о чём: оно занимает экран
    и ничего не меняет в работе. Ближайший месяц без именинников в
    коллективе из восемнадцати человек — обычное дело.
  */
  if (!isLoading && people.length === 0) return null;

  return (
    <Card>
      <CardTitle title="Дни рождения" icon="calendar" />

      {isLoading ? (
        <Skeleton />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {people.map((person) => {
            const isToday = person.daysUntil === 0;

            return (
              <View
                key={person.userId}
                style={[styles.person, isToday ? styles.personToday : null]}
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

                <Text style={[styles.when, isToday ? styles.whenToday : null]}>
                  {isToday ? '🎉 сегодня' : whenLabel(person.daysUntil)}
                </Text>
                <Text style={styles.date}>{formatIsoDateShort(person.birthDate)}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {!isLoading && people.length > 0 && (
        <Text style={styles.footnote}>{`Ближайшие ${HORIZON_DAYS.toString()} дней`}</Text>
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
    fontSize: 10,
    color: colors.textMuted,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
