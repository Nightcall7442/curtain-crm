import {
  DAY_OFF_STATUS_LABELS,
  DayOffStatus,
  formatIsoDateShort,
  MAX_DAY_OFF_REASON_LENGTH,
} from '@curtain-crm/shared';
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
import { LateRequestForm } from '../components/LateRequestForm';
import { MonthSchedule } from '../components/MonthSchedule';
import { SegmentedControl } from '../components/SegmentedControl';
import { SubmitButton } from '../components/SubmitButton';
import {
  dayOffPeriod,
  latePeriod,
  RequestKindLabel,
  requestStatusTone,
  type RequestKind,
} from '../components/TimeOffRequest';
import { useLocale, type Translate } from '../hooks/useLocale';
import { mergeRequests } from '../lib/requestOrder';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, sizes, spacing, typography } from '../theme';

/**
 * Запрос на выходные — и на опоздание.
 *
 * Сотрудник просит один или несколько дней подряд не выходить на смену
 * либо прийти в конкретный день позже графика («12.11 приду к 10:30»);
 * руководитель (директор или админ) одобряет или отклоняет — в веб-панели
 * или здесь же, в мобилке, на экране «Отгулы». Экран собирает и форму
 * нового запроса, и историю своих — искать статус решения на отдельном
 * экране незачем.
 *
 * Опоздание — здесь же, переключателем над формой, а не отдельным
 * экраном: так просил владелец («внутри запроса на выходные»), и
 * сотрудник, который отпрашивается, приходит именно сюда. «Мои запросы» —
 * общий список обоих видов в серверном порядке: ждущие решения сверху.
 *
 * Экран доступен без открытой смены: о выходном и об опоздании просят
 * заранее, до прихода (`ALLOWED_WITHOUT_SHIFT` на сервере).
 */
export function DayOffScreen(): ReactElement {
  const { t, m } = useLocale();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<RequestKind>('dayOff');

  const myDayOff = trpc.dayOff.my.useQuery();
  const myLate = trpc.lateRequests.my.useQuery();

  const cancelDayOff = trpc.dayOff.cancel.useMutation({
    onSuccess() {
      void myDayOff.refetch();
    },
    onError(error) {
      Alert.alert(m('dayoff.withdrawError'), error.message);
    },
  });

  const cancelLate = trpc.lateRequests.cancel.useMutation({
    onSuccess() {
      void myLate.refetch();
    },
    onError(error) {
      Alert.alert(m('dayoff.withdrawError'), error.message);
    },
  });

  const isCancelling = cancelDayOff.isPending || cancelLate.isPending;

  const confirmCancel = (title: string, onConfirm: () => void): void => {
    Alert.alert(title, m('dayoff.withdrawBody'), [
      { text: m('dayoff.keep'), style: 'cancel' },
      { text: m('dayoff.withdraw'), style: 'destructive', onPress: onConfirm },
    ]);
  };

  /*
    Оба вида — одним списком: человек ищет «что мне ответили», а не «что
    мне ответили по выходным». Порядок — серверный у каждого вида, слитый
    по тому же правилу (`mergeRequests`).
  */
  const requests = mergeRequests(
    (myDayOff.data ?? []).map((item) => ({ ...item, kind: 'dayOff' as const })),
    (myLate.data ?? []).map((item) => ({ ...item, kind: 'late' as const })),
  );

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

          <View style={styles.kindSwitch}>
            <SegmentedControl
              value={kind}
              onChange={setKind}
              options={[
                { value: 'dayOff', label: m('request.kindDayOff'), icon: 'calendar' },
                { value: 'late', label: m('request.kindLate'), icon: 'shift' },
              ]}
            />
          </View>

          {/*
            Обе формы остаются смонтированными, видна одна: переключиться
            посмотреть и вернуться — не повод стирать уже выбранные даты.
          */}
          <View style={kind === 'dayOff' ? null : styles.hidden}>
            <DayOffForm />
          </View>
          <View style={kind === 'late' ? null : styles.hidden}>
            <LateRequestForm />
          </View>
        </Card>

        <Card>
          <CardTitle title={m('dayoff.mine')} icon="orders" />

          {myDayOff.isLoading || myLate.isLoading ? (
            <Skeleton />
          ) : myDayOff.isError || myLate.isError ? (
            <ErrorState />
          ) : requests.length === 0 ? (
            <Empty message={m('dayoff.none')} />
          ) : (
            requests.map((item, index, all) => {
              const period =
                item.kind === 'late'
                  ? latePeriod(item.date, item.arriveBy, m)
                  : dayOffPeriod(item.startDate, item.endDate);

              const withdraw = (): void => {
                if (item.kind === 'late') {
                  // В заголовке — только день: «…на опоздание 12.11?», без «до 10:30».
                  confirmCancel(m('late.withdrawTitle', { date: formatIsoDateShort(item.date) }), () => {
                    cancelLate.mutate({ id: item.id });
                  });
                  return;
                }
                confirmCancel(m('dayoff.withdrawTitle', { period }), () => {
                  cancelDayOff.mutate({ id: item.id });
                });
              };

              return (
                <View
                  // id у выходных и опозданий — из разных таблиц и могут совпасть.
                  key={`${item.kind}:${item.id.toString()}`}
                  // Линия — между запросами; под последним её рисовал бы
                  // край карточки второй раз.
                  style={[styles.requestRow, index === all.length - 1 ? styles.requestRowLast : null]}
                >
                  <View style={styles.requestHeader}>
                    <View style={styles.requestMain}>
                      <RequestKindLabel kind={item.kind} />
                      <Text style={styles.requestPeriod}>{period}</Text>
                    </View>
                    <Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={requestStatusTone(item.status)} />
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
                      onPress={withdraw}
                      accessibilityRole="button"
                      accessibilityLabel={`${m('dayoff.withdraw')}: ${period}`}
                      disabled={isCancelling}
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

/**
 * Форма «Выходные»: с какого по какой день.
 *
 * Дата — календарём (`DateField`), а не набором `2026-09-15`; наружу
 * уходит та же строка `YYYY-MM-DD`.
 */
function DayOffForm(): ReactElement {
  const { m } = useLocale();
  const utils = trpc.useUtils();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const request = trpc.dayOff.request.useMutation({
    async onSuccess() {
      await utils.dayOff.my.invalidate();
      setStartDate('');
      setEndDate('');
      setReason('');
      setShowErrors(false);
    },
    onError(error) {
      Alert.alert(m('dayoff.sendError'), error.message);
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

  return (
    <View>
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
          maxLength={MAX_DAY_OFF_REASON_LENGTH}
          multiline
        />
      </Field>

      {/* Общая кнопка формы: та же высота и таблетка, что на соседних экранах. */}
      <SubmitButton label={m('dayoff.submit')} onPress={submit} pending={request.isPending} />
    </View>
  );
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
  kindSwitch: {
    marginBottom: spacing.lg,
  },
  hidden: {
    display: 'none',
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
  requestMain: {
    flex: 1,
    minWidth: 0,
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
