import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { formatIsoDate } from '@curtain-crm/shared';
import { useRef, useState, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

/**
 * Дата — системным календарём, а не строкой «2026-09-15» с клавиатуры.
 *
 * Набирать дату цифрами с дефисами стоя у клиента — верный способ получить
 * «2026-9-15» и отказ формы. Календарь у телефона уже есть; он и открывается.
 * Значение наружу уходит той же строкой `YYYY-MM-DD`, что и раньше, поэтому
 * проверки и отправка в вызывающих экранах не меняются.
 *
 * iOS показывает календарь в шторке снизу (сам по себе он вклинился бы в
 * форму), Android — своим диалогом, которому шторка не нужна.
 */
export function DateField({
  value,
  onChange,
  placeholder,
  invalid = false,
  minimumDate,
}: {
  /** `YYYY-MM-DD` или пустая строка. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly invalid?: boolean;
  readonly minimumDate?: Date;
}): ReactElement {
  const { m, locale } = useLocale();
  const [open, setOpen] = useState(false);

  const selected = value === '' ? new Date() : new Date(`${value}T00:00:00`);

  const apply = (event: DateTimePickerEvent, date?: Date): void => {
    // Android закрывает диалог сам и на «Отмена» присылает `dismissed`.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || date === undefined) return;
    onChange(toIso(date));
  };

  /*
    В браузере (приложение на pardabozor.uz/app) календаря от
    `@react-native-community/datetimepicker` не существует вовсе: у пакета
    нет веб-реализации, и шторка открывалась пустой.

    Календарь берётся у браузера (на телефоне это тот же системный), но
    само поле рисуется тем же, что в приложении, — подпись, дата
    `ДД.ММ.ГГГГ` и значок. Голый `<input type="date">` показывал дату по
    правилам браузера: «10/05/2026» вместо 05.10.2026 (читается как 10 мая),
    «mm/dd/yyyy» вместо подсказки и чёрный значок браузера рядом с нашим.
    Теперь поле браузера невидимо и только открывает свой календарь.
  */
  const webInput = useRef<HTMLInputElement | null>(null);

  const openPicker = (): void => {
    if (Platform.OS !== 'web') {
      setOpen(true);
      return;
    }
    const input = webInput.current;
    if (input === null) return;
    // `showPicker` есть во всех живых браузерах; старым хватает фокуса и клика.
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        // Браузер не признал нажатие жестом пользователя — пробуем по-старому.
      }
    }
    input.focus();
    input.click();
  };

  return (
    <>
      <View style={[styles.control, invalid ? styles.invalid : null]}>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={value === '' ? placeholder : `${placeholder}: ${formatIsoDate(value)}`}
          style={({ pressed }) => [styles.field, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.value, value === '' ? styles.placeholder : null]} numberOfLines={1}>
            {value === '' ? placeholder : formatIsoDate(value)}
          </Text>
          {/*
            Значок календаря — пока даты нет; с датой на его месте «очистить».
            Оба сразу не помещались в половинное поле («С» / «По»): дата
            обрезалась до «20.11.202».
          */}
          {value === '' && <Icon name="calendar" size={18} color={colors.textMuted} />}
        </Pressable>

        {value !== '' && (
          <Pressable
            onPress={() => {
              onChange('');
            }}
            accessibilityRole="button"
            accessibilityLabel={m('common.clear')}
            style={({ pressed }) => [styles.clear, pressed ? styles.pressed : null]}
          >
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}

        {Platform.OS === 'web' && (
          <input
            ref={webInput}
            type="date"
            value={value}
            tabIndex={-1}
            aria-hidden
            {...(minimumDate === undefined ? {} : { min: toIso(minimumDate) })}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            style={webPickerAnchor}
          />
        )}
      </View>

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={selected}
          mode="date"
          display="calendar"
          onChange={apply}
          {...(minimumDate === undefined ? {} : { minimumDate })}
        />
      )}

      {Platform.OS === 'ios' && (
        <BottomSheet
          visible={open}
          title={placeholder}
          onClose={() => {
            setOpen(false);
          }}
        >
          <DateTimePicker
            value={selected}
            mode="date"
            display="inline"
            locale={locale === 'uz' ? 'uz' : 'ru'}
            // Шторка всегда светлая, а календарь брал цвет текста у системной
            // темы: на тёмной системе цифры выходили белым по белому.
            themeVariant="light"
            accentColor={colors.accent}
            onChange={apply}
            {...(minimumDate === undefined ? {} : { minimumDate })}
          />
          <Pressable
            onPress={() => {
              if (value === '') onChange(toIso(selected));
              setOpen(false);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.done, pressed ? styles.pressed : null]}
          >
            <Text style={styles.doneText}>{m('common.confirm')}</Text>
          </Pressable>
        </BottomSheet>
      )}
    </>
  );
}

/**
 * Невидимое поле браузера под нашим — только якорь для его календаря.
 *
 * Во всю ширину поля, чтобы всплывающий календарь на компьютере вставал
 * под ним, а не в углу; нажатия до него не доходят — их ловит `Pressable`.
 */
const webPickerAnchor = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  border: 'none',
  opacity: 0,
  pointerEvents: 'none',
} as const;

/** Календарная дата по местному времени — без сдвига через UTC. */
function toIso(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear().toString()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  invalid: {
    borderColor: colors.danger,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  field: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
  clear: {
    // Полная цель для пальца; влево заходит на отступ поля, чтобы крестик
    // стоял от рамки там же, где стоял значок календаря.
    width: 44,
    marginLeft: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: {
    marginTop: spacing.sm,
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
});
