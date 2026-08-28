import {
  AUTO_COMPLETE_PHOTO_STAGE,
  autoCompletesOnInstallPhoto,
  hasAnyRole,
  PHOTO_STAGE_LABELS_RU,
  PHOTO_STAGE_UPLOADER_ROLES,
  PHOTO_STAGES,
  type OrderStatus,
  type PhotoStage,
} from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Empty, Pill } from './Card';

/**
 * Фотофиксация этапа заказа с телефона.
 *
 * Главный сценарий системы: установщик снимает результат на объекте, и заказ
 * закрывается автоматически. Поэтому загрузка живёт именно здесь, а не только
 * в веб-панели — до компьютера установщик доберётся в лучшем случае вечером.
 *
 * Снимок сжимается перед отправкой: фотография с современного телефона —
 * 4–8 МБ, а в цеху и на объекте связь мобильная. `quality: 0.6` даёт около
 * 500 КБ при полностью читаемой детализации шва.
 */
export function OrderPhotoUpload({
  orderId,
  orderStatus,
}: {
  readonly orderId: number;
  readonly orderStatus: OrderStatus;
}): ReactElement {
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const utils = trpc.useUtils();
  const [stage, setStage] = useState<PhotoStage>('general');

  const photos = trpc.orderPhotos.listByOrder.useQuery({ orderId });

  const upload = trpc.orderPhotos.upload.useMutation({
    async onSuccess(result) {
      await utils.orderPhotos.listByOrder.invalidate({ orderId });

      if (result.autoCompleted) {
        await Promise.all([
          utils.orders.byId.invalidate({ id: orderId }),
          utils.orders.availableTransitions.invalidate({ id: orderId }),
          utils.orders.list.invalidate(),
        ]);
        Alert.alert('Заказ закрыт', 'Фото после установки загружено, заказ переведён в «Выполнен».');
      }
    },
    onError(error) {
      Alert.alert('Не удалось загрузить', error.message);
    },
  });

  const allowedStages = PHOTO_STAGES.filter((value) =>
    hasAnyRole(roles, PHOTO_STAGE_UPLOADER_ROLES[value]),
  );

  // То же правило, что применяет сервер: предупреждение «загрузка закроет
  // заказ» и фактическое закрытие не должны расходиться.
  const willClose =
    stage === AUTO_COMPLETE_PHOTO_STAGE && autoCompletesOnInstallPhoto(orderStatus);

  const send = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Нет доступа',
        fromCamera
          ? 'Разрешите доступ к камере в настройках телефона.'
          : 'Разрешите доступ к галерее в настройках телефона.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      exif: false,
    };

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert('Не удалось прочитать снимок', 'Попробуйте ещё раз.');
      return;
    }

    upload.mutate({
      orderId,
      stage,
      file: {
        fileName: asset.fileName ?? 'photo.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        content: asset.base64,
      },
    });
  };

  const confirmAndSend = (fromCamera: boolean): void => {
    // Автозакрытие необратимо для исполнителя — переспрашиваем.
    if (!willClose) {
      void send(fromCamera);
      return;
    }

    Alert.alert(
      'Закрыть заказ?',
      'Фото стадии «После установки» автоматически переведёт заказ в «Выполнен». Отменить сможет только руководство.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Загрузить и закрыть',
          style: 'destructive',
          onPress: () => {
            void send(fromCamera);
          },
        },
      ],
    );
  };

  if (allowedStages.length === 0) {
    return (
      <Card>
        <CardTitle title="Фотофиксация" icon="📷" />
        <Empty
          message="Загружать фото по этому заказу могут другие исполнители"
          hint="Вы можете просматривать уже загруженные снимки"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle title="Фотофиксация" icon="📷" />

      <Text style={styles.label}>Стадия</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stages}>
        {allowedStages.map((value) => {
          const active = value === stage;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setStage(value);
              }}
              style={[styles.stage, active ? styles.stageActive : null]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.stageText, active ? styles.stageTextActive : null]}>
                {PHOTO_STAGE_LABELS_RU[value]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {willClose && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            Снимок этой стадии автоматически закроет заказ.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          disabled={upload.isPending}
          onPress={() => {
            confirmAndSend(true);
          }}
          style={({ pressed }) => [styles.action, styles.actionPrimary, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          {upload.isPending ? (
            <ActivityIndicator color={colors.headerText} />
          ) : (
            <Text style={styles.actionPrimaryText}>Снять камерой</Text>
          )}
        </Pressable>

        <Pressable
          disabled={upload.isPending}
          onPress={() => {
            confirmAndSend(false);
          }}
          style={({ pressed }) => [styles.action, styles.actionSecondary, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Text style={styles.actionSecondaryText}>Из галереи</Text>
        </Pressable>
      </View>

      {photos.data === undefined || photos.data.length === 0 ? (
        <Empty message="Фотографий пока нет" />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {photos.data.map((photo) => (
            <View key={photo.id} style={styles.photoCard}>
              <Image
                source={{ uri: photo.url }}
                style={styles.photo}
                accessibilityLabel={PHOTO_STAGE_LABELS_RU[photo.stage]}
              />
              <View style={styles.photoMeta}>
                <Pill text={PHOTO_STAGE_LABELS_RU[photo.stage]} tone="info" />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  stages: {
    marginBottom: spacing.md,
  },
  stage: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  stageActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  stageText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stageTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  warning: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warningText: {
    ...typography.caption,
    color: colors.warning,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  action: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  actionPrimary: {
    backgroundColor: colors.accent,
  },
  actionSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionPrimaryText: {
    color: colors.headerText,
    fontSize: 14,
    fontWeight: '600',
  },
  actionSecondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
  gallery: {
    marginTop: spacing.xs,
  },
  photoCard: {
    marginRight: spacing.sm,
  },
  photo: {
    width: 108,
    height: 108,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  photoMeta: {
    marginTop: spacing.xs,
    maxWidth: 108,
  },
});
