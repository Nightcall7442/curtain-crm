import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Card, CardTitle } from './Card';
import { Field, Input } from './Field';
import { Icon } from './Icon';

/**
 * Терминальные чеки — задание продавцов на день.
 *
 * Три чека на терминале за день на всех продавцов, каждый с фото. Карточка
 * живёт в «Работе»: это такая же обязанность, как заказ, а не касса —
 * владелец отдельно сказал, что к наличным и инкассации чек не привязан.
 *
 * Счётчик общий: пробил один — у всех «2 из 3». Кто и когда — списком, чтобы
 * не пробить лишний и не спорить, чей был второй.
 */
export function TerminalCheckCard(): ReactElement {
  const { m } = useLocale();
  const utils = trpc.useUtils();
  const today = trpc.terminalChecks.today.useQuery();

  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);

  const pickPhoto = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(m('photo.noAccess'), fromCamera ? m('photo.allowCamera') : m('photo.allowGallery'));
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      exif: false,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
      return;
    }
    setPhoto({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const create = trpc.terminalChecks.create.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setPhoto(null);
      setComment('');
      await utils.terminalChecks.today.invalidate();
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const data = today.data;
  const done = data !== undefined && data.remaining === 0;

  return (
    <Card>
      <CardTitle title={m('terminal.title')} icon="paid" />
      {data === undefined ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <>
          <View style={styles.progressRow}>
            <Text style={[styles.count, done ? styles.countDone : null]}>
              {m('terminal.progress', { n: data.count, target: data.target })}
            </Text>
            <Text style={styles.remaining}>
              {done ? m('terminal.done') : m('terminal.remaining', { n: data.remaining })}
            </Text>
          </View>
          <View style={styles.dots}>
            {Array.from({ length: data.target }, (_, index) => (
              <View key={index} style={[styles.dot, index < data.count ? styles.dotFilled : null]} />
            ))}
          </View>

          {data.rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={styles.rowName}>{row.fullName}</Text>
              <Text style={styles.rowTime}>
                {new Date(row.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}

          <Pressable
            onPress={() => {
              setOpen(true);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
          >
            <Icon name="camera" size={18} color={colors.accent} />
            <Text style={styles.buttonText}>{m('terminal.create')}</Text>
          </Pressable>
        </>
      )}

      <BottomSheet
        visible={open}
        title={m('terminal.create')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field label={m('terminal.photo')} required hint={m('terminal.photoHint')}>
          <View style={styles.photoRow}>
            {photo === null ? (
              <Text style={styles.photoHint}>{m('terminal.noPhoto')}</Text>
            ) : (
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            )}
            <Pressable
              onPress={() => {
                void pickPhoto(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.camera')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="camera" size={18} color={colors.accentStrong} />
            </Pressable>
            <Pressable
              onPress={() => {
                void pickPhoto(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={m('photo.gallery')}
              style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
            >
              <Icon name="photo" size={18} color={colors.accentStrong} />
            </Pressable>
          </View>
        </Field>
        <Field label={m('terminal.comment')}>
          <Input value={comment} onChangeText={setComment} placeholder={m('terminal.commentPlaceholder')} />
        </Field>
        <Pressable
          onPress={() => {
            if (photo === null) return;
            create.mutate({
              photo: { mimeType: photo.mimeType, content: photo.base64 },
              comment: comment.trim() === '' ? null : comment.trim(),
            });
          }}
          disabled={create.isPending || photo === null}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            pressed ? styles.pressed : null,
            photo === null ? styles.submitDisabled : null,
          ]}
        >
          {create.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>{m('terminal.submit')}</Text>
          )}
        </Pressable>
      </BottomSheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  loader: {
    paddingVertical: spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  count: {
    ...typography.title,
    color: colors.textPrimary,
  },
  countDone: {
    color: colors.positive,
  },
  remaining: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  rowName: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rowTime: {
    ...typography.body,
    color: colors.textMuted,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  buttonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  photoHint: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    marginRight: 'auto',
  },
  photoButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  submit: {
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: {
    opacity: opacity.disabled,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
  },
});
