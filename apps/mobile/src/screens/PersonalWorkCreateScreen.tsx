import {
  MAX_PERSONAL_WORK_DETAILS_LENGTH,
  MAX_PERSONAL_WORK_TITLE_LENGTH,
} from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import { Card, CardTitle } from '../components/Card';
import { Field, Input } from '../components/Field';
import { trpc } from '../lib/trpc';
import { colors, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

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
  const navigation = useNavigation();
  const utils = trpc.useUtils();

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const create = trpc.personalWorks.create.useMutation({
    async onSuccess() {
      await utils.personalWorks.my.invalidate();
      navigation.goBack();
    },
    onError(error) {
      Alert.alert('Не удалось записать', error.message);
    },
  });

  const titleError = title.trim() === '' ? 'Напишите, что шьёте' : undefined;

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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <CardTitle title="Личная работа" icon="window" />

          <Text style={styles.hint}>
            Запишите, что делаете для себя на оборудовании цеха. Руководство
            видит занятость — это не запрет, а учёт: занятая машинка перестаёт
            выглядеть поломкой, а израсходованная ткань — недостачей.
          </Text>

          <Field label="Что шьёте" required error={showErrors ? titleError : undefined}>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="Например, «Шторы в спальню, себе»"
              maxLength={MAX_PERSONAL_WORK_TITLE_LENGTH}
              invalid={showErrors && titleError !== undefined}
            />
          </Field>

          <Field label="Подробности" hint="Необязательно: ткань, размеры, для кого">
            <Input
              value={details}
              onChangeText={setDetails}
              placeholder="Что важно помнить по этой работе"
              maxLength={MAX_PERSONAL_WORK_DETAILS_LENGTH}
              multiline
            />
          </Field>
        </Card>

        <Pressable
          onPress={submit}
          disabled={create.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [styles.submit, pressed ? styles.submitPressed : null]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>Записать</Text>
          )}
        </Pressable>
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
    paddingBottom: tabBarSpace,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  submit: {
    minHeight: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitPressed: {
    opacity: opacity.pressed,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});
