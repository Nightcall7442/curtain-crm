import {
  MAX_PERSONAL_WORK_DETAILS_LENGTH,
  MAX_PERSONAL_WORK_TITLE_LENGTH,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Field, Input } from '../components/Field';
import { ShiftRequiredBanner, useNeedsShift } from '../components/ShiftRequiredBanner';
import { SubmitButton } from '../components/SubmitButton';
import { trpc } from '../lib/trpc';
import { colors, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

/**
 * Запись личной работы — того, что сотрудник шьёт себе или знакомым в цеху.
 *
 * Форма короткая намеренно: чем длиннее, тем вероятнее, что человек просто
 * сядет за машинку молча. Нужны две вещи — что шьётся и, по желанию,
 * подробности; всё остальное (кто, когда) система знает сама.
 *
 * Исполнитель не спрашивается: им становится тот, кто заполняет форму.
 * Записать личную работу на другого нельзя — иначе цех можно было бы
 * занять от чужого имени.
 */
export function PersonalWorkCreateScreen(): ReactElement {
  const { m } = useLocale();
  const needsShift = useNeedsShift();
  const navigation = useNavigation();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const create = trpc.personalWorks.create.useMutation({
    async onSuccess() {
      await utils.personalWorks.my.invalidate();
      navigation.goBack();
    },
    onError(error) {
      Alert.alert(m('pw.error'), error.message);
    },
  });

  const titleError = title.trim() === '' ? m('pw.titleRequired') : undefined;

  const submit = (): void => {
    setShowErrors(true);
    if (titleError !== undefined) return;

    create.mutate({
      title: title.trim(),
      ...(details.trim() === '' ? {} : { details: details.trim() }),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Снизу — безопасная зона и обычный отступ: это экран стека, панели
          вкладок под ним нет, и место под неё оставляло пустую полосу. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          Без заголовка карточки: «Личная работа» уже стоит в шапке экрана,
          и карточка повторяла его слово в слово строкой ниже. Форма
          начинается с пояснения, а кнопка — внутри карточки, как в
          запросе на выходные и в поручениях: форма и её итог — одно целое.
        */}
        <ShiftRequiredBanner />
        <Card>
          <Text style={styles.hint}>{m('pw.hint')}</Text>

          <Field label={m('pw.what')} required error={showErrors ? titleError : undefined}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder={m('pw.whatPlaceholder')}
              maxLength={MAX_PERSONAL_WORK_TITLE_LENGTH}
              invalid={showErrors && titleError !== undefined}
            />
          </Field>

          <Field label={m('pw.details')} hint={m('pw.detailsHint')}>
            <Input
              value={details}
              onChangeText={setDetails}
              placeholder={m('pw.detailsPlaceholder')}
              maxLength={MAX_PERSONAL_WORK_DETAILS_LENGTH}
              multiline
            />
          </Field>

          <SubmitButton
            label={m('pw.submit')}
            onPress={submit}
            // Личная работа — тоже работа: без смены сервер её не запишет (412).
            disabled={needsShift}
            pending={create.isPending}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  // До первого поля — тот же шаг, что между полями.
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});
