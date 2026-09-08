import { CatalogKind, formatMoney, parseMoney } from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { CatalogPicker } from '../components/CatalogPicker';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

/**
 * Склад готовых штор: что сшито заранее и лежит на полке.
 *
 * Заводит записи тот же круг, что и продаёт (продавец, админ, директор):
 * шторы приносят из цеха в торговый зал, и ждать, пока их оприходует
 * руководство, значит не продать их сегодня.
 *
 * Остаток вводится числом «сколько стало», а не «сколько прибавить»:
 * продавец пересчитывает стопку и вводит то, что видит. Прибавление
 * требовало бы вычитания в уме, а ошибка в нём тихо разошлась бы с полкой.
 */

interface FormState {
  readonly model: string;
  readonly code: string;
  readonly color: string;
  readonly widthCm: string;
  readonly heightCm: string;
  readonly price: string;
  readonly quantity: string;
  readonly comment: string;
  readonly photo: { readonly uri: string; readonly base64: string; readonly mimeType: string } | null;
}

const emptyForm = (): FormState => ({
  model: '',
  code: '',
  color: '',
  widthCm: '',
  heightCm: '',
  price: '',
  quantity: '1',
  comment: '',
  photo: null,
});

const toNumber = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

export function ReadyMadeStockScreen(): ReactElement {
  const utils = trpc.useUtils();

  const [form, setForm] = useState<FormState>(emptyForm());
  const [adding, setAdding] = useState(false);
  const [counting, setCounting] = useState<number | null>(null);
  const [countValue, setCountValue] = useState('');

  const items = trpc.readyMade.list.useQuery({ includeEmpty: true, includeInactive: false });
  const catalog = trpc.catalog.list.useQuery({});

  const modelOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((entry) => entry.kind === CatalogKind.CURTAIN_MODEL)
        .map((entry) => entry.name),
    [catalog.data],
  );

  const patch = (next: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...next }));
  };

  const create = trpc.readyMade.create.useMutation({
    async onSuccess(item) {
      notifySuccess();
      setForm(emptyForm());
      setAdding(false);
      await utils.readyMade.list.invalidate();
      Alert.alert('Добавлено', `${item.model}: ${item.quantity.toString()} шт`);
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось добавить', error.message);
    },
  });

  const setQuantity = trpc.readyMade.setQuantity.useMutation({
    async onSuccess() {
      notifySuccess();
      setCounting(null);
      setCountValue('');
      await utils.readyMade.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert('Не удалось изменить остаток', error.message);
    },
  });

  const pickPhoto = async (fromCamera: boolean): Promise<void> => {
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

    patch({
      photo: {
        uri: asset.uri,
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
    });
  };

  const submit = (): void => {
    if (form.model.trim() === '') {
      Alert.alert('Укажите модель', 'Без модели штору не найти в списке.');
      return;
    }
    if (toNumber(form.widthCm) <= 0 || toNumber(form.heightCm) <= 0) {
      Alert.alert('Укажите размер', 'Готовая штора без размера не подойдёт ни к одному окну.');
      return;
    }

    create.mutate({
      model: form.model.trim(),
      widthCm: toNumber(form.widthCm),
      heightCm: toNumber(form.heightCm),
      price: toNumber(form.price),
      quantity: Math.max(0, Number.parseInt(form.quantity, 10) || 0),
      ...(form.code.trim() === '' ? {} : { code: form.code.trim() }),
      ...(form.color.trim() === '' ? {} : { color: form.color.trim() }),
      ...(form.comment.trim() === '' ? {} : { comment: form.comment.trim() }),
      ...(form.photo === null
        ? {}
        : {
            photo: {
              fileName: 'ready-made.jpg',
              mimeType: form.photo.mimeType,
              content: form.photo.base64,
            },
          }),
    });
  };

  if (items.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={items.error.message} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => {
            setAdding((open) => !open);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.add, pressed ? styles.pressed : null]}
        >
          <Icon name="assigned" size={18} color={colors.onAccent} />
          <Text style={styles.addText}>
            {adding ? 'Свернуть' : 'Добавить готовые шторы'}
          </Text>
        </Pressable>

        {adding && (
          <Card>
            <CardTitle title="Новая штора на складе" icon="window" />

            <Field label="Модель" required>
              <CatalogPicker
                value={form.model}
                placeholder="Не выбрана"
                options={modelOptions}
                sheetTitle="Модельный ряд"
                onChange={(model) => {
                  patch({ model });
                }}
              />
            </Field>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label="Ширина, см" required>
                  <Input
                    value={form.widthCm}
                    onChangeText={(widthCm) => {
                      patch({ widthCm });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="150"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Высота, см" required>
                  <Input
                    value={form.heightCm}
                    onChangeText={(heightCm) => {
                      patch({ heightCm });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="200"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label="Код ткани">
                  <Input
                    value={form.code}
                    onChangeText={(code) => {
                      patch({ code });
                    }}
                    placeholder="Например: П-31"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Цвет">
                  <Input
                    value={form.color}
                    onChangeText={(color) => {
                      patch({ color });
                    }}
                    placeholder="Бежевый"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label="Цена, сум" required>
                  <Input
                    value={form.price}
                    onChangeText={(price) => {
                      patch({ price });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="450000"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label="Количество">
                  <Input
                    value={form.quantity}
                    onChangeText={(quantity) => {
                      patch({ quantity });
                    }}
                    keyboardType="number-pad"
                    placeholder="1"
                  />
                </Field>
              </View>
            </View>

            <Field label="Комментарий">
              <Input
                value={form.comment}
                onChangeText={(comment) => {
                  patch({ comment });
                }}
                placeholder="Что важно помнить про эту штору"
                multiline
              />
            </Field>

            <View style={styles.photoRow}>
              {form.photo === null ? (
                <Text style={styles.photoHint}>Снимок — продавец показывает штору клиенту</Text>
              ) : (
                <Image source={{ uri: form.photo.uri }} style={styles.photoPreview} />
              )}

              <Pressable
                onPress={() => {
                  void pickPhoto(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="camera" size={18} color={colors.accentStrong} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void pickPhoto(false);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.photoButton, pressed ? styles.pressed : null]}
              >
                <Icon name="photo" size={18} color={colors.accentStrong} />
              </Pressable>
            </View>

            <Pressable
              disabled={create.isPending}
              onPress={submit}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.submit,
                pressed ? styles.pressed : null,
                create.isPending ? styles.disabled : null,
              ]}
            >
              <Text style={styles.submitText}>Поставить на склад</Text>
            </Pressable>
          </Card>
        )}

        <Card>
          <CardTitle title="На складе" icon="orders" />

          {items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty
              message="Готовых штор нет"
              hint="Добавьте первую — она сразу появится в продаже готовых штор"
            />
          ) : (
            items.data.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemHead}>
                  {item.photoUrl === null ? (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Icon name="window" size={18} color={colors.textMuted} />
                    </View>
                  ) : (
                    <Image source={{ uri: item.photoUrl }} style={styles.thumb} />
                  )}

                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle}>{item.model}</Text>
                    <Text style={styles.itemMeta}>
                      {`${Number.parseFloat(item.widthCm).toString()}×${Number.parseFloat(
                        item.heightCm,
                      ).toString()} см`}
                      {item.color === null ? '' : ` · ${item.color}`}
                      {item.code === null ? '' : ` · ${item.code}`}
                    </Text>
                    <Text style={styles.itemMeta}>{item.branchName}</Text>
                  </View>

                  <View style={styles.itemNumbers}>
                    <Text style={styles.itemPrice}>{formatMoney(parseMoney(item.price))}</Text>
                    <Text style={styles.itemQuantity}>{`${item.quantity.toString()} шт`}</Text>
                  </View>
                </View>

                {counting === item.id ? (
                  <View style={styles.countRow}>
                    <View style={styles.countInput}>
                      <Input
                        value={countValue}
                        onChangeText={setCountValue}
                        keyboardType="number-pad"
                        placeholder={item.quantity.toString()}
                      />
                    </View>
                    <Pressable
                      disabled={setQuantity.isPending}
                      onPress={() => {
                        setQuantity.mutate({
                          id: item.id,
                          quantity: Math.max(0, Number.parseInt(countValue, 10) || 0),
                        });
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.countSave, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.countSaveText}>Сохранить</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      setCounting(item.id);
                      setCountValue(item.quantity.toString());
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                  >
                    {({ pressed }) => (
                      <Text style={[styles.countOpen, pressed ? styles.pressed : null]}>
                        Пересчитать остаток
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: {
    padding: spacing.md,
    paddingBottom: tabBarSpace,
    gap: spacing.md,
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  addText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: { flex: 1 },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    flex: 0,
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
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  itemBody: { flex: 1 },
  itemTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemNumbers: { alignItems: 'flex-end' },
  itemPrice: {
    ...typography.headline,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  itemQuantity: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  countOpen: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '700',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countInput: { width: 96 },
  countSave: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countSaveText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '700',
  },
  pressed: { opacity: opacity.pressed },
  disabled: { opacity: opacity.disabled },
});
