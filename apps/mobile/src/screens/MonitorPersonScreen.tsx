import { useIsFocused } from '@react-navigation/native';
import {
  formatInstallSlot,
  formatIsoDate,
  formatIsoDateShort,
  MONITOR_GROUP_ROLES,
  MONITOR_POLL_MS,
  MonitorGroup,
  PLAN_PACE_LABELS,
  ROLE_LABELS,
} from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, ErrorState, Skeleton } from '../components/Card';
import { Icon } from '../components/Icon';
import { isAway, PACE_COLOR, statusText, STATUS_COLOR, type MonitorDetail } from '../components/monitor/monitorStyle';
import { PersonPhoto } from '../components/monitor/PersonPhoto';
import { PlanRing } from '../components/monitor/PlanRing';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, fonts, radius, spacing, tabBarSpace, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

type DetailWork = MonitorDetail['queueAll'][number];

/**
 * Человек с табло: фото во всю ширину с именем и статусом, смена сегодня,
 * текущая работа со ссылкой в заказ, план месяца кольцом, 30 дней
 * выработки, очередь и — у выездных — фото с объектов.
 */
export function MonitorPersonScreen({ route, navigation }: RootStackScreenProps<'MonitorPerson'>): ReactElement {
  const { userId } = route.params;
  const { m, t, locale } = useLocale();
  const focused = useIsFocused();
  const person = trpc.monitor.person.useQuery(
    { userId },
    { refetchInterval: focused ? MONITOR_POLL_MS : false, refetchOnWindowFocus: focused },
  );

  if (person.data === undefined) {
    return <View style={styles.content}>{person.isError ? <ErrorState /> : <Skeleton rows={6} />}</View>;
  }

  const data = person.data;
  const unit = data.unit === 'pieces' ? m('monitor.pieces') : m('monitor.orders');
  const subtitle =
    data.group === MonitorGroup.WORKSHOP && data.workstation !== null
      ? m('monitor.workstation', { n: data.workstation })
      : data.roles
          .filter((role) => MONITOR_GROUP_ROLES[data.group].includes(role))
          .map((role) => t(ROLE_LABELS, role))
          .join(', ');
  const shift = data.shiftToday;
  const peak = Math.max(1, ...data.daily.map((day) => day.value));
  const total30 = data.daily.reduce((sum, day) => sum + day.value, 0);

  const openOrder = (orderId: number): void => {
    navigation.navigate('OrderDetail', { orderId });
  };

  const workRow = (work: DetailWork): ReactElement => (
    <Pressable
      key={work.orderId}
      onPress={() => {
        openOrder(work.orderId);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${m('monitor.openOrder')} ${work.orderNumber}`}
      style={({ pressed }) => [styles.work, pressed ? styles.pressed : null]}
    >
      <View style={styles.workText}>
        <Text style={styles.workNumber}>
          {work.orderNumber}
          {work.rework ? <Text style={styles.rework}>{`  ${m('monitor.rework')}`}</Text> : null}
        </Text>
        {work.items.text !== '' && (
          <Text style={styles.workItems} numberOfLines={1}>
            {work.items.text}
          </Text>
        )}
        {work.deadline !== null && (
          <Text style={[styles.workItems, work.overdue ? styles.overdue : null]}>
            {[m('monitor.deadline', { date: formatIsoDateShort(work.deadline) }), work.overdue ? m('monitor.overdue') : null]
              .filter((part) => part !== null)
              .join(' · ')}
          </Text>
        )}
      </View>
      <View style={styles.open}>
        <Text style={styles.openText}>{m('monitor.openOrder')}</Text>
        <Icon name="chevron" size={14} color={colors.accentStrong} />
      </View>
    </Pressable>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={person.isFetching && !person.isLoading}
          onRefresh={() => {
            void person.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View>
        <PersonPhoto
          uri={data.photoUrl}
          name={data.fullName}
          dimmed={isAway(data.status)}
          style={styles.hero}
          initials={{ size: 48, color: colors.accentOnDark, lift: 110 }}
        />
        <View style={styles.heroShade}>
          <Text style={styles.heroPlace}>{m('monitor.place', { n: data.place })}</Text>
          <Text style={styles.heroName} numberOfLines={1}>
            {data.fullName}
          </Text>
          <Text style={styles.heroSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          <View style={styles.heroPill}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[data.status] }]} />
            <Text style={styles.heroPillText} numberOfLines={1}>
              {statusText(data, locale, m)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <Card>
          <Text style={styles.shift}>
            {shift === null
              ? m('monitor.noShift')
              : shift.endedAt === null
                ? m('monitor.shiftSince', { time: formatInstallSlot(shift.startedAt).time })
                : m('monitor.shiftClosed', {
                    from: formatInstallSlot(shift.startedAt).time,
                    to: formatInstallSlot(shift.endedAt).time,
                  })}
          </Text>
          <View style={styles.counts}>
            {[
              { label: m('monitor.today'), value: data.counts.today },
              { label: m('monitor.week'), value: data.counts.week },
              { label: m('monitor.month'), value: data.counts.month },
            ].map((cell) => (
              <View key={cell.label} style={styles.count}>
                <Text style={styles.countValue}>
                  {cell.value.toString()}
                  <Text style={styles.countUnit}>{` ${unit}`}</Text>
                </Text>
                <Text style={styles.countLabel}>{cell.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          <CardTitle title={m('monitor.planTitle')} icon="rating" />
          {data.plan === null ? (
            <Text style={styles.muted}>{m('monitor.noPlan')}</Text>
          ) : (
            <View style={styles.planRow}>
              <PlanRing percent={data.plan.percent} pace={data.plan.pace} />
              <View style={styles.planText}>
                <Text style={[styles.pace, { color: PACE_COLOR[data.plan.pace] }]}>
                  {PLAN_PACE_LABELS[locale][data.plan.pace]}
                </Text>
                <Text style={styles.planValue}>{`${data.counts.month.toString()} / ${data.plan.target.toString()} ${unit}`}</Text>
                <Text style={styles.muted}>{m('monitor.expected', { p: data.plan.expectedPercent })}</Text>
                <Text style={styles.muted}>
                  {data.plan.source === 'personal'
                    ? m('monitor.personalPlan', { date: formatIsoDate(data.plan.effectiveFrom) })
                    : m('monitor.rolePlan', { date: formatIsoDate(data.plan.effectiveFrom) })}
                </Text>
              </View>
            </View>
          )}
        </Card>

        <Card>
          <CardTitle title={m('monitor.current')} icon="work" />
          {data.current.length === 0 ? (
            <Text style={styles.muted}>{m('monitor.noWork')}</Text>
          ) : (
            <View style={styles.list}>{data.current.map(workRow)}</View>
          )}
        </Card>

        <Card>
          <CardTitle title={m('monitor.days30')} icon="calendar" />
          <Text style={styles.muted}>{`${total30.toString()} ${unit}`}</Text>
          <View style={styles.bars} accessibilityLabel={`${m('monitor.days30')}: ${total30.toString()} ${unit}`}>
            {data.daily.map((day, index) => (
              <View key={day.day} style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(3, (day.value / peak) * 100)}%`,
                      backgroundColor: index === data.daily.length - 1 ? colors.accentBright : colors.accent,
                      opacity: day.value === 0 ? 0.18 : 1,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.barAxis}>
            <Text style={styles.axisText}>{formatIsoDateShort(data.daily[0]?.day ?? null)}</Text>
            <Text style={styles.axisText}>{formatIsoDateShort(data.daily.at(-1)?.day ?? null)}</Text>
          </View>
        </Card>

        <Card>
          <CardTitle title={m('monitor.queue')} icon="orders" />
          {data.queueAll.length === 0 ? (
            <Text style={styles.muted}>{m('monitor.queueEmpty')}</Text>
          ) : (
            <View style={styles.list}>{data.queueAll.map(workRow)}</View>
          )}
        </Card>

        {data.photos.length > 0 && (
          <Card>
            <CardTitle title={m('monitor.photos')} icon="photo" />
            <View style={styles.photos}>
              {data.photos.map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: photo.url }}
                  style={styles.photo}
                  accessibilityLabel={photo.orderNumber ?? m('monitor.photos')}
                />
              ))}
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: tabBarSpace,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  // Без фото — тёмная хвоя, как шапка экрана: серый прямоугольник под затемнением выглядел сбоем.
  hero: {
    width: '100%',
    height: 250,
    backgroundColor: colors.headerRaised,
  },
  heroShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  heroPlace: {
    ...typography.caption,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.75)',
  },
  heroName: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 22,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.8)',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroPillText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  shift: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  counts: {
    flexDirection: 'row',
  },
  count: {
    flex: 1,
    alignItems: 'center',
  },
  countValue: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 22,
    color: colors.textPrimary,
  },
  countUnit: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
  },
  countLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  planText: {
    flex: 1,
    gap: 3,
  },
  pace: {
    ...typography.body,
    fontWeight: '700',
  },
  planValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  muted: {
    ...typography.caption,
    color: colors.textMuted,
  },
  list: {
    gap: spacing.sm,
  },
  work: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  workText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  workNumber: {
    fontFamily: fonts.bold,
    fontWeight: '700',
    fontSize: 14,
    color: colors.textPrimary,
  },
  rework: {
    color: colors.danger,
    fontWeight: '600',
  },
  workItems: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overdue: {
    color: colors.danger,
  },
  open: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  openText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accentStrong,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 96,
    gap: 2,
    marginTop: spacing.sm,
  },
  barSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  barAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axisText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});
