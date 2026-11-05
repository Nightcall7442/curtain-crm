import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  formatInstallSlot,
  formatIsoDate,
  installSlotInputValue,
  parseInstallSlotInput,
} from '@curtain-crm/shared';
import { useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { notifyError, notifySuccess } from '../../lib/haptics';
import { trpc } from '../../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../../theme';

import { BottomSheet } from '../BottomSheet';
import { openWebPicker, webPickerAnchor } from '../DateField';
import { Icon, type IconName } from '../Icon';
import { SubmitButton } from '../SubmitButton';

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

/** Части даты пикера — строкой `YYYY-MM-DDTHH:mm`, как пишет поле браузера. */
function toInputValue(local: Date): string {
  return `${local.getFullYear().toString()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function fromPickerDate(local: Date): Date | null {
  return parseInstallSlotInput(toInputValue(local));
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
    // В браузере — тот же черновик, что у телефона: «завтра в 10:00», а не
    // пустое поле, на котором «Сохранить» молча ничего не делал.
    setWebValue(installationAt === null ? toInputValue(defaultDraft()) : installSlotInputValue(installationAt));
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
          {/*
            В браузере — два наших поля, дата и время, а не голый
            `datetime-local`: тот рисовал «10/26/2026, 05:14 AM» — американский
            порядок и 12-часовое время — под строкой «26.10 в 05:14», высотой
            23 точки и с чужим значком. Календарь и часы по-прежнему берутся
            у браузера (на телефоне это системные), но открывает их наше поле
            той же высоты и того же вида, что и остальные поля приложения.
          */}
          {Platform.OS === 'web' ? (
            <View style={styles.webRow}>
              <WebPickerField
                type="date"
                value={webValue.slice(0, 10)}
                shown={formatIsoDate(webValue.slice(0, 10))}
                icon="calendar"
                label={m('install.pick')}
                onChange={(date) => {
                  setWebValue(`${date}T${webValue.slice(11, 16)}`);
                }}
              />
              <WebPickerField
                type="time"
                value={webValue.slice(11, 16)}
                shown={webValue.slice(11, 16)}
                icon="shift"
                label={m('install.pick')}
                onChange={(time) => {
                  setWebValue(`${webValue.slice(0, 10)}T${time}`);
                }}
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
          <SubmitButton
            label={m('install.save')}
            pending={schedule.isPending}
            onPress={() => {
              if (Platform.OS === 'web') {
                const at = parseInstallSlotInput(webValue);
                if (at !== null) schedule.mutate({ orderId, at });
                return;
              }
              save(draft);
            }}
          />
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

/**
 * Поле даты или времени для браузера: наш вид, системный выбор.
 *
 * Поле браузера под ним невидимо и служит только якорем: `showPicker()`
 * открывает его календарь или часы, а показывает значение наш текст —
 * «26.10.2026» и «05:14», в 24 часа, как в строке над шторкой.
 *
 * Открытие и якорь — общие с `DateField`: своя копия того же кода уже
 * однажды разошлась с ним.
 */
function WebPickerField({
  type,
  value,
  shown,
  icon,
  label,
  onChange,
}: {
  readonly type: 'date' | 'time';
  readonly value: string;
  readonly shown: string;
  readonly icon: IconName;
  readonly label: string;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const input = useRef<HTMLInputElement | null>(null);

  return (
    <View style={styles.webField}>
      <Pressable
        onPress={() => {
          openWebPicker(input.current);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        style={({ pressed }) => [styles.webFieldPress, pressed ? styles.pressed : null]}
      >
        <Text style={styles.webFieldText} numberOfLines={1}>
          {shown}
        </Text>
        <Icon name={icon} size={18} color={colors.textMuted} />
      </Pressable>
      <input
        ref={input}
        type={type}
        value={value}
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          // Пустое значение — «очистить» в календаре браузера: время у установки
          // убирает отдельная кнопка, поле его не стирает.
          if (event.target.value !== '') onChange(event.target.value);
        }}
        style={webPickerAnchor}
      />
    </View>
  );
}

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
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  empty: {
    ...typography.body,
    color: colors.textMuted,
  },
  // Полная цель для пальца: `hitSlop` браузер не знает.
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  changeText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accentStrong,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  webRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /* Мерка `DateField`: высота поля, волосяная рамка, скругление `md`. */
  webField: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.controlHeight,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  webFieldPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  webFieldText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    // Табличные цифры: «05:14» и «26.10.2026» не дрожат при смене значения.
    fontVariant: ['tabular-nums'],
  },
  clear: {
    marginTop: spacing.sm,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    ...typography.body,
    color: colors.danger,
  },
});
