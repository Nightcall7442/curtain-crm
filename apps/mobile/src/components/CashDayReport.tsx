import {
  formatMoney,
  parseMoney,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  todayIso,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, spacing, typography } from '../theme';
import { Card, CardTitle, Empty, Skeleton } from './Card';
import { DateField } from './DateField';
import { Field } from './Field';

/**
 * Касса дня — для руководства, на телефоне.
 *
 * То же, что страница «Касса» в панели: сколько принято за день и чем, что
 * дошло до ящика, кто сколько сдал и у кого сколько на руках. Владелец
 * открыл панель с телефона и попросил то же самое в приложении — считать
 * кассу вечером он хочет там же, где отмечает смены и смотрит заказы.
 *
 * Пятиколонная таблица «источник × способ» на ширину телефона не ложится:
 * здесь каждый источник — строка с итогом, а разбивка по способам — ниже,
 * общим списком. Цифры те же, что в панели: `payments.summary` один на оба.
 */
export function CashDayReport(): ReactElement {
  const { m, t } = useLocale();
  const [day, setDay] = useState(() => todayIso());

  const summary = trpc.payments.summary.useQuery({ day });
  const collections = trpc.payments.collections.useQuery({ day });
  const onHands = trpc.payments.onHands.useQuery();

  const byUser = onHands.data?.byUser ?? [];
  const onHandsTotal = byUser.reduce((sum, row) => sum + parseMoney(row.onHands), 0);
  const data = summary.data;

  return (
    <>
      <Card>
        <CardTitle title={m('cashDay.title')} icon="paid" />

        <Field label={m('cashDay.day')}>
          <DateField value={day} onChange={setDay} placeholder={m('cashDay.day')} />
        </Field>

        {summary.isLoading ? (
          <Skeleton />
        ) : (
          <>
            <Stat label={m('cashDay.received')} value={formatMoney(data?.total ?? 0)} />
            <Stat label={m('cashDay.inKassa')} value={formatMoney(data?.inKassa ?? 0)} />
            <Stat
              label={m('cashDay.onHands')}
              value={formatMoney(onHandsTotal)}
              hint={m('cashDay.onHandsWho', { n: byUser.length })}
              tone={onHandsTotal > 0 ? 'warning' : 'plain'}
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle title={m('cashDay.bySource')} icon="orders" />
        {summary.isLoading ? (
          <Skeleton />
        ) : data === undefined || data.rows.length === 0 ? (
          <Empty message={m('cashDay.noIncome')} />
        ) : (
          <>
            {data.rows.map((row) => (
              <Line key={row.kind} label={t(PAYMENT_KIND_LABELS, row.kind)} value={formatMoney(row.total)} />
            ))}
            <View style={styles.divider} />
            {PAYMENT_METHODS.map((method) => (
              <Line
                key={method}
                label={m('cashDay.methodTotal', { method: t(PAYMENT_METHOD_LABELS, method) })}
                value={formatMoney(data.byMethod[method])}
                muted
              />
            ))}
            <Line label={m('cashDay.total')} value={formatMoney(data.total)} strong />
          </>
        )}
      </Card>

      <Card>
        <CardTitle title={m('cashDay.collections')} icon="paid" />
        {collections.isLoading ? (
          <Skeleton />
        ) : (collections.data?.rows.length ?? 0) === 0 ? (
          <Empty message={m('cashDay.nobodyHanded')} />
        ) : (
          collections.data?.rows.map((row) => (
            <Line
              key={row.id}
              label={row.fullName}
              hint={new Date(row.createdAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              value={formatMoney(parseMoney(row.amount))}
              /* Чек для налоговой: у старых сдач его нет, у новых — обязателен. */
              action={
                row.receiptUrl === null ? undefined : (
                  <Pressable
                    onPress={() => {
                      void Linking.openURL(row.receiptUrl as string);
                    }}
                    accessibilityRole="link"
                    hitSlop={8}
                    style={({ pressed }) => [styles.receipt, pressed ? { opacity: opacity.pressed } : null]}
                  >
                    <Text style={styles.receiptText}>{m('collection.openReceipt')}</Text>
                  </Pressable>
                )
              }
            />
          ))
        )}
        {collections.data !== undefined && (
          <Line
            label={m('cashDay.handed')}
            value={formatMoney(parseMoney(collections.data.total))}
            strong
          />
        )}
      </Card>

      <Card>
        <CardTitle title={m('cashDay.onHands')} icon="people" />
        {onHands.isLoading ? (
          <Skeleton />
        ) : byUser.length === 0 ? (
          <Empty message={m('cashDay.allHanded')} />
        ) : (
          byUser.map((row) => (
            <Line key={row.userId} label={row.fullName} value={formatMoney(parseMoney(row.onHands))} strong />
          ))
        )}
      </Card>
    </>
  );
}

/** Крупная цифра с подписью — три таких в шапке отчёта. */
function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: 'plain' | 'warning';
}): ReactElement {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, tone === 'warning' ? styles.statWarning : null]}>{value}</Text>
      {hint !== undefined && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

/** Строка «подпись — сумма», как в остальных карточках приложения. */
function Line({
  label,
  hint,
  value,
  action,
  strong = false,
  muted = false,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly action?: ReactElement;
  readonly strong?: boolean;
  readonly muted?: boolean;
}): ReactElement {
  return (
    <View style={styles.line}>
      <View style={styles.lineText}>
        <Text style={[styles.lineLabel, muted ? styles.lineMuted : null]}>{label}</Text>
        {hint !== undefined && <Text style={styles.lineHint}>{hint}</Text>}
      </View>
      {action}
      <Text style={[styles.lineValue, strong ? styles.lineStrong : null, muted ? styles.lineMuted : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    paddingVertical: spacing.sm,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  statLabel: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: 2,
  },
  statWarning: {
    color: colors.warning,
  },
  statHint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  lineText: {
    flex: 1,
  },
  lineLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  lineHint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  lineValue: {
    ...typography.value,
    color: colors.textPrimary,
  },
  lineStrong: {
    fontWeight: '700',
  },
  lineMuted: {
    color: colors.textMuted,
  },
  divider: {
    height: spacing.xs,
  },
  receipt: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  receiptText: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.accent,
  },
});
