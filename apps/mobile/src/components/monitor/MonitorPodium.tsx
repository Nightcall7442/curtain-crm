import { monthName, MONITOR_PODIUM_SIZE, shortName } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { colors, fonts, radius, spacing, typography } from '../../theme';

import { Card } from '../Card';
import { Icon } from '../Icon';
import type { MonitorBoardData } from './monitorStyle';
import { PersonPhoto } from './PersonPhoto';

/**
 * Металл первых трёх мест. Цвета не из палитры приложения намеренно:
 * золото, серебро и бронза узнаются по цвету, а не по теме оформления.
 */
const METAL: Readonly<Record<number, { readonly frame: string; readonly medal: string; readonly ink: string }>> = {
  1: { frame: '#D9A93F', medal: '#E9C46A', ink: '#2B1D05' },
  2: { frame: '#AAB6BC', medal: '#D6DEE2', ink: '#1D2427' },
  3: { frame: '#C27A45', medal: '#E3A57A', ink: '#2B1405' },
};
const PLAIN = { frame: colors.border, medal: colors.surfaceMuted, ink: colors.textSecondary };

const ARCH_WIDTH = 92;

/** Лучшие прошлого месяца лентой портретов в арках — по объёму, с % плана. */
export function MonitorPodium({ board }: { readonly board: MonitorBoardData }): ReactElement | null {
  const { m, locale } = useLocale();
  if (board.podium.entries.length === 0) return null;

  const month = monthName(Number.parseInt(board.podium.month.slice(5, 7), 10), locale).toLowerCase();
  const unit = board.unit === 'pieces' ? m('monitor.pieces') : m('monitor.orders');

  return (
    <Card>
      <View style={styles.titleRow}>
        <View style={styles.trophy}>
          <Icon name="badge" size={16} color="#3A2A08" />
        </View>
        <Text style={styles.title}>{m('monitor.bestOf', { month })}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {board.podium.entries.slice(0, MONITOR_PODIUM_SIZE).map((entry, index) => {
          const place = index + 1;
          const metal = METAL[place] ?? PLAIN;
          return (
            <View key={entry.userId} style={styles.slot}>
              <View>
                <PersonPhoto
                  uri={entry.photoUrl}
                  name={entry.fullName}
                  style={[styles.arch, { borderColor: metal.frame }]}
                />
                <View style={[styles.medal, { backgroundColor: metal.medal }]}>
                  <Text style={[styles.medalText, { color: metal.ink }]}>{place.toString()}</Text>
                </View>
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {shortName(entry.fullName)}
              </Text>
              <Text style={styles.value}>
                {entry.value.toString()}
                <Text style={styles.unit}>{` ${unit}`}</Text>
              </Text>
              <Text style={styles.percent}>
                {entry.planPercent === null ? ' ' : m('monitor.planPercent', { p: entry.planPercent })}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  trophy: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9C46A',
  },
  title: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  strip: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  slot: {
    width: ARCH_WIDTH,
    alignItems: 'center',
    gap: 2,
  },
  arch: {
    width: ARCH_WIDTH,
    height: ARCH_WIDTH * 1.1,
    borderTopLeftRadius: ARCH_WIDTH / 2,
    borderTopRightRadius: ARCH_WIDTH / 2,
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    borderWidth: 2,
  },
  medal: {
    position: 'absolute',
    bottom: -11,
    alignSelf: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 12,
  },
  name: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 14,
  },
  value: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 22,
    color: colors.textPrimary,
  },
  unit: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  percent: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
});
