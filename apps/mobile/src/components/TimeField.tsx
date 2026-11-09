import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { isClockTime } from '@curtain-crm/shared';
import { useRef, useState, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

import { BottomSheet } from './BottomSheet';
import { openWebPicker, webPickerAnchor } from './DateField';
import { Icon } from './Icon';
import { SubmitButton } from './SubmitButton';

/**
 * С какого времени открываются часы, пока время не выбрано.
 *
 * Смена в цеху начинается в девять, и «приду к» почти всегда — утро после
 * неё. Часы, открытые на текущем времени, вечером начинались бы с 21:40,
 * и до утра пришлось бы крутить полкруга.
 */
const PICKER_START = '10:00';

/**
 * Время дня `ЧЧ:ММ` — системными часами, а не набором цифр.
 *
 * Тот же приём, что у времени установки (`InstallationTimeRow`), и тот же
 * вид, что у поля даты (`DateField`), рядом с которым оно стоит в форме:
 *  - Android — системный диалог часов, 24 часа;
 *  - iOS — барабан в шторке с «Подтвердить»;
 *  - браузер (PWA) — часы браузера у невидимого `<input type="time">`, а
 *    значение показывает наш текст: голое поле браузера рисовало «10:30 AM»
 *    по правилам своей локали и своего значка.
 *
 * Время — «настенное», без даты и пояса: «приду к 10:30» значит 10:30 по
 * часам мастерской, где бы ни был настроен телефон. Поэтому значение
 * переносится только часами и минутами, без `Date` с поясом устройства.
 */
export function TimeField({
  value,
  onChange,
  placeholder,
  emptyText,
  invalid = false,
}: {
  /** `ЧЧ:ММ` или пустая строка. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Имя поля: заголовок шторки и подпись для чтеца. */
  readonly placeholder: string;
  /** Текст пустого поля, если имя уже стоит подписью над ним. */
  readonly emptyText?: string;
  readonly invalid?: boolean;
}): ReactElement {
  const { m, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const webInput = useRef<HTMLInputElement | null>(null);

  const selected = toPickerDate(isClockTime(value) ? value : PICKER_START);

  const apply = (event: DateTimePickerEvent, date?: Date): void => {
    // Android закрывает диалог сам и на «Отмена» присылает `dismissed`.
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'dismissed' || date === undefined) return;
    onChange(toClock(date));
  };

  const openPicker = (): void => {
    if (Platform.OS !== 'web') {
      setOpen(true);
      return;
    }
    openWebPicker(webInput.current);
  };

  return (
    <>
      <View style={styles.control}>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={value === '' ? placeholder : `${placeholder}: ${value}`}
          style={({ pressed }) => [styles.field, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.value, value === '' ? styles.placeholder : null]} numberOfLines={1}>
            {value === '' ? (emptyText ?? placeholder) : value}
          </Text>
          <Icon name="shift" size={18} color={colors.textMuted} />
        </Pressable>

        {Platform.OS === 'web' && (
          <input
            ref={webInput}
            type="time"
            value={value}
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              // Пустое значение — «очистить» в часах браузера: время в этой
              // форме обязательно, стирать его поле не должно. Секунды, если
              // браузер их добавит, отрезаются: сервер ждёт ровно `ЧЧ:ММ`.
              const next = event.target.value.slice(0, 5);
              if (isClockTime(next)) onChange(next);
            }}
            style={webPickerAnchor}
          />
        )}

        {/* Рамка — слоем поверх, как у `DateField`: высота поля не съедается. */}
        <View style={[styles.frame, invalid ? styles.invalid : null]} />
      </View>

      {open && Platform.OS === 'android' && (
        <DateTimePicker value={selected} mode="time" display="clock" is24Hour onChange={apply} />
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
            mode="time"
            display="spinner"
            // `is24Hour` iOS не читает — 24 часа он берёт из локали, а у
            // русской и узбекской они и так 24-часовые.
            locale={locale === 'uz' ? 'uz' : 'ru'}
            // Шторка всегда светлая — цифры не должны брать белый цвет тёмной темы.
            themeVariant="light"
            onChange={apply}
          />
          <SubmitButton
            label={m('common.confirm')}
            onPress={() => {
              // Барабан, который не крутили, ничего не присылает: «Подтвердить»
              // принимает то, что видно на нём.
              if (value === '') onChange(toClock(selected));
              setOpen(false);
            }}
          />
        </BottomSheet>
      )}
    </>
  );
}

const pad = (part: number): string => part.toString().padStart(2, '0');

/** `ЧЧ:ММ` → момент сегодняшнего дня с этими часами — только как значение пикера. */
function toPickerDate(clock: string): Date {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** Часы и минуты пикера — строкой `ЧЧ:ММ`, без пояса и даты. */
function toClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: sizes.controlHeight,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  frame: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    pointerEvents: 'none',
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
    paddingHorizontal: spacing.md + hairline,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    // Табличные цифры: «10:30» и «11:11» одной ширины.
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    color: colors.textMuted,
  },
});
