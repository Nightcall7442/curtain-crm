import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { formatInstallSlot, installSlotInputValue, parseInstallSlotInput } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { notifyError, notifySuccess } from '../../lib/haptics';
import { trpc } from '../../lib/trpc';
import { colors, hairline, radius, spacing, typography } from '../../theme';

import { BottomSheet } from '../BottomSheet';
import { Icon } from '../Icon';

/** «15.10 в 10:30» на языке приложения. */
export function useInstallSlotLabel(): (at: Date) => string {
  const { m } = useLocale();
  return (at) => {
    const slot = formatInstallSlot(at);
    return m('install.slot', { date: slot.date, time: slot.time });
  };
}

/*
  Время установки — по Ташкенту, а пикер телефона работает в его часовом
  поясе. Значения переносятся по частям даты: «15.10 10:30» на экране —
  это 15.10 10:30 в Ташкенте, даже если телефон настроен на другой пояс.
*/
const pad = (value: number): string => value.toString().padStart(2, '0');

function toPickerDate(at: Date): Date {
  const [day = '', time = ''] = installSlotInputValue(at).split('T');
  const [year = 1970, month = 1, date = 1] = day.split('-').map(Number);
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return new Date(year, month - 1, date, hours, minutes);
}

function fromPickerDate(local: Date): Date | null {
  return parseInstallSlotInput(
    `${local.getFullYear().toString()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
  );
}

/** Завтра в 10:00 — с чего начинать выбор, если времени ещё нет. */
function defaultDraft(): Date {
  const draft = new Date();
  draft.setDate(draft.getDate() + 1);
  draft.setHours(10, 0, 0, 0);
  return draft;
}

/**
 * Строка «Установка» под назначением установщика: текущее время или «не
 * назначено»; у диспетчера — выбор даты, затем времени, и «Убрать время».
 * Установщик получает уведомление с новым временем.
 */
export function InstallationTimeRow({
  orderId,
  installationAt,
  editable,
}: {
  readonly orderId: number;
  readonly installationAt: Date | null;
  /** Менять может тот, кто назначает исполнителей, и только до выезда. */
  readonly editable: boolean;
}): ReactElement {
  const { m } = useLocale();
  const label = useInstallSlotLabel();
  const utils = trpc.useUtils();
  /** Шаг выбора: дата, потом время. `null` — ничего не выбирают. */
  const [step, setStep] = useState<'date' | 'time' | null>(null);
  const [draft, setDraft] = useState<Date>(() => (installationAt === null ? defaultDraft() : toPickerDate(installationAt)));
  /** Значение поля в браузере: `YYYY-MM-DDTHH:mm` по Ташкенту. */
  const [webValue, setWebValue] = useState('');

  const schedule = trpc.orders.scheduleInstallation.useMutation({
    async onSuccess() {
      notifySuccess();
      setStep(null);
      await Promise.all([
        utils.orders.byId.invalidate({ id: orderId }),
        utils.orders.list.invalidate(),
        utils.monitor.board.invalidate(),
      ]);
    },
    onError(error) {
      notifyError();
      Alert.alert(m('install.saveError'), error.message);
    },
  });

  const open = (): void => {
    setDraft(installationAt === null ? defaultDraft() : toPickerDate(installationAt));
    setWebValue(installationAt === null ? '' : installSlotInputValue(installationAt));
    setStep('date');
  };

  const save = (local: Date): void => {
    const at = fromPickerDate(local);
    if (at !== null) schedule.mutate({ orderId, at });
  };

  // Android: два системных диалога подряд — дата, потом время.
  const onAndroidPick = (event: DateTimePickerEvent, picked?: Date): void => {
    if (event.type === 'dismissed' || picked === undefined) {
      setStep(null);
      return;
    }
    if (step === 'date') {
      const next = new Date(draft);
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setDraft(next);
      setStep('time');
      return;
    }
    const next = new Date(draft);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setStep(null);
    save(next);
  };

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.label}>{m('install.title')}</Text>
        <Text style={installationAt === null ? styles.empty : styles.value}>
          {installationAt === null ? m('install.notSet') : label(installationAt)}
        </Text>
      </View>
      {editable &&
        (schedule.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={m('install.pick')}
            hitSlop={8}
            style={({ pressed }) => [styles.change, pressed ? styles.pressed : null]}
          >
            <Icon name="calendar" size={16} color={colors.accentStrong} />
            <Text style={styles.changeText}>{installationAt === null ? m('install.set') : m('install.change')}</Text>
          </Pressable>
        ))}

      {Platform.OS === 'android' && step !== null && (
        <DateTimePicker
          value={draft}
          mode={step}
          is24Hour
          display={step === 'date' ? 'calendar' : 'clock'}
          minimumDate={new Date(Date.now() - 24 * 60 * 60 * 1000)}
          onChange={onAndroidPick}
        />
      )}

      {Platform.OS !== 'android' && (
        <BottomSheet
          visible={step !== null}
          title={m('install.pick')}
          onClose={() => {
            setStep(null);
          }}
        >
          {Platform.OS === 'web' ? (
            <View style={styles.webControl}>
              <input
                type="datetime-local"
                value={webValue}
                aria-label={m('install.pick')}
                onChange={(event) => {
                  setWebValue(event.target.value);
                }}
                style={webInput}
              />
            </View>
          ) : (
            <>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                themeVariant="light"
                accentColor={colors.accent}
                minimumDate={new Date(Date.now() - 24 * 60 * 60 * 1000)}
                onChange={(_event, picked) => {
                  if (picked !== undefined) setDraft(picked);
                }}
              />
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                themeVariant="light"
                is24Hour
                onChange={(_event, picked) => {
                  if (picked !== undefined) setDraft(picked);
                }}
              />
            </>
          )}
          <Pressable
            onPress={() => {
              if (Platform.OS === 'web') {
                const at = parseInstallSlotInput(webValue);
                if (at !== null) schedule.mutate({ orderId, at });
                return;
              }
              save(draft);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.done, pressed ? styles.pressed : null]}
          >
            <Text style={styles.doneText}>{m('install.save')}</Text>
          </Pressable>
          {installationAt !== null && (
            <Pressable
              onPress={() => {
                schedule.mutate({ orderId, at: null });
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clear, pressed ? styles.pressed : null]}
            >
              <Text style={styles.clearText}>{m('install.clear')}</Text>
            </Pressable>
          )}
        </BottomSheet>
      )}
    </View>
  );
}

const webInput = {
  flex: 1,
  minWidth: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: colors.textPrimary,
  fontFamily: typography.body.fontFamily,
  fontSize: typography.body.fontSize,
} as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  changeText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.accentStrong,
  },
  pressed: {
    opacity: 0.7,
  },
  webControl: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  done: {
    marginTop: spacing.md,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  doneText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  clear: {
    marginTop: spacing.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    ...typography.body,
    color: colors.danger,
  },
});
