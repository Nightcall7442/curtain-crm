import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { colors, spacing, typography } from '../theme';

import { Card, CardTitle, Pill, Row } from './Card';
import { useLocale } from '../hooks/useLocale';

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
  const { m } = useLocale();
  const isOpen = startedAt !== null;

  const duration = ((): string => {
    if (startedAt === null) return '—';

    const minutes = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60_000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) return m('shift.minutes', { n: rest });
    return m('shift.hoursMinutes', { h: hours, m: rest });
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
        title={m('shift.current')}
        icon="shift"
        action={
          <Pill
            text={isOpen ? m('shift.isOpen') : m('shift.isClosed')}
            tone={isOpen ? 'positive' : 'neutral'}
          />
        }
      />

      {isOpen ? (
        <View>
          <Row label={m('shift.date')} value={dateLabel} />
          <Row label={m('shift.start')} value={timeLabel} />
          <Row label={m('shift.running')} value={duration} valueColor={colors.positive} />
          <Row label={m('shift.branch')} value={branchName ?? '—'} />
          {distanceMeters !== null && (
            <Row label={m('shift.markedAt')} value={m('shift.metersFrom', { m: distanceMeters })} />
          )}
        </View>
      ) : (
        <Text style={styles.closed}>{m('shift.closedInfo')}</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>{m('shift.ordersInWork')}</Text>
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
