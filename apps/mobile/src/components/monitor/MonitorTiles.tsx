import { useNavigation } from '@react-navigation/native';
import {
  LIVE_STATUS_LABELS,
  LiveStatus,
  MONITOR_GROUP_LABELS,
  MonitorGroup,
  type LiveStatus as LiveStatusName,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { trpc } from '../../lib/trpc';
import { colors, radius, spacing, typography } from '../../theme';

import { Card, ErrorState } from '../Card';
import { Icon, type IconName } from '../Icon';
import { PressableScale } from '../PressableScale';

/**
 * Плитки группы и то, что под числом «на смене».
 *
 * Под числом — не повтор его же словами («на смене 0 из 6» под «0 / 6»), а
 * то, чего в нём нет: сколько швей шьют прямо сейчас и сколько выездных на
 * объекте. Это и есть первый вопрос руководителя к табло.
 */
const TILES: readonly { group: MonitorGroupName; icon: IconName; detail: LiveStatusName }[] = [
  { group: MonitorGroup.WORKSHOP, icon: 'people', detail: LiveStatus.WORKING },
  { group: MonitorGroup.INSTALLATION, icon: 'work', detail: LiveStatus.TRIP },
];

function Tile({
  group,
  icon,
  detail,
}: {
  readonly group: MonitorGroupName;
  readonly icon: IconName;
  readonly detail: LiveStatusName;
}): ReactElement {
  const { m, locale } = useLocale();
  const navigation = useNavigation();
  const board = trpc.monitor.board.useQuery({ group });
  const data = board.data;
  /*
    Подпись — та же, что в шапке табло, куда плитка ведёт: плитка «Швеи»
    открывала экран «Цех», и было неясно, туда ли попал.
  */
  const title = MONITOR_GROUP_LABELS[locale][group];

  return (
    <PressableScale
      onPress={() => {
        navigation.navigate('MonitorBoard', { group });
      }}
      accessibilityLabel={
        data === undefined
          ? title
          : `${title}, ${m('monitor.onShift', { n: data.summary.onShift, total: data.summary.headcount })}`
      }
      style={styles.tileWrap}
    >
      <Card style={styles.tile}>
        <View style={styles.icon}>
          <Icon name={icon} size={17} color={colors.accent} />
        </View>
        <Text style={styles.value}>
          {data === undefined
            ? '—'
            : `${data.summary.onShift.toString()} / ${data.summary.headcount.toString()}`}
        </Text>
        <Text style={styles.label} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {data === undefined
            ? ' '
            : `${LIVE_STATUS_LABELS[locale][detail]} ${data.statusCounts[detail].toString()}`}
        </Text>
      </Card>
    </PressableScale>
  );
}

/** Две плитки «Табло» — швеи и выездные: кто на смене и вход в табло группы. */
export function MonitorTiles(): ReactElement {
  /*
    Не загрузилось — так и пишем, одной карточкой с повтором.

    Плитки без ответа показывали «—» без единого слова, и руководитель
    читал это как «никого нет», а не как «нет связи». Запросы — те же, что
    у плиток (тот же ключ кеша), поэтому лишнего обращения к серверу нет.
  */
  const boards = trpc.useQueries((query) =>
    TILES.map((tile) => query.monitor.board({ group: tile.group })),
  );
  if (boards.some((board) => board.isError && board.data === undefined)) {
    return (
      <Card>
        <ErrorState />
      </Card>
    );
  }

  return (
    <View style={styles.row}>
      {TILES.map((tile) => (
        <Tile key={tile.group} group={tile.group} icon={tile.icon} detail={tile.detail} />
      ))}
    </View>
  );
}

/*
  Плитка — по той же мерке, что плитки сводки на главной (`StatTile`):
  значок 34 × 34 со скруглением `md`, крупное число, подпись под ним. Рядом
  на одном экране стояли две сетки разных систем — значок 32 со скруглением
  10, число 24 и подпись над ним.
*/
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    flex: 1,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: spacing.sm,
  },
  value: {
    ...typography.largeTitle,
    color: colors.textPrimary,
    // Табличные цифры: «1 / 6» и «0 / 6» в соседних плитках одной ширины.
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
