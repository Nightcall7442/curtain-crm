import { formatTime, PERSONAL_BREAK_DURATION_OPTIONS } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyError, notifySuccess } from '../lib/haptics';
import { serverNow } from '../lib/serverClock';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

import { Card, CardTitle, Pill } from './Card';
import { SubmitButton } from './SubmitButton';
import { useLocale } from '../hooks/useLocale';

/**
 * Личная отлучка — сотрудник ненадолго отходит по своим делам, не закрывая
 * смену. Заявляет срок сам, потолок общий для всех (тридцать минут),
 * возврат отмечает тем же жестом, каким отлучку начинал.
 *
 * Рабочее время на отлучке стоит: это личное время, и оплачивать его как
 * рабочее не за что. Так же ведёт себя выезд на установку — оба вычитаются
 * из часов одним и тем же выражением на сервере.
 *
 * Показывается только при открытой смене — карточка сама решает, рисовать
 * ли себя, и родительский экран (`CheckInOutScreen`) её всегда монтирует;
 * так экрану не нужно знать про состояние отлучки, только про смену.
 */
export function PersonalBreakCard({
  shiftOpen,
}: {
  readonly shiftOpen: boolean;
}): ReactElement | null {
  const { m } = useLocale();
  const current = trpc.shifts.currentBreak.useQuery(undefined, { enabled: shiftOpen });
  const utils = trpc.useUtils();

  /* Кольцо таймера берёт паузу из `shifts.current`: без обновления этого
     запроса время на экране продолжало бы идти после начала отлучки. */
  const refresh = async (): Promise<void> => {
    await Promise.all([current.refetch(), utils.shifts.current.invalidate()]);
  };

  const startBreak = trpc.shifts.startBreak.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('break.startError'), error.message);
    },
  });

  const endBreak = trpc.shifts.endBreak.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('break.endError'), error.message);
    },
  });

  const active = current.data ?? null;

  // Тикает раз в секунду, только пока отлучка открыта — на минуту, а не на
  // сутки, поэтому секунды здесь читаемы и не выглядят лишней точностью.
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (active === null) return undefined;

    const timer = setInterval(() => {
      setNow(serverNow());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!shiftOpen || current.isLoading) return null;

  if (active === null) {
    /*
      Единица измерения — из той же строки словаря, что и «20 мин»: шаблон
      с пустым числом даёт «мин» и «daq» без отдельного ключа, и подпись
      под числом не разойдётся с остальным приложением.
    */
    const unit = m('shift.minutes', { n: '' }).trim();

    return (
      <Card>
        <CardTitle title={m('break.title')} icon="break" />
        <Text style={styles.hint}>{m('break.hint')}</Text>
        {/*
          Все сроки — одним рядом равных кнопок. В перенос по ширине подписи
          они ложились 4 + 1: «30 мин» оставалась одна на второй строке, а
          кнопки первой были разной ширины и не доходили до края карточки.

          Число крупно, единица — мелко под ним. В строку «20 мин» на 360
          точках занимала почти всю кнопку: от подписи до рамки оставалось по
          3 точки, и пять кнопок читались одной слипшейся полосой. Число —
          то, что выбирают, — держит кнопку, а единица его только поясняет.
        */}
        <View style={styles.chips}>
          {PERSONAL_BREAK_DURATION_OPTIONS.map((minutes) => (
            <Pressable
              key={minutes}
              onPress={() => {
                startBreak.mutate({ plannedMinutes: minutes });
              }}
              disabled={startBreak.isPending}
              accessibilityRole="button"
              accessibilityLabel={m('shift.minutes', { n: minutes })}
              style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
            >
              <Text style={styles.chipNumber}>{minutes.toString()}</Text>
              <Text style={styles.chipUnit}>{unit}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    );
  }

  const startedAt = new Date(active.startedAt).getTime();
  const expectedReturn = startedAt + active.plannedMinutes * 60_000;
  const overdue = now > expectedReturn;
  const remainingSeconds = Math.max(0, Math.round((expectedReturn - now) / 1000));
  const overdueSeconds = Math.max(0, Math.round((now - expectedReturn) / 1000));

  return (
    <Card>
      <CardTitle
        title={m('break.title')}
        icon="break"
        action={
          <Pill
            text={overdue ? m('break.overdue') : m('break.active')}
            tone={overdue ? 'danger' : 'warning'}
          />
        }
      />

      <Text style={[styles.timer, overdue ? styles.timerOverdue : null]}>
        {overdue ? `−${formatDuration(overdueSeconds)}` : formatDuration(remainingSeconds)}
      </Text>
      <Text style={[styles.hint, styles.timerHint]}>
        {overdue
          ? m('break.overdueHint')
          : m('break.returnBy', { time: formatTime(expectedReturn) })}
      </Text>

      {/*
        Общая кнопка приложения, а не своя: на экране смены эта карточка
        стоит под карточкой выезда, и две главные кнопки с разным
        скруглением и весом подписи выглядели взятыми из разных наборов.
      */}
      <SubmitButton
        label={m('break.back')}
        onPress={() => {
          endBreak.mutate();
        }}
        pending={endBreak.isPending}
      />
    </Card>
  );
}

/** `05:41` для отсчёта в пределах часа — отлучка дольше часа не бывает. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /*
    Высота — кнопки действия: касание сразу начинает отлучку. Скругление —
    `md`, а не таблетка: в двухстрочной кнопке шириной 53 точки таблетка
    превращалась в овал и съедала углы подписи.
  */
  chip: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipNumber: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  chipUnit: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  /*
    Таймер — общий с выездом (`InstallationTripCard`): одна ступень шкалы
    (`typography.timer`), по центру, подсказка под ним тоже по центру. Два
    «я не на месте» на одном экране были набраны по-разному: здесь 34 по
    центру, там 22 слева.
  */
  timer: {
    ...typography.timer,
    color: colors.textPrimary,
    textAlign: 'center',
    marginVertical: spacing.sm,
  },
  timerOverdue: {
    color: colors.danger,
  },
  timerHint: {
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
});
