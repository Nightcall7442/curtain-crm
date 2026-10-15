import {
  formatIsoDateShort,
  MONITOR_GROUP_ROLES,
  MonitorGroup,
  ROLE_LABELS,
  type MonitorGroup as MonitorGroupName,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { cardShadow, colors, fonts, radius, spacing, typography } from '../../theme';

import { PressableScale } from '../PressableScale';
import { isAway, statusText, STATUS_COLOR, type MonitorPersonData } from './monitorStyle';
import { PersonPhoto } from './PersonPhoto';
import { PlanLine } from './PlanLine';

/**
 * Человек на табло в приложении: фото 84×100 с местом за месяц, имя,
 * машинка или роль, статус, текущий заказ, план месяца и выработка.
 */
export function PersonRow({
  person,
  group,
  unit,
  onPress,
}: {
  readonly person: MonitorPersonData;
  readonly group: MonitorGroupName;
  readonly unit: string;
  readonly onPress: () => void;
}): ReactElement {
  const { m, t, locale } = useLocale();
  const away = isAway(person.status);
  const [work] = person.current;
  const subtitle =
    group === MonitorGroup.WORKSHOP && person.workstation !== null
      ? m('monitor.workstation', { n: person.workstation })
      : person.roles
          .filter((role) => MONITOR_GROUP_ROLES[group].includes(role))
          .map((role) => t(ROLE_LABELS, role))
          .join(', ');
  const counts = [
    { label: m('monitor.today'), value: person.counts.today },
    { label: m('monitor.week'), value: person.counts.week },
    { label: m('monitor.month'), value: person.counts.month },
  ];

  return (
    <PressableScale onPress={onPress} accessibilityLabel={person.fullName}>
      <View style={styles.card}>
        <View>
          <PersonPhoto uri={person.photoUrl} name={person.fullName} dimmed={away} style={styles.photo} />
          <View style={styles.place}>
            <Text style={styles.placeText}>{person.place.toString()}</Text>
          </View>
        </View>

        <View style={[styles.body, away ? styles.awayBody : null]}>
          <Text style={styles.name} numberOfLines={1}>
            {person.fullName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[person.status] }]} />
            <Text style={[styles.statusText, { color: STATUS_COLOR[person.status] }]} numberOfLines={1}>
              {statusText(person, locale, m)}
            </Text>
          </View>
          <Text style={[styles.work, work?.overdue === true ? styles.overdue : null]} numberOfLines={1}>
            {work === undefined
              ? m('monitor.noWork')
              : [
                  work.orderNumber,
                  work.rework ? m('monitor.rework') : null,
                  work.deadline === null ? null : m('monitor.deadline', { date: formatIsoDateShort(work.deadline) }),
                ]
                  .filter((part) => part !== null)
                  .join(' · ')}
          </Text>
          <PlanLine plan={person.plan} done={person.counts.month} unit={unit} />
          <View style={styles.counts}>
            {counts.map((cell) => (
              <View key={cell.label} style={styles.count}>
                <Text style={styles.countValue}>{cell.value.toString()}</Text>
                <Text style={styles.countLabel}>{cell.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  photo: {
    width: 84,
    height: 100,
    borderRadius: radius.md,
  },
  place: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  placeText: {
    fontFamily: fonts.bold,
    fontWeight: '800',
    fontSize: 13,
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  awayBody: {
    opacity: 0.75,
  },
  name: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
    flexShrink: 1,
  },
  work: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overdue: {
    color: colors.danger,
  },
  counts: {
    flexDirection: 'row',
    marginTop: 2,
  },
  count: {
    flex: 1,
    alignItems: 'center',
  },
  countValue: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 17,
    color: colors.textPrimary,
  },
  countLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
});
