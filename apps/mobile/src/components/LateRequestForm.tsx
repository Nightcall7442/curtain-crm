import {
  CLOCK_TIME_PATTERN,
  MAX_LATE_REQUEST_REASON_LENGTH,
  workshopClockTime,
  workshopDayIso,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useLocale, type Translate } from '../hooks/useLocale';
import { serverNow } from '../lib/serverClock';
import { trpc } from '../lib/trpc';
import { colors, spacing, typography } from '../theme';

import { DateField } from './DateField';
import { Field, Input } from './Field';
import { SubmitButton } from './SubmitButton';
import { TimeField } from './TimeField';

/**
 * Форма «Опоздание»: в какой день и к какому времени приду.
 *
 * Живёт на экране выходных под переключателем вида: владелец просил
 * «внутри запроса на выходные», и сотруднику не нужно искать второй экран.
 * Отправляет `lateRequests.create`; одобренный запрос сдвигает для этого
 * дня порог опоздания на «приду к» (сервер, `lateness.service`).
 *
 * «Сегодня» и «сейчас» — по часам мастерской (Ташкент) и по часам сервера,
 * а не по телефону: тем же правилом сервер отклонит запрос на прошедший
 * день или на уже прошедшее сегодня время, и подсказка формы должна
 * совпасть с его отказом, а не спорить с ним.
 */
export function LateRequestForm(): ReactElement {
  const { m } = useLocale();
  const utils = trpc.useUtils();

  const now = new Date(serverNow());
  const today = workshopDayIso(now);

  // Чаще всего опоздание просят на сегодня или завтра — день сразу стоит сегодняшний.
  const [date, setDate] = useState(today);
  const [arriveBy, setArriveBy] = useState('');
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const create = trpc.lateRequests.create.useMutation({
    async onSuccess() {
      // Руководитель тоже может попросить опоздание — его очередь «Отгулы»
      // читает `list`, и обновить надо оба списка.
      await Promise.all([utils.lateRequests.my.invalidate(), utils.lateRequests.list.invalidate()]);
      setDate(workshopDayIso(new Date(serverNow())));
      setArriveBy('');
      setReason('');
      setShowErrors(false);
    },
    onError(error) {
      Alert.alert(m('dayoff.sendError'), error.message);
    },
  });

  const errors = validate({ date, arriveBy }, { today, clock: workshopClockTime(now) }, m);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = (): void => {
    setShowErrors(true);
    if (hasErrors) return;

    create.mutate({
      date,
      arriveBy,
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
  };

  return (
    <View>
      <Text style={styles.intro}>{m('late.intro')}</Text>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Field label={m('late.date')} required error={showErrors ? errors.date : undefined}>
            <DateField
              value={date}
              onChange={setDate}
              placeholder={m('late.date')}
              emptyText={m('common.datePlaceholder')}
              invalid={showErrors && errors.date !== undefined}
              // Календарь не даёт выбрать вчера — по Ташкенту, а не по поясу телефона.
              minimumDate={localDate(today)}
              // День обязателен и уже стоит: крестик стёр бы его ради ошибки «Выберите дату».
              clearable={false}
            />
          </Field>
        </View>
        <View style={styles.rowItem}>
          <Field label={m('late.arriveBy')} required error={showErrors ? errors.arriveBy : undefined}>
            <TimeField
              value={arriveBy}
              onChange={setArriveBy}
              placeholder={m('late.arriveBy')}
              emptyText={m('late.timePlaceholder')}
              invalid={showErrors && errors.arriveBy !== undefined}
            />
          </Field>
        </View>
      </View>

      <Field label={m('dayoff.reason')} hint={m('dayoff.optional')}>
        <Input
          value={reason}
          onChangeText={setReason}
          placeholder={m('late.reasonPlaceholder')}
          maxLength={MAX_LATE_REQUEST_REASON_LENGTH}
          multiline
        />
      </Field>

      <SubmitButton label={m('dayoff.submit')} onPress={submit} pending={create.isPending} />
    </View>
  );
}

/**
 * `YYYY-MM-DD` → полночь этого дня по часам телефона.
 *
 * Календарь (`DateField`) сравнивает и отдаёт даты в поясе телефона; день,
 * собранный из частей, совпадает с ташкентским «сегодня» при любом поясе.
 */
function localDate(iso: string): Date {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Проверка формы — те же правила, что у сервера (`lateRequests.create`):
 * подсказать до отправки дешевле, чем показать отказ после запроса.
 */
function validate(
  values: { readonly date: string; readonly arriveBy: string },
  clock: { readonly today: string; readonly clock: string },
  m: Translate,
): Partial<Record<'date' | 'arriveBy', string>> {
  const errors: Partial<Record<'date' | 'arriveBy', string>> = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    errors.date = m('dayoff.dateFormat');
  } else if (values.date < clock.today) {
    // Экран мог простоять открытым с вечера: вчерашний день сервер не примет.
    errors.date = m('late.datePast');
  }

  if (!CLOCK_TIME_PATTERN.test(values.arriveBy)) {
    errors.arriveBy = m('late.timeRequired');
  } else if (values.date === clock.today && values.arriveBy <= clock.clock) {
    errors.arriveBy = m('late.timePast');
  }

  return errors;
}

const styles = StyleSheet.create({
  intro: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
});
