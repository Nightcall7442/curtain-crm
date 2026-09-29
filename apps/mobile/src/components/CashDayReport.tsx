import {
  formatIsoDateShort,
  formatTime,
  parseMoney,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { type LocaleMoney, useLocale, type Translate } from '../hooks/useLocale';
import { useToday } from '../hooks/useToday';
import { trpc, type RouterOutputs } from '../lib/trpc';
import { colors, hairline, spacing, typography } from '../theme';
import { Card, CardTitle, Empty, ErrorState, Skeleton } from './Card';
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
  const { m, t, money } = useLocale();
  /*
    День по умолчанию — сегодняшний и катится вместе с календарём; выбранная
    вручную дата держится, пока её не вернут на сегодня. Раньше дата
    запоминалась при открытии экрана, и касса, открытая вчера, наутро
    показывала вчера.
  */
  const today = useToday();
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;

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
          <DateField
            value={day}
            onChange={(value) => {
              setPicked(value === today ? null : value);
            }}
            placeholder={m('cashDay.day')}
          />
        </Field>

        {/*
          Ошибка — ошибкой, а не нулями: пустая касса и касса, которая не
          загрузилась, выглядели одинаково, и сбой читался как «денег нет».
        */}
        {summary.isError ? (
          <ErrorState message={summary.error.message} />
        ) : summary.isLoading ? (
          <Skeleton />
        ) : (
          <>
            {/*
              Карточка дня — только про день: принято, сдано, на руках,
              скидки. Накопленные остатки уехали ниже, в «Итого»: владелец
              открывает кассу посчитать смену, а не остаток с начала работы.
            */}
            <Stat label={m('cashDay.received')} value={money(data?.total ?? 0)} />
            <Stat label={m('cashDay.handedToday')} value={money(data?.collected ?? 0)} />
            <Stat
              label={m('cashDay.onHands')}
              value={money(onHandsTotal)}
              hint={m('cashDay.onHandsWho', { n: byUser.length })}
              tone={onHandsTotal > 0 ? 'warning' : 'plain'}
            />
            {data !== undefined && data.discounts.count > 0 && (
              <Stat label={m('cashDay.discounts')} value={`−${money(data.discounts.total)}`} />
            )}
            {data !== undefined && data.out.payroll > 0 && (
              <Stat label={m('cashDay.payrollToday')} value={money(data.out.payroll)} />
            )}
          </>
        )}
      </Card>

      {/*
        Накопленные остатки — отдельной карточкой и без зарплаты внутри:
        владелец попросил вести выплаты отдельно от кассы, а кассу считать
        по продажам. Зарплата видна здесь же строкой — но сама по себе.
      */}
      <Card>
        <CardTitle title={m('cashDay.totals')} icon="paid" />
        {summary.isError ? (
          <ErrorState message={summary.error.message} />
        ) : summary.isLoading ? (
          <Skeleton />
        ) : (
          <>
            <Stat
              label={m('cashDay.inKassa')}
              value={money(data?.balance.cash.total ?? 0)}
              hint={data === undefined ? undefined : kassaParts(data.balance, m, money)}
            />
            <Stat
              label={m('cashDay.onAccount')}
              value={money(data?.balance.cashless.total ?? 0)}
              hint={
                data === undefined
                  ? undefined
                  : m('cashDay.onAccountParts', {
                      card: money(data.balance.cashless.card),
                      qr: money(data.balance.cashless.qr),
                      click: money(data.balance.cashless.click),
                    })
              }
            />
            {data !== undefined && data.balance.cash.payroll > 0 && (
              <Stat
                label={m('cashDay.payrollPaid')}
                value={money(data.balance.cash.payroll)}
                hint={m('cashDay.payrollApart')}
              />
            )}
          </>
        )}
      </Card>

      <Card>
        <CardTitle title={m('cashDay.bySource')} icon="orders" />
        {summary.isError ? (
          <ErrorState message={summary.error.message} />
        ) : summary.isLoading ? (
          <Skeleton />
        ) : data === undefined || data.rows.length === 0 ? (
          <Empty message={m('cashDay.noIncome')} />
        ) : (
          <>
            {data.rows.map((row) => (
              <Line
                key={row.kind}
                label={t(PAYMENT_KIND_LABELS, row.kind)}
                value={money(row.total)}
              />
            ))}
            <View style={styles.divider} />
            {PAYMENT_METHODS.map((method) => (
              <Line
                key={method}
                label={m('cashDay.methodTotal', { method: t(PAYMENT_METHOD_LABELS, method) })}
                value={money(data.byMethod[method])}
                muted
              />
            ))}
            <Line label={m('cashDay.total')} value={money(data.total)} strong />
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
              hint={formatTime(row.createdAt)}
              value={money(parseMoney(row.amount))}
            />
          ))
        )}
        {collections.data !== undefined && (
          <Line
            label={m('cashDay.handed')}
            value={money(parseMoney(collections.data.total))}
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
            <Line
              key={row.userId}
              label={row.fullName}
              value={money(parseMoney(row.onHands))}
              strong
            />
          ))
        )}
      </Card>
    </>
  );
}

/** Крупная цифра с подписью — три таких в шапке отчёта. */
/**
 * Из чего сложилось «В кассе» — одной строкой под цифрой. Владелец увидел
 * 13 386 055 и спросил «а это что»: остаток за всё время без слагаемых
 * читается как случайное число.
 */
function kassaParts(parts: CashSummaryParts, m: Translate, money: LocaleMoney): string {
  if (parts.since === null) return m('cashDay.inKassaNone');
  return m('cashDay.inKassaParts', {
    date: formatIsoDateShort(parts.since),
    collected: money(parts.cash.collected),
    management: money(parts.cash.byManagement),
    purchases: money(parts.cash.purchases),
    refunds: money(parts.cash.refunds),
  });
}

type CashSummaryParts = RouterOutputs['payments']['summary']['balance'];

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
      <Text style={[styles.statValue, tone === 'warning' ? styles.statWarning : null]}>
        {value}
      </Text>
      {hint !== undefined && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

/** Строка «подпись — сумма», как в остальных карточках приложения. */
function Line({
  label,
  hint,
  value,
  strong = false,
  muted = false,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly value: string;
  readonly strong?: boolean;
  readonly muted?: boolean;
}): ReactElement {
  return (
    <View style={styles.line}>
      <View style={styles.lineText}>
        <Text style={[styles.lineLabel, muted ? styles.lineMuted : null]}>{label}</Text>
        {hint !== undefined && <Text style={styles.lineHint}>{hint}</Text>}
      </View>
      <Text
        style={[
          styles.lineValue,
          strong ? styles.lineStrong : null,
          muted ? styles.lineMuted : null,
        ]}
      >
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
});
