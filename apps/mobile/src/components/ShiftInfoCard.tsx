import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, spacing, typography } from '../theme';

import { Card, CardTitle, Pill, Row } from './Card';

/**
 * Текущая смена сотрудника.
 *
 * Показывает ФАКТ, а не расписание: графиков смен («дневная 08:00–17:00»)
 * в системе нет, и подставлять их было бы вымыслом. Вместо этого — время
 * фактического чек-ина, филиал и сколько идёт смена.
 */
export function ShiftInfoCard({
  branchName,
  startedAt,
  distanceMeters,
  ordersInProgress,
}: {
  readonly branchName: string | null;
  readonly startedAt: Date | null;
  readonly distanceMeters: number | null;
  readonly ordersInProgress: number;
}): ReactElement {
  const isOpen = startedAt !== null;

  const duration = ((): string => {
    if (startedAt === null) return '—';

    const minutes = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60_000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) return `${rest.toString()} мин`;
    return `${hours.toString()} ч ${rest.toString()} мин`;
  })();

  const timeLabel =
    startedAt === null
      ? '—'
      : startedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const dateLabel =
    startedAt === null
      ? '—'
      : startedAt.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: 'long',
          weekday: 'short',
        });

  return (
    <Card style={styles.card}>
      <CardTitle
        title="Текущая смена"
        icon="shift"
        action={
          <Pill
            text={isOpen ? 'Смена открыта' : 'Смена закрыта'}
            tone={isOpen ? 'positive' : 'neutral'}
          />
        }
      />

      {isOpen ? (
        <View>
          <Row label="Дата" value={dateLabel} />
          <Row label="Начало" value={timeLabel} />
          <Row label="Идёт" value={duration} valueColor={colors.positive} />
          <Row label="Филиал" value={branchName ?? '—'} />
          {distanceMeters !== null && (
            <Row label="Отметка в" value={`${distanceMeters.toString()} м от цеха`} />
          )}
        </View>
      ) : (
        <Text style={styles.closed}>
          Смена не открыта. Откройте её на вкладке «Check In/Out», находясь рядом с цехом.
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Заказов у меня в работе</Text>
        <Text style={styles.footerValue}>{ordersInProgress}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  closed: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLabel: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  footerValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
