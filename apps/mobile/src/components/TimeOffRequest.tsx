import { DayOffStatus, formatIsoDateShort } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale, type Translate } from '../hooks/useLocale';
import { colors, spacing, typography } from '../theme';

import { Icon } from './Icon';

/**
 * Общие части запросов «выходные» и «опоздание» — у сотрудника в «Моих
 * запросах» (`DayOffScreen`) и у руководства в «Отгулах»
 * (`DayOffApprovalsScreen`).
 *
 * Прежде период и тон статуса жили копией в каждом экране, и одна и та же
 * заявка выглядела на двух экранах по-разному: у сотрудника «Ждёт решения»
 * янтарная, у директора — серая, даты «18.11 – 19.11» там и
 * «18.11.2026 — 19.11.2026» здесь. С опозданием видов стало два, и копий
 * стало бы четыре.
 */

/** Вид запроса: выходные (`dayOff.*`) или опоздание (`lateRequests.*`). */
export type RequestKind = 'dayOff' | 'late';

/**
 * Подпись вида над датами: «Выходные» с календарём, «Опоздание» с часами.
 *
 * Оба вида стоят в одном списке, и «12.11» без подписи не говорит, о чём
 * запрос — о дне отдыха или о том, что человек придёт к 10:30.
 */
export function RequestKindLabel({ kind }: { readonly kind: RequestKind }): ReactElement {
  const { m } = useLocale();

  return (
    <View style={styles.kind}>
      <Icon name={kind === 'late' ? 'shift' : 'calendar'} size={14} color={colors.textMuted} />
      <Text style={styles.kindText}>{kind === 'late' ? m('request.kindLate') : m('request.kindDayOff')}</Text>
    </View>
  );
}

/** «18.11» или «18.11 – 19.11». */
export function dayOffPeriod(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatIsoDateShort(startDate);
  return `${formatIsoDateShort(startDate)} – ${formatIsoDateShort(endDate)}`;
}

/** «12.11, до 10:30» на языке приложения. */
export function latePeriod(date: string, arriveBy: string, m: Translate): string {
  return m('late.period', { date: formatIsoDateShort(date), time: arriveBy });
}

/**
 * Тон статуса: ждёт — янтарный, одобрен — зелёный, отказ — красный,
 * отозван — серый. Ждущий не должен сливаться с закрытыми.
 */
export function requestStatusTone(status: DayOffStatus): 'neutral' | 'positive' | 'warning' | 'danger' {
  switch (status) {
    case DayOffStatus.APPROVED:
      return 'positive';
    case DayOffStatus.REJECTED:
      return 'danger';
    case DayOffStatus.CANCELLED:
      return 'neutral';
    default:
      return 'warning';
  }
}

const styles = StyleSheet.create({
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  kindText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
