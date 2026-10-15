import { PLAN_PACE_LABELS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, radius, typography } from '../../theme';

import { PACE_COLOR, type MonitorPersonData } from './monitorStyle';

/**
 * Полоса плана месяца в строке человека: «9 / 12 шт · 75%», заливка цветом
 * темпа и риска на доле прошедших рабочих дней. Без плана — та же высота.
 */
export function PlanLine({
  plan,
  done,
  unit,
}: {
  readonly plan: MonitorPersonData['plan'];
  readonly done: number;
  readonly unit: string;
}): ReactElement {
  const { m, locale } = useLocale();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>{m('monitor.planTitle')}</Text>
        <Text style={styles.label}>
          {plan === null ? (
            m('monitor.noPlan')
          ) : (
            <>
              <Text style={styles.strong}>{`${done.toString()} / ${plan.target.toString()}`}</Text>
              {` ${unit} · ${plan.percent.toString()}%`}
            </>
          )}
        </Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        {...(plan === null
          ? {}
          : {
              accessibilityLabel: `${m('monitor.planTitle')}: ${plan.percent.toString()}%, ${PLAN_PACE_LABELS[locale][plan.pace]}`,
              accessibilityValue: { min: 0, max: 100, now: Math.min(100, plan.percent) },
            })}
      >
        {plan !== null && (
          <>
            <View
              style={[styles.fill, { width: `${Math.min(100, plan.percent)}%`, backgroundColor: PACE_COLOR[plan.pace] }]}
            />
            <View style={[styles.marker, { left: `${Math.min(100, plan.expectedPercent)}%` }]} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  strong: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  fill: {
    height: 6,
    borderRadius: radius.pill,
  },
  marker: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textSecondary,
  },
});
