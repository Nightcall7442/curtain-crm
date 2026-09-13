import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { formatIsoDate } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { colors, hairline, radius, spacing, typography } from '../theme';

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

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
        style={({ pressed }) => [
          styles.control,
          invalid ? styles.invalid : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.value, value === '' ? styles.placeholder : null]}>
          {value === '' ? placeholder : formatIsoDate(value)}
        </Text>
        <View style={styles.actions}>
          {value !== '' && (
            <Pressable
              onPress={() => {
                onChange('');
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={m('common.close')}
            >
              <Icon name="remove" size={16} color={colors.textMuted} />
            </Pressable>
          )}
          <Icon name="calendar" size={18} color={colors.textMuted} />
        </View>
      </Pressable>

      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={selected}
          mode="date"
          display="calendar"
          onChange={apply}
          {...(minimumDate === undefined ? {} : { minimumDate })}
        />
      )}

      {Platform.OS !== 'android' && (
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

/** Календарная дата по местному времени — без сдвига через UTC. */
function toIso(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${date.getFullYear().toString()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  invalid: {
    borderColor: colors.danger,
  },
  pressed: {
    opacity: 0.7,
  },
  value: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  placeholder: {
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
