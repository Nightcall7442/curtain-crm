import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifySuccess } from '../lib/haptics';
import { colors, fonts, opacity, radius, spacing, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

/**
 * Сканер кода с этикетки рулона.
 *
 * Код продавец переписывал с наклейки руками — с той самой, где он напечатан
 * зеркально сквозь плёнку и где рядом стоят вес, диаметр и артикул. Ошибка в
 * одном символе означает, что справочник не найдёт ткань, а цех возьмёт не
 * тот рулон.
 *
 * Что закодировано в наклейке поставщика, приложение не решает: в поле кода
 * попадает ровно та строка, которую отдал сканер. Если у поставщика это
 * артикул — совпадёт со справочником сразу; если внутренний номер — в
 * справочнике заводится он же, и код будет тот, который читает камера, а не
 * тот, который человек разобрал глазами.
 *
 * Кроме QR читаются линейные штрихкоды: на части рулонов наклеены они.
 */
export function CodeScanner({
  visible,
  label,
  hint,
  onScan,
  onClose,
}: {
  readonly visible: boolean;
  /** Что сканируем — «Портьера», «Труба»: подпись в шапке. */
  readonly label: string;
  /**
   * Куда наводить камеру. По умолчанию — этикетка рулона; касса сканирует
   * бирки товара, и ей нужна своя подсказка.
   */
  readonly hint?: string;
  readonly onScan: (code: string) => void;
  readonly onClose: () => void;
}): ReactElement | null {
  const { m } = useLocale();
  const [permission, requestPermission] = useCameraPermissions();
  /*
    Камеры нет или она занята — разрешение есть, а кадра не будет. Без этого
    флага модальное окно оставалось чёрным экраном с рамкой навсегда: сбой
    видела только консоль браузера.
  */
  const [cameraFailed, setCameraFailed] = useState(false);
  /*
    Просили разрешение — и получили отказ. Браузер на повторный запрос не
    отвечает (а `canAskAgain` в веб-версии всегда `true`), поэтому кнопка
    «Разрешить камеру» после отказа ничего не делала. Дальше — только
    настройки, о чём экран и говорит.
  */
  const [refused, setRefused] = useState(false);

  /*
    Камера отдаёт кадры десятками в секунду, и один и тот же код прилетает
    подряд много раз. Флаг в ref, а не в состоянии: между кадрами перерисовки
    может не случиться, и второй кадр успел бы пройти по старому значению.
  */
  const handled = useRef(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    setCameraFailed(false);
    setRefused(false);
    setError(null);
  }, [visible]);

  if (!visible) return null;

  const granted = permission?.granted === true;
  /** Кадр будет: разрешение есть, и камера запустилась. */
  const live = granted && !cameraFailed;
  const blocked = cameraFailed || refused || permission?.canAskAgain === false;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {live ? (
          <CameraView
            style={styles.camera}
            facing="back"
            onMountError={() => {
              setCameraFailed(true);
            }}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'datamatrix', 'ean13', 'ean8', 'code128', 'code39', 'itf14'],
            }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return;
              const code = data.trim();
              if (code === '') {
                setError(m('scanner.empty'));
                return;
              }
              handled.current = true;
              notifySuccess();
              onScan(code);
              onClose();
            }}
          />
        ) : blocked ? (
          <View style={styles.permission}>
            <Text style={styles.permissionTitle}>{m('photo.noAccess')}</Text>
            <Text style={styles.permissionText}>{m('photo.allowCamera')}</Text>
          </View>
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {permission === null ? m('scanner.checking') : m('scanner.allowHint')}
            </Text>
            {permission !== null && !permission.granted && (
              <Pressable
                onPress={() => {
                  void requestPermission().then((answer) => {
                    if (!answer.granted) setRefused(true);
                  });
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.allow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.allowText}>{m('scanner.allow')}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/*
          Заголовок и подсказка — одним блоком в потоке, а не подсказка
          абсолютом поверх: на «top: 48» она наезжала на строку заголовка
          в 22 точки на шесть точек. «Наведите камеру» — только когда
          камера есть; без неё подсказка обещала то, чего не будет.
        */}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.head}>
            <Text style={styles.title}>{label}</Text>
            {(error !== null || live) && (
              <Text style={styles.hint}>{error ?? hint ?? m('scanner.aim')}</Text>
            )}
          </View>

          {live && <View style={styles.frame} />}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
          >
            <Text style={styles.closeText}>{m('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/*
  Кнопки — как во всём приложении: 48 и таблеткой (`SubmitButton`), подпись
  15/700. Были 44 и 48 со скруглением 14.
*/
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  head: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
  },
  /* Своя высота строки: без неё строка 22-го кегля короче глифов, и то,
     что стоит ниже, заезжает на заголовок. */
  title: {
    ...typography.title,
    lineHeight: 28,
    color: '#fff',
    textAlign: 'center',
  },
  /* 13, а не сноска, и без прозрачности: подсказку читают на чёрном фоне
     с вытянутой руки. */
  hint: {
    ...typography.caption,
    color: '#fff',
    textAlign: 'center',
  },
  /* Рамка не обрезает кадр — она подсказывает, куда целиться. */
  frame: {
    width: 240,
    height: 240,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: '#fff',
    opacity: 0.7,
  },
  close: {
    minHeight: 48,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  permission: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  permissionTitle: {
    ...typography.sectionTitle,
    color: '#fff',
    textAlign: 'center',
  },
  permissionText: {
    ...typography.body,
    color: '#fff',
    textAlign: 'center',
  },
  allow: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
