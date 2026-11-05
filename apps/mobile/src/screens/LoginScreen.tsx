import { useState, type ReactElement } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Input } from '../components/Field';
import { SubmitButton } from '../components/SubmitButton';
import { useAuth } from '../hooks/useAuth';
import { colors, radius, spacing, typography, fonts } from '../theme';
import { useLocale } from '../hooks/useLocale';

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
  const { m } = useLocale();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const filled = phone.trim().length > 0 && password.length > 0;
  const canSubmit = filled && !isSigningIn;

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
          <Text style={styles.brandTagline}>{m('login.tagline')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>{m('login.title')}</Text>

          {/*
            Поля — общий `Input`, а не свой `TextInput`. Свой не показывал
            фокус вовсе: кольцо браузера снято для всего приложения, а рамку
            акцента рисует только `Input`, — и в PWA было не видно, в какое
            поле идёт ввод. Заодно поле той же высоты, что во всех формах
            (`controlHeight`), и растёт с системным размером шрифта, а не
            обрезает текст в жёстких 48. Подложка — лён: на белой форме
            белое поле теряется.
          */}
          <Text style={styles.label}>{m('login.phone')}</Text>
          <Input
            value={phone}
            onChangeText={setPhone}
            placeholder="+998 90 123 45 67"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            style={styles.input}
            editable={!isSigningIn}
          />

          <Text style={[styles.label, styles.labelSpacing]}>{m('login.password')}</Text>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
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

          {/*
            Кнопка — та же `SubmitButton`, что во всём приложении: высота 48,
            таблетка, жирная подпись и одно «недоступно». Первый экран, который
            видит каждый, был собран из своей кнопки другой формы.
          */}
          <View style={styles.submit}>
            <SubmitButton
              label={m('login.submit')}
              onPress={handleSubmit}
              disabled={!filled}
              pending={isSigningIn}
            />
          </View>

          <Text style={styles.hint}>{m('login.hint')}</Text>
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

      98 — это 154 в пропорции файла 626×399. При `contain` знак и так не
      исказится, но рамка должна совпадать с ним, иначе отступы поедут.

      Ширина 154, а не 208, с которых начинали: в знаке уже есть крупная
      плашечная надпись, и рядом с тонким «PARDA BOZOR» она перевешивала
      весь экран. Теперь верх читается как одна подпись, а не как две
      спорящие.
    */
    width: 154,
    height: 98,
  },
  brandName: {
    fontFamily: fonts.semibold,
    color: colors.headerText,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 4,
    // Вплотную к знаку: название — его вторая строка, а не отдельная
    // надпись под ним. Воздух отложен вниз, перед подзаголовком.
    marginTop: spacing.sm,
  },
  // 12 — нижняя ступень шкалы (`footnote`): 11,5 на тёмном фоне при 55%
  // белого читалось уже с трудом.
  brandTagline: {
    fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.55)',
    fontSize: typography.footnote.fontSize,
    marginTop: spacing.xs,
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
  /*
    Только подложка: высоту (`controlHeight` как минимум, не жёстко),
    шрифт, рамку и её цвет в фокусе задаёт `Input`. Рамку здесь не
    переопределяем — иначе пропал бы цвет фокуса.
  */
  input: {
    backgroundColor: colors.background,
  },
  error: {
    marginTop: spacing.lg,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  // 24 до кнопки, как было: 16 здесь и 8 — собственный отступ `SubmitButton`.
  submit: {
    marginTop: spacing.lg,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
