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
import { Field, Input, MoneyInput } from '../components/Field';
import { Icon } from '../components/Icon';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';
import { useLocale } from '../hooks/useLocale';

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
  widthCm: '',
  heightCm: '',
  price: '',
  quantity: '1',
  comment: '',
  photo: null,
});

const toNumber = (raw: string): number => Number.parseFloat(raw.replace(',', '.')) || 0;

export function ReadyMadeStockScreen(): ReactElement {
  const { m } = useLocale();
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
      Alert.alert(m('stock.added'), m('stock.addedBody', { model: item.model, n: item.quantity }));
    },
    onError(error) {
      notifyError();
      Alert.alert(m('stock.addError'), error.message);
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
      Alert.alert(m('stock.countError'), error.message);
    },
  });

  const pickPhoto = async (fromCamera: boolean): Promise<void> => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        m('photo.noAccess'),
        fromCamera ? m('photo.allowCamera') : m('photo.allowGallery'),
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
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
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
      Alert.alert(m('stock.modelRequired'), m('stock.modelRequiredBody'));
      return;
    }
    if (toNumber(form.widthCm) <= 0 || toNumber(form.heightCm) <= 0) {
      Alert.alert(m('stock.sizeRequired'), m('stock.sizeRequiredBody'));
      return;
    }

    create.mutate({
      model: form.model.trim(),
      widthCm: toNumber(form.widthCm),
      heightCm: toNumber(form.heightCm),
      price: toNumber(form.price),
      quantity: Math.max(0, Number.parseInt(form.quantity, 10) || 0),
      ...(form.code.trim() === '' ? {} : { code: form.code.trim() }),
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
            {adding ? m('stock.collapse') : m('stock.add')}
          </Text>
        </Pressable>

        {adding && (
          <Card>
            <CardTitle title={m('stock.new')} icon="window" />

            <Field label={m('create.model')} required>
              <CatalogPicker
                value={form.model}
                placeholder={m('create.notChosen')}
                options={modelOptions}
                sheetTitle={m('sell.modelRange')}
                onChange={(model) => {
                  patch({ model });
                }}
              />
            </Field>

            {/*
              Код — своя бирка мастерской, а не код ткани с этикетки рулона:
              две шторы одной модели и размера различают по нему. Описание
              рядом заполняется руками — справочнику здесь взяться неоткуда,
              штора одна такая.
            */}
            <Field label={m('stock.code')} hint={m('stock.codeHint')}>
              <Input
                value={form.code}
                onChangeText={(code) => {
                  patch({ code });
                }}
                placeholder={m('stock.codeExample')}
                autoCapitalize="characters"
              />
            </Field>

            <Field label={m('stock.description')}>
              <Input
                value={form.comment}
                onChangeText={(comment) => {
                  patch({ comment });
                }}
                placeholder={m('stock.descriptionPlaceholder')}
                multiline
              />
            </Field>

            <View style={styles.row}>
              <View style={styles.half}>
                <Field label={m('create.width')} required>
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
                <Field label={m('create.height')} required>
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
                <Field label={m('stock.priceSum')} required>
                  <MoneyInput
                    value={form.price}
                    onChangeText={(price) => {
                      patch({ price });
                    }}
                    placeholder="450 000"
                  />
                </Field>
              </View>
              <View style={styles.half}>
                <Field label={m('stock.quantity')}>
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

            <View style={styles.photoRow}>
              {form.photo === null ? (
                <Text style={styles.photoHint}>{m('stock.photoHint')}</Text>
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
              <Text style={styles.submitText}>{m('stock.submit')}</Text>
            </Pressable>
          </Card>
        )}

        <Card>
          <CardTitle title={m('stock.title')} icon="orders" />

          {items.data === undefined ? (
            <Skeleton />
          ) : items.data.length === 0 ? (
            <Empty
              message={m('stock.none')}
              hint={m('stock.noneHint')}
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
                    <Text style={styles.itemTitle}>
                      {item.code === null ? item.model : `${item.model} · ${item.code}`}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {m('sell.cm', {
                        w: Number.parseFloat(item.widthCm),
                        h: Number.parseFloat(item.heightCm),
                      })}
                    </Text>
                    {item.comment !== null && (
                      <Text style={styles.itemMeta} numberOfLines={2}>
                        {item.comment}
                      </Text>
                    )}
                    <Text style={styles.itemMeta}>{item.branchName}</Text>
                  </View>

                  <View style={styles.itemNumbers}>
                    <Text style={styles.itemPrice}>{formatMoney(parseMoney(item.price))}</Text>
                    <Text style={styles.itemQuantity}>{m('stock.pcsOnly', { n: item.quantity })}</Text>
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
                      <Text style={styles.countSaveText}>{m('emp.save')}</Text>
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
                        {m('stock.recount')}
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
