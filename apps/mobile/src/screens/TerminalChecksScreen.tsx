import { formatMoney, parseMoney, todayIso } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, Skeleton } from '../components/Card';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Терминальные чеки за день — с фото.
 *
 * Руководитель открывает с главной по «Подробнее»: там только кто, сколько
 * и когда; здесь — сами чеки, как их сняли. Фото во всю ширину: цифры на
 * чеке мелкие, и превью-квадратик читать пришлось бы через увеличение.
 */
export function TerminalChecksScreen(): ReactElement {
  const { m } = useLocale();
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
              <Text style={styles.total}>{m('terminal.progress', { n: query.data.count, target: query.data.target })}</Text>
            )
          }
        />
        <Field label={m('terminal.day')}>
          <DateField value={day} onChange={setDay} placeholder={m('terminal.day')} />
        </Field>
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
                <Text style={styles.name}>{row.fullName}</Text>
                <Text style={styles.time}>
                  {new Date(row.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  {row.comment === null ? '' : ` · ${row.comment}`}
                </Text>
              </View>
              <Text style={styles.amount}>{formatMoney(parseMoney(row.amount))}</Text>
            </View>
            <Image source={{ uri: row.photoUrl }} style={styles.photo} resizeMode="contain" accessibilityLabel={m('terminal.photo')} />
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.md,
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
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
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
