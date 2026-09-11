import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifySuccess } from '../lib/haptics';
import { colors, opacity, radius, spacing, typography } from '../theme';
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
  onScan,
  onClose,
}: {
  readonly visible: boolean;
  /** Что сканируем — «Портьера», «Труба»: подпись в шапке. */
  readonly label: string;
  readonly onScan: (code: string) => void;
  readonly onClose: () => void;
}): ReactElement | null {
  const { m } = useLocale();
  const [permission, requestPermission] = useCameraPermissions();

  /*
    Камера отдаёт кадры десятками в секунду, и один и тот же код прилетает
    подряд много раз. Флаг в ref, а не в состоянии: между кадрами перерисовки
    может не случиться, и второй кадр успел бы пройти по старому значению.
  */
  const handled = useRef(false);

  useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  const granted = permission?.granted === true;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
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
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {permission === null
                ? m('scanner.checking')
                : m('scanner.allowHint')}
            </Text>
            {permission !== null && !permission.granted && (
              <Pressable
                onPress={() => {
                  void requestPermission();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.allow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.allowText}>{m('scanner.allow')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.hint}>
            {error ?? m('scanner.aim')}
          </Text>

          {granted && <View style={styles.frame} />}

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
  title: {
    ...typography.title,
    color: '#fff',
    textAlign: 'center',
  },
  hint: {
    ...typography.footnote,
    color: '#fff',
    opacity: 0.85,
    textAlign: 'center',
    position: 'absolute',
    top: spacing.xl * 2,
    left: spacing.lg,
    right: spacing.lg,
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
    height: 48,
    alignSelf: 'stretch',
    borderRadius: radius.md,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
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
  permissionText: {
    ...typography.body,
    color: '#fff',
    textAlign: 'center',
  },
  allow: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: {
    ...typography.body,
    color: colors.onAccent,
    fontWeight: '600',
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
