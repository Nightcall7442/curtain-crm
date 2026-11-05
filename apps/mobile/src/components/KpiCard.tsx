import { tryParseMoney } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, opacity, sizes, spacing, typography } from '../theme';

import { Card, CardTitle, Empty, Progress } from './Card';
import { Icon } from './Icon';
import { useLocale } from '../hooks/useLocale';

/**
 * Чем закрыта сумма, пока её не открыли.
 *
 * Длина примерно равна длине настоящей суммы: с более короткой маской
 * карточка заметно дёргается в момент открытия.
 */

/**
 * Зарплата за период.
 *
 * «Целевая» — сумма, которую даёт схема при стопроцентном выполнении плана;
 * она берётся из СНИМКА схемы, сохранённого в расчёте, а не из текущих
 * настроек: иначе повышение ставки задним числом переписывало бы прошлые
 * месяцы прямо на экране сотрудника.
 *
 * Для схем без KPI (оклад, почасовая, процент) шкала выполнения не
 * показывается — выполнять там нечего.
 */
export function KpiCard({
  periodLabel,
  targetAmount,
  calculatedAmount,
  kpiPercent,
  isLoading,
}: {
  readonly periodLabel: string;
  /** Строка `numeric` из снимка схемы либо `null`, если схема без KPI. */
  readonly targetAmount: string | null;
  readonly calculatedAmount: string | null;
  readonly kpiPercent: string | null;
  readonly isLoading: boolean;
}): ReactElement {
  const { m, money: formatMoney } = useLocale();
  /*
    Суммы и процент разбираются один раз и мягко.

    Строка, которая не разбирается, — не повод ронять экран. Так и было:
    у расчёта текущего месяца снимок схемы пришёл пустым (`{}`), «целевая»
    собралась в строку `"NaN"`, и нажатие на глаз бросало исключение из
    `parseMoney` — профиль целиком сменялся пустым экраном. Неразобранная
    цель просто не показывается, как у схем без цели; неразобранный процент
    — тоже, вместо «NaN%».
  */
  const target = tryParseMoney(targetAmount);
  const calculated = tryParseMoney(calculatedAmount);
  const parsedPercent = kpiPercent === null ? Number.NaN : Number.parseFloat(kpiPercent);
  const percent = Number.isFinite(parsedPercent) ? parsedPercent : null;

  /*
    Суммы закрыты, пока сотрудник сам их не откроет.

    Зарплату смотрят в цеху и в транспорте, где экран видит сосед, а
    «сколько ты получаешь» — разговор, который человек заводит сам или не
    заводит вовсе. Это не пароль: прятать сумму от владельца телефона
    бессмысленно. Это заслонка от чужого взгляда, и снимается она одним
    нажатием.

    Состояние живёт в компоненте и сбрасывается при уходе с экрана — иначе
    однажды открытая сумма осталась бы видимой до перезапуска приложения.
  */
  const [revealed, setRevealed] = useState(false);

  const money = (minor: number): string => (revealed ? formatMoney(minor) : m('kpi.masked'));

  /*
    Высота — по содержимому, без `flex: 1`, как у «Текущей смены» рядом.
    Растяжение осталось с тех пор, как две карточки стояли в ряд и
    выравнивались по высоте; в профиле они давно стоят колонкой.
  */
  return (
    <Card>
      <CardTitle
        title={m('kpi.title')}
        icon="payroll"
        action={
          <View style={styles.titleAction}>
            <Text style={styles.period}>{periodLabel}</Text>
            {calculated !== null && (
              <Pressable
                onPress={() => {
                  setRevealed((current) => !current);
                }}
                accessibilityRole="button"
                accessibilityLabel={revealed ? m('kpi.hide') : m('kpi.show')}
                style={({ pressed }) => [styles.eye, pressed ? styles.eyePressed : null]}
              >
                <Icon name={revealed ? 'eyeOff' : 'eye'} size={EYE_ICON} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        }
      />

      {isLoading ? (
        <Empty message={m('kpi.loading')} />
      ) : calculated === null ? (
        <Empty message={m('kpi.none')} hint={m('kpi.noneHint')} />
      ) : (
        <>
          {target !== null && (
            <>
              <Text style={styles.label}>{m('kpi.target')}</Text>
              <Text style={styles.amountMuted}>{money(target)}</Text>
            </>
          )}

          {percent !== null && (
            <View style={styles.kpiBlock}>
              <Text style={styles.label}>{m('kpi.done')}</Text>
              <Text
                style={[
                  styles.percent,
                  { color: percent >= 100 ? colors.positive : colors.warning },
                ]}
              >
                {`${percent.toFixed(0)}%`}
              </Text>
              <Progress
                percent={percent}
                color={percent >= 100 ? colors.positive : colors.warning}
              />
            </View>
          )}

          {/*
            Черта отделяет итог от цели и выполнения. Когда их нет (оклад,
            почасовая, процент), черта под заголовком отделяла бы пустоту.
          */}
          <View style={target === null && percent === null ? null : styles.totalBlock}>
            <Text style={styles.label}>{m('kpi.accrued')}</Text>
            <Text style={styles.amount}>{money(calculated)}</Text>
          </View>
        </>
      )}
    </Card>
  );
}

/** Размер значка «глаз». */
const EYE_ICON = 18;
/** Насколько зона нажатия выходит за значок с каждой стороны. */
const EYE_OUTSET = (sizes.touchTarget - EYE_ICON) / 2;

const styles = StyleSheet.create({
  period: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  titleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  /*
    Зона нажатия — настоящие 44 точки, а не `hitSlop`.

    В браузере `hitSlop` не работает вовсе: в PWA глаз ловил касание только
    на самом значке 18×20. Отрицательные отступы возвращают значок на прежнее
    место и не дают коробке раздуть строку заголовка: карточка не становится
    выше от того, что в глаз легче попасть.
  */
  eye: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    margin: -EYE_OUTSET,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePressed: {
    opacity: opacity.pressed,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  amountMuted: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  kpiBlock: {
    marginTop: spacing.md,
  },
  percent: {
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  totalBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2,
  },
});
