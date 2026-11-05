import { formatTime, parseMoney, todayIso } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Skeleton } from '../components/Card';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { PayTypeBadge } from '../components/PayTypeBadge';
import { TerminalDaySummary } from '../components/TerminalDaySummary';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Терминальные чеки за день — с фото.
 *
 * Руководитель открывает с главной по «Подробнее»: там только кто, сколько
 * и когда; здесь — сами чеки, как их сняли. Фото во всю ширину: цифры на
 * чеке мелкие, и превью-квадратик читать пришлось бы через увеличение.
 *
 * Под «День» — сумма чеков за день с разбивкой по типам оплаты, у чека —
 * значок типа рядом с именем (просьба заказчика 05.11).
 */
export function TerminalChecksScreen(): ReactElement {
  const { m, money } = useLocale();
  const [day, setDay] = useState(() => todayIso());
  const query = trpc.terminalChecks.byDay.useQuery({ day });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <CardTitle
          title={m('terminal.title')}
          icon="paid"
          action={
            query.data === undefined ? undefined : (
              <Text style={styles.total}>
                {m('terminal.progress', { n: query.data.count, target: query.data.target })}
              </Text>
            )
          }
        />
        <Field label={m('terminal.day')}>
          <DateField value={day} onChange={setDay} placeholder={m('terminal.day')} />
        </Field>
        {query.data !== undefined && query.data.summary.count > 0 && (
          <TerminalDaySummary summary={query.data.summary} title={m('terminal.dayTotal')} />
        )}
      </Card>

      {query.isLoading ? (
        <Card>
          <Skeleton rows={3} />
        </Card>
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <Card>
          <Empty message={m('terminal.noChecks')} />
        </Card>
      ) : (
        query.data?.rows.map((row) => (
          <Card key={row.id}>
            <View style={styles.head}>
              <View style={styles.headText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  {row.payType !== null && <PayTypeBadge type={row.payType} />}
                </View>
                <Text style={styles.time}>
                  {formatTime(row.createdAt)}
                  {row.comment === null ? '' : ` · ${row.comment}`}
                </Text>
              </View>
              <Text style={styles.amount}>{money(parseMoney(row.amount))}</Text>
            </View>
            {row.photoUrl !== null && (
              <Image
                source={{ uri: row.photoUrl }}
                style={styles.photo}
                resizeMode="contain"
                accessibilityLabel={m('terminal.photo')}
              />
            )}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  total: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accent,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  time: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  amount: {
    ...typography.value,
    color: colors.textPrimary,
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
