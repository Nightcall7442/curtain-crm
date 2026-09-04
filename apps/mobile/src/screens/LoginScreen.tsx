import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { colors, radius, spacing, typography, opacity } from '../theme';

/**
 * Вход в приложение.
 *
 * Логин — рабочий номер телефона в любом виде: сервер приводит его к
 * единому формату, поэтому `+998 90 123 45 67` и `901234567` — одна и та же
 * учётная запись.
 *
 * Сообщение об ошибке приходит с сервера и одинаково для неверного пароля
 * и несуществующего номера: по разнице ответов иначе можно было бы
 * перебрать список сотрудников.
 */
export function LoginScreen(): ReactElement {
  const { signIn, signInError, isSigningIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !isSigningIn;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    // Ошибку показывает `signInError` из состояния мутации — здесь
    // достаточно не дать необработанному промису уронить приложение.
    signIn(phone.trim(), password).catch(() => undefined);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          {/*
            Настоящий логотип, а не монограмма «PB», которая стояла здесь
            заглушкой. Файл белый на прозрачном фоне — зелёную подложку даёт
            сам экран, поэтому одна и та же картинка годится и сюда, и на
            любой другой хвойный фон.

            «PARDA BOZOR» остаётся отдельной строкой ниже: в самом файле
            только «DESIGN HOUSE», а вместе они и составляют полный знак.
          */}
          <Image
            /*
              `require`, а не `import`: так Metro отдаёт файл из бандла, и
              другого способа сослаться на картинку в React Native нет.
              Правила ниже про обычный код, здесь они не по адресу.
            */
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Design House Parda Bozor"
          />
          <Text style={styles.brandName}>PARDA BOZOR</Text>
          <Text style={styles.brandTagline}>шторы премиум класса</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Вход для сотрудников</Text>

          <Text style={styles.label}>Номер телефона</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+998 90 123 45 67"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={styles.input}
            editable={!isSigningIn}
          />

          <Text style={[styles.label, styles.labelSpacing]}>Пароль</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            style={styles.input}
            editable={!isSigningIn}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
          />

          {signInError !== null && (
            <View style={styles.error} accessibilityRole="alert">
              <Text style={styles.errorText}>{signInError}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              !canSubmit ? styles.buttonDisabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
            accessibilityRole="button"
          >
            {isSigningIn ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.buttonText}>Войти</Text>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Забыли пароль? Сбросить его может только директор.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.header,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    /*
      Высота числом, а не через `aspectRatio`: тот работает не везде.
      Экран открывается и в браузере (Metro собирает и веб-сборку), а там
      рамка взяла родную высоту файла — 399 вместо 133, и знак повис
      посреди пустого поля, оторвавшись от названия под ним.

      133 — это 208 в пропорции файла 626×399. При `contain` знак и так не
      исказится, но рамка должна совпадать с ним, иначе отступы поедут.
    */
    width: 208,
    height: 133,
  },
  brandName: {
    color: colors.headerText,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 3,
    marginTop: spacing.md,
  },
  brandTagline: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11.5,
    marginTop: 2,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  formTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  labelSpacing: {
    marginTop: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  error: {
    marginTop: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: opacity.disabled,
  },
  buttonPressed: {
    opacity: opacity.pressed,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
