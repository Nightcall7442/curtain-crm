import { useNavigation } from '@react-navigation/native';
import { MonitorGroup, type MonitorGroup as MonitorGroupName } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { trpc } from '../../lib/trpc';
import { colors, fonts, spacing, typography } from '../../theme';

import { Card } from '../Card';
import { Icon, type IconName } from '../Icon';
import { PressableScale } from '../PressableScale';

const TILES: readonly { group: MonitorGroupName; icon: IconName; title: 'monitor.sewers' | 'monitor.installers' }[] = [
  { group: MonitorGroup.WORKSHOP, icon: 'people', title: 'monitor.sewers' },
  { group: MonitorGroup.INSTALLATION, icon: 'work', title: 'monitor.installers' },
];

function Tile({
  group,
  icon,
  title,
}: {
  readonly group: MonitorGroupName;
  readonly icon: IconName;
  readonly title: string;
}): ReactElement {
  const { m } = useLocale();
  const navigation = useNavigation();
  const board = trpc.monitor.board.useQuery({ group });
  const summary = board.data?.summary;

  return (
    <PressableScale
      onPress={() => {
        navigation.navigate('MonitorBoard', { group });
      }}
      accessibilityLabel={title}
      style={styles.tileWrap}
    >
      <Card style={styles.tile}>
        <View style={styles.icon}>
          <Icon name={icon} size={17} color={colors.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>
          {summary === undefined ? '—' : `${summary.onShift.toString()} / ${summary.headcount.toString()}`}
        </Text>
        <Text style={styles.hint} numberOfLines={1}>
          {summary === undefined ? ' ' : m('monitor.onShift', { n: summary.onShift, total: summary.headcount })}
        </Text>
      </Card>
    </PressableScale>
  );
}

/** Две плитки «Табло» — швеи и выездные: кто на смене и вход в табло группы. */
export function MonitorTiles(): ReactElement {
  const { m } = useLocale();
  return (
    <View style={styles.row}>
      {TILES.map((tile) => (
        <Tile key={tile.group} group={tile.group} icon={tile.icon} title={m(tile.title)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    gap: 4,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  value: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 24,
    color: colors.textPrimary,
  },
  hint: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
});
