import { DAY_OFF_STATUS_LABELS, DayOffStatus, formatIsoDateShort } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { DateField } from '../components/DateField';
import { Field, Input } from '../components/Field';
import { MonthSchedule } from '../components/MonthSchedule';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale, type Translate } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, sizes, spacing, typography } from '../theme';

/**
 * Запрос на выходные.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену,
 * руководитель (директор или админ) одобряет или отклоняет — на своей
 * стороне, в веб-панели или здесь же, в мобилке, если у него есть телефон
 * под рукой. Экран собирает и форму нового запроса, и историю своих —
 * искать статус решения на отдельном экране незачем.
 *
 * Даты — свободным текстом `2026-09-15`, тем же форматом, что и срок заказа:
 * своего календаря-пикера в приложении нет ни у одной формы, и заводить его
 * ради одного поля значило бы разойтись с остальными.
 */
export function DayOffScreen(): ReactElement {
  const { t, m } = useLocale();
  const insets = useSafeAreaInsets();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const myRequests = trpc.dayOff.my.useQuery();

  const request = trpc.dayOff.request.useMutation({
    async onSuccess() {
      await myRequests.refetch();
      setStartDate('');
      setEndDate('');
      setReason('');
      setShowErrors(false);
    },
    onError(error) {
      Alert.alert(m('dayoff.sendError'), error.message);
    },
  });

  const cancel = trpc.dayOff.cancel.useMutation({
    onSuccess() {
      void myRequests.refetch();
    },
    onError(error) {
      Alert.alert(m('dayoff.withdrawError'), error.message);
    },
  });

  const errors = validate({ startDate, endDate }, m);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    request.mutate({
      startDate: startDate.trim(),
      endDate: endDate.trim(),
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
  };

  const confirmCancel = (id: number, period: string): void => {
    Alert.alert(m('dayoff.withdrawTitle', { period }), m('dayoff.withdrawBody'), [
      { text: m('dayoff.keep'), style: 'cancel' },
      {
        text: m('dayoff.withdraw'),
        style: 'destructive',
        onPress: () => {
          cancel.mutate({ id });
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Снизу — безопасная зона и обычный отступ, а не место под панель
          вкладок: это экран стека, панели под ним нет, и под последней
          карточкой оставалась пустая полоса в треть экрана. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          График — первым: чаще всего сюда заходят посмотреть, работаю ли я
          в четверг, а не просить новый выходной.
        */}
        <MonthSchedule />

        {/*
          У каждой карточки экрана свой значок: три календаря подряд читались
          как одна и та же вещь, повторённая трижды.
        */}
        <Card>
          <CardTitle title={m('dayoff.new')} icon="send" />

          <View style={styles.dates}>
            <View style={styles.dateItem}>
              <Field label={m('dayoff.from')} required error={showErrors ? errors.startDate : undefined}>
                <DateField
                  value={startDate}
                  onChange={setStartDate}
                  placeholder={m('dayoff.from')}
                  emptyText={m('common.datePlaceholder')}
                  invalid={showErrors && errors.startDate !== undefined}
                  minimumDate={new Date()}
                />
              </Field>
            </View>
            <View style={styles.dateItem}>
              <Field label={m('dayoff.to')} required error={showErrors ? errors.endDate : undefined}>
                <DateField
                  value={endDate}
                  onChange={setEndDate}
                  placeholder={m('dayoff.to')}
                  emptyText={m('common.datePlaceholder')}
                  invalid={showErrors && errors.endDate !== undefined}
                  minimumDate={new Date()}
                />
              </Field>
            </View>
          </View>

          <Field label={m('dayoff.reason')} hint={m('dayoff.optional')}>
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder={m('dayoff.reasonPlaceholder')}
              multiline
            />
          </Field>

          {/* Общая кнопка формы: та же высота и таблетка, что на соседних экранах. */}
          <SubmitButton label={m('dayoff.submit')} onPress={submit} pending={request.isPending} />
        </Card>

        <Card>
          <CardTitle title={m('dayoff.mine')} icon="orders" />

          {myRequests.isLoading ? (
            <Skeleton />
          ) : myRequests.isError ? (
            <ErrorState />
          ) : (myRequests.data ?? []).length === 0 ? (
            <Empty message={m('dayoff.none')} />
          ) : (
            (myRequests.data ?? []).map((item, index, all) => {
              const period = formatPeriod(item.startDate, item.endDate);

              return (
                <View
                  key={item.id}
                  // Линия — между запросами; под последним её рисовал бы
                  // край карточки второй раз.
                  style={[styles.requestRow, index === all.length - 1 ? styles.requestRowLast : null]}
                >
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestPeriod}>{period}</Text>
                    <Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={statusTone(item.status)} />
                  </View>

                  {item.reason !== null && <Text style={styles.requestNote}>{item.reason}</Text>}
                  {item.rejectionReason !== null && (
                    <Text style={styles.requestRejection}>{m('dayoff.rejection', { reason: item.rejectionReason })}</Text>
                  )}

                  {/*
                    Ссылка — по ширине своей подписи и высотой в полную
                    зону нажатия. Прежде она тянулась на всю строку при
                    высоте 24: касание пустого места справа от слова
                    открывало «Отозвать запрос?», а `hitSlop` в браузере не
                    работает вовсе.
                  */}
                  {item.status === DayOffStatus.PENDING && (
                    <Pressable
                      onPress={() => {
                        confirmCancel(item.id, period);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${m('dayoff.withdraw')}: ${period}`}
                      disabled={cancel.isPending}
                      style={({ pressed }) => [styles.cancelLink, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.cancelLinkText}>{m('dayoff.withdraw')}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */

function formatPeriod(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatIsoDateShort(startDate);
  return `${formatIsoDateShort(startDate)} – ${formatIsoDateShort(endDate)}`;
}

function statusTone(status: DayOffStatus): 'neutral' | 'positive' | 'warning' | 'danger' {
  switch (status) {
    case DayOffStatus.APPROVED:
      return 'positive';
    case DayOffStatus.REJECTED:
      return 'danger';
    case DayOffStatus.CANCELLED:
      return 'neutral';
    default:
      return 'warning';
  }
}

/**
 * Проверка формы.
 *
 * Дублирует часть серверных правил намеренно — та же логика, что у срока
 * заказа: подсказать до отправки дешевле, чем показать отказ после запроса.
 */
function validate(values: {
  readonly startDate: string;
  readonly endDate: string;
}, m: Translate): Partial<Record<'startDate' | 'endDate', string>> {
  const errors: Record<string, string> = {};
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(values.startDate.trim())) {
    errors['startDate'] = m('dayoff.dateFormat');
  }
  if (!datePattern.test(values.endDate.trim())) {
    errors['endDate'] = m('dayoff.dateFormat');
  }
  if (
    errors['startDate'] === undefined &&
    errors['endDate'] === undefined &&
    values.endDate.trim() < values.startDate.trim()
  ) {
    errors['endDate'] = m('dayoff.endBeforeStart');
  }

  return errors;
}

/**
 * Насколько зона нажатия ссылки выходит за строку её подписи — сверху и
 * снизу поровну. Отрицательный отступ возвращает строке запроса прежнюю
 * высоту: ссылка стала крупнее для пальца, но не для глаза.
 */
const LINK_BLEED = (sizes.touchTarget - typography.caption.lineHeight) / 2;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  dates: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateItem: {
    flex: 1,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  requestRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  /* Последний запрос — без линии и без нижнего отступа: его даёт карточка. */
  requestRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  requestPeriod: {
    ...typography.value,
    color: colors.textPrimary,
  },
  requestNote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  requestRejection: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  cancelLink: {
    alignSelf: 'flex-start',
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    // Подпись стоит там же, где стояла, — в 8 точках под текстом выше.
    marginTop: spacing.sm - LINK_BLEED,
    marginBottom: -LINK_BLEED,
  },
  // Тот же вид, что у ссылок в шапках карточек (`CardLink`), только красный.
  cancelLinkText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.danger,
  },
});
