import {
  ORDER_PHASE_LABELS,
  ORDER_PHASES,
  ORDER_STATUS_PHASE,
  OrderPhase,
  OrderStatus,
  type OrderPhase as OrderPhaseName,
  type OrderStatus as OrderStatusName,
} from '@curtain-crm/shared';
import { StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';

import { useLocale } from '../hooks/useLocale';
import { colors, radius, spacing, typography } from '../theme';

import { Icon } from './Icon';

/**
 * Степпер этапов заказа — «где мы на конвейере», по макету «Хвоя UI».
 *
 * Этапы берутся из `ORDER_PHASES`, текущий — по `ORDER_STATUS_PHASE`;
 * никакой собственной карты этапов у клиента нет. Фаза «Приём» опущена:
 * заказ на приёме показывает все четыре точки будущими, и это честнее,
 * чем рисовать пятую точку, которая заполнена у любого видимого заказа.
 *
 * Для отменённого заказа степпер не рисуется вовсе — у отмены нет места
 * на конвейере, и любая точка была бы враньём.
 */
export function Stepper({ status }: { readonly status: OrderStatusName }): ReactElement | null {
  const { t } = useLocale();

  if (status === OrderStatus.CANCELLED) return null;

  const currentPhase = ORDER_STATUS_PHASE[status];
  const currentIndex = ORDER_PHASES.indexOf(currentPhase);

  return (
    <View style={styles.row} accessibilityLabel={`Этап: ${t(ORDER_PHASE_LABELS, currentPhase)}`}>
      {STEPS.map((phase, index) => {
        const phaseIndex = ORDER_PHASES.indexOf(phase);
        const isDone = currentIndex > phaseIndex;
        const isNow = currentPhase === phase;
        const isLast = index === STEPS.length - 1;

        return (
          <View key={phase} style={styles.step}>
            <View style={styles.dotRow}>
              {/* Линия к следующему шагу лежит ПОД точками. */}
              {!isLast && (
                <View style={[styles.line, isDone ? styles.lineDone : null]} />
              )}
              <View
                style={[
                  styles.dot,
                  isDone ? styles.dotDone : null,
                  isNow ? styles.dotNow : null,
                ]}
              >
                {isDone ? (
                  <Icon name="completed" size={14} color={colors.onAccent} />
                ) : (
                  <Text style={[styles.dotText, isNow ? styles.dotTextNow : null]}>
                    {(index + 1).toString()}
                  </Text>
                )}
              </View>
            </View>
            <Text
              style={[styles.label, isNow ? styles.labelNow : null]}
              numberOfLines={1}
            >
              {t(ORDER_PHASE_LABELS, phase)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Показываемые шаги: рабочие фазы конвейера, без приёма и закрытия. */
const STEPS: readonly OrderPhaseName[] = ORDER_PHASES.filter(
  (phase) => phase !== OrderPhase.INTAKE && phase !== OrderPhase.CLOSED,
);

const DOT = 28;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  dotRow: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  line: {
    position: 'absolute',
    top: DOT / 2 - 1,
    left: '50%',
    right: '-50%',
    marginLeft: DOT / 2 + 2,
    marginRight: DOT / 2 + 2,
    height: 2,
    backgroundColor: colors.border,
  },
  lineDone: {
    backgroundColor: colors.accentBright,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: colors.accentBright,
  },
  dotNow: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  dotText: {
    ...typography.footnote,
    fontWeight: '800',
    color: colors.textMuted,
  },
  dotTextNow: {
    color: colors.accent,
  },
  label: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.textMuted,
    maxWidth: '100%',
  },
  labelNow: {
    color: colors.accent,
    fontWeight: '700',
  },
});
