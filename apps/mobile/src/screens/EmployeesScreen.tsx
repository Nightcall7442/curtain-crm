import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  formatPhone,
  ROLE_LABELS,
  SEWER_CATEGORY_LABELS,
  ROLES,
  type Department,
  type Role,
} from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
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
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardLink, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { ChipSelect, Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { SubmitButton } from '../components/SubmitButton';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, sizes, spacing, typography } from '../theme';

/**
 * Сотрудники: список, правка и приём нового.
 *
 * Кадровые действия закрыты `ceoProcedure` — их выполняет только директор,
 * и раньше только за компьютером. Между тем человека принимают на работу
 * там же, где с ним разговаривают, а не там, где стоит ноутбук.
 *
 * Что можно с телефона: завести сотрудника, поправить ФИО, телефон,
 * должность и подразделение, выдать и снять роль, отключить и вернуть.
 *
 * Чего нельзя: сбросить пароль. Новый пароль надо кому-то передать, и
 * экран, который показывает его посреди цеха, — плохая идея; это осталось
 * в панели, где директор сидит один.
 */
export function EmployeesScreen(): ReactElement {
  const { t, m, locale } = useLocale();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  /** Раскрытая карточка сотрудника. `null` — все свёрнуты. */
  const [openId, setOpenId] = useState<number | null>(null);
  /** Открыта ли форма приёма нового сотрудника. */
  const [isCreating, setCreating] = useState(false);

  /*
    Фото сотрудника ставит и убирает только директор — с этого экрана.

    Сотрудник своё фото больше не меняет: компания снимает штат разом, в
    фирменном поло и на общем фоне, и карточка в системе должна показывать
    именно этот снимок. Каждая замена уходит в журнал действий.
  */
  const setAvatar = trpc.users.setAvatar.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.users.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('emp.avatarSetError'), error.message);
    },
  });

  const removeAvatar = trpc.users.removeAvatar.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.users.list.invalidate();
    },
    onError(error) {
      notifyError();
      Alert.alert(m('emp.avatarRemoveError'), error.message);
    },
  });

  /**
   * Снимок обрезается в квадрат прямо в пикере: фото показывается плашкой
   * 1:1, и растить трафик ради невидимых пикселей незачем.
   */
  const pickAvatar = async (userId: number, fromCamera: boolean): Promise<void> => {
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

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
          exif: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7,
          base64: true,
          exif: false,
        });

    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
      return;
    }

    setAvatar.mutate({
      userId,
      file: {
        fileName: asset.fileName ?? 'avatar.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        content: asset.base64,
      },
    });
  };

  const chooseAvatarAction = (person: { readonly id: number; readonly avatarUrl: string | null }): void => {
    Alert.alert(m('emp.avatarTitle'), m('emp.avatarWhat'), [
      { text: m('emp.avatarCamera'), onPress: () => void pickAvatar(person.id, true) },
      { text: m('emp.avatarGallery'), onPress: () => void pickAvatar(person.id, false) },
      ...(person.avatarUrl === null
        ? []
        : [
            {
              text: m('emp.avatarRemove'),
              style: 'destructive' as const,
              onPress: () => {
                removeAvatar.mutate({ userId: person.id });
              },
            },
          ]),
      { text: m('common.cancel'), style: 'cancel' as const },
    ]);
  };

  /* --- Черновик правки: заполняется при раскрытии карточки --------------- */
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState<Department>('other');

  /* --- Черновик нового сотрудника --------------------------------------- */
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoles, setNewRoles] = useState<readonly Role[]>([]);

  /*
    Сто — потолок сервера (`MAX_PAGE_SIZE`), а не круглое число «на глаз».
    Просил двести — процедура отвечала ошибкой валидации, и экран показывал
    её текстом вместо списка.

    Постраничности здесь нет намеренно: в фирме восемнадцать человек, и
    листалка ради одной страницы только мешала бы. Когда штат перевалит за
    сотню, список молча обрежется — тогда и появится подгрузка, вместе с
    настоящей нуждой в ней.
  */
  const employees = trpc.users.list.useQuery({ page: 1, pageSize: 100 });
  /* Категория швеи — в строке списка: по ней руководитель решает расценку. */
  const sewerCategories = trpc.rating.sewerCategories.useQuery();
  const branches = trpc.branches.list.useQuery();

  const refresh = async (): Promise<void> => {
    await utils.users.list.invalidate();
  };

  const fail = (title: string) => (error: { message: string }) => {
    notifyError();
    Alert.alert(title, error.message);
  };

  const update = trpc.users.update.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpenId(null);
      await refresh();
    },
    onError: fail(m('emp.saveError')),
  });

  const setActive = trpc.users.setActive.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail(m('emp.changeError')),
  });

  const grantRole = trpc.users.grantRole.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail(m('emp.grantError')),
  });

  const revokeRole = trpc.users.revokeRole.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail(m('emp.revokeError')),
  });

  const create = trpc.users.create.useMutation({
    async onSuccess(person) {
      notifySuccess();
      setCreating(false);
      setNewName('');
      setNewPhone('');
      setNewPassword('');
      setNewRoles([]);
      await refresh();
      Alert.alert(m('emp.hired'), m('emp.hiredBody', { name: person.fullName }));
    },
    onError: fail(m('emp.hireError')),
  });

  const openEditor = (person: {
    readonly id: number;
    readonly fullName: string;
    readonly phone: string;
    readonly jobTitle: string | null;
    readonly department: Department;
  }): void => {
    const next = openId === person.id ? null : person.id;
    setOpenId(next);
    if (next === null) return;

    setFullName(person.fullName);
    // В поле — так же, как в списке: «+998 93 100 00 07», а не слитно.
    // Сервер номер нормализует сам, пробелы ему не мешают.
    setPhone(formatPhone(person.phone));
    setJobTitle(person.jobTitle ?? '');
    setDepartment(person.department);
  };

  /* Без текста сервера: служебный ответ бывает по-английски и ничего не объясняет. */
  if (employees.isError) {
    return (
      <View style={styles.center}>
        <ErrorState />
      </View>
    );
  }

  const rows = (employees.data?.items ?? []).filter((person) =>
    search.trim() === ''
      ? true
      : `${person.fullName} ${person.phone}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  /*
    Филиал нового сотрудника не спрашивается: в фирме он один, и выбор из
    одного варианта — лишний шаг. Если филиалов станет больше, сервер
    примет любой из списка, и здесь появится выбор.
  */
  const firstBranchId = branches.data?.[0]?.id;
  const canCreate =
    newName.trim().length > 0 &&
    newPhone.trim().length > 0 &&
    newPassword.length >= 8 &&
    newRoles.length > 0 &&
    firstBranchId !== undefined;

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
        {/* --- Приём нового ------------------------------------------------- */}
        <Card>
          {/*
            Свёрнутая карточка — только заголовок, и его нижний отступ (12)
            вставал под ним пустотой: снизу 28 точек против 16 сверху.
          */}
          <View style={isCreating ? null : styles.titleOnly}>
            {/*
              «Принять / Скрыть» — ссылкой шапки, как «Подробнее» на других
              карточках. Была своя таблетка высотой 36 — ниже порога пальца и
              единственная такая в приложении.
            */}
            <CardTitle
              title={m('emp.new')}
              icon="person"
              action={
                <CardLink
                  label={isCreating ? m('emp.hide') : m('emp.hire')}
                  onPress={() => {
                    setCreating((current) => !current);
                  }}
                />
              }
            />
          </View>

          {isCreating && (
            <>
              <Field label={m('emp.fullName')}>
                <Input value={newName} onChangeText={setNewName} autoCapitalize="words" />
              </Field>

              <Field label={m('emp.phone')} hint={m('emp.phoneHint')}>
                <Input
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="+998 90 123 45 67"
                  keyboardType="phone-pad"
                />
              </Field>

              <Field label={m('emp.password')} hint={m('emp.passwordHint')}>
                <Input value={newPassword} onChangeText={setNewPassword} />
              </Field>

              <Field label={m('emp.roles')} hint={m('emp.rolesHint')}>
                <View style={styles.roles}>
                  {ROLES.map((role) => {
                    const picked = newRoles.includes(role);
                    return (
                      <Pressable
                        key={role}
                        onPress={() => {
                          setNewRoles((current) =>
                            picked ? current.filter((item) => item !== role) : [...current, role],
                          );
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: picked }}
                        style={[styles.chip, picked ? styles.chipActive : null]}
                      >
                        <Text style={[styles.chipText, picked ? styles.chipTextActive : null]}>
                          {t(ROLE_LABELS, role)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              {/* Общая кнопка формы: высота, таблетка и оттенок «недоступно» — как везде. */}
              <SubmitButton
                label={m('emp.hireSubmit')}
                onPress={() => {
                  if (firstBranchId === undefined) return;
                  create.mutate({
                    fullName: newName.trim(),
                    phone: newPhone.trim(),
                    password: newPassword,
                    roles: [...newRoles],
                    branchIds: [firstBranchId],
                  });
                }}
                disabled={!canCreate}
                pending={create.isPending}
              />
            </>
          )}
        </Card>

        {/* --- Список ------------------------------------------------------- */}
        <Card>
          <CardTitle title={m('emp.title')} icon="people" />

          <Field label={m('emp.search')}>
            <Input value={search} onChangeText={setSearch} placeholder={m('emp.searchPlaceholder')} />
          </Field>

          {employees.data === undefined ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <Empty message={m('emp.notFound')} />
          ) : (
            rows.map((person) => (
              <View key={person.id}>
                <Pressable
                  onPress={() => {
                    openEditor(person);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={m('emp.openCard', { name: person.fullName })}
                  style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.name, person.isActive ? null : styles.nameOff]}
                      numberOfLines={1}
                    >
                      {person.fullName}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {`${formatPhone(person.phone)} · ${person.roles
                        .map((role) => t(ROLE_LABELS, role))
                        .join(', ')}`}
                      {(() => {
                        const category = (sewerCategories.data ?? []).find((entry) => entry.userId === person.id)?.category;
                        return category === undefined ? '' : ` · ${SEWER_CATEGORY_LABELS[locale][category]}`;
                      })()}
                    </Text>
                  </View>

                  {!person.isActive && <Pill text={m('emp.disabled')} tone="neutral" />}
                  {/* Раскрытая строка — шеврон вниз, как у любого раскрывающегося списка. */}
                  <View style={openId === person.id ? styles.chevronOpen : null}>
                    <Icon name="chevron" size={16} color={colors.textMuted} />
                  </View>
                </Pressable>

                {/*
                  Правка — на своей подложке: поля не сливаются со списком
                  сотрудников, и видно, где кончается карточка этого человека.
                */}
                {openId === person.id && (
                  <View style={styles.editor}>
                    <Field label={m('emp.photo')} hint={m('emp.photoHint')}>
                      <Pressable
                        onPress={() => {
                          chooseAvatarAction(person);
                        }}
                        disabled={setAvatar.isPending || removeAvatar.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.action,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text style={styles.actionText}>
                          {person.avatarUrl === null ? m('emp.setPhoto') : m('emp.replacePhoto')}
                        </Text>
                      </Pressable>
                    </Field>

                    <Field label={m('emp.fullName')}>
                      <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
                    </Field>

                    <Field label={m('emp.phoneLabel')}>
                      <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                    </Field>

                    <Field label={m('emp.jobTitle')}>
                      <Input value={jobTitle} onChangeText={setJobTitle} />
                    </Field>

                    {/* Один из нескольких — общим выбором, а не своей копией его чипов. */}
                    <Field label={m('emp.department')}>
                      <ChipSelect
                        value={department}
                        options={DEPARTMENTS.map((value) => ({
                          value,
                          label: t(DEPARTMENT_LABELS, value),
                        }))}
                        onChange={setDepartment}
                      />
                    </Field>

                    {/*
                      Роли меняются по одной и сразу, а не вместе с формой:
                      выдача роли — отдельное действие на сервере, со своей
                      записью в журнале. Собрать их в общее «Сохранить»
                      значило бы потерять, кто и когда выдал доступ.
                    */}
                    <Field label={m('emp.roles')} hint={m('emp.rolesTapHint')}>
                      <View style={styles.roles}>
                        {ROLES.map((role) => {
                          const has = person.roles.includes(role);
                          return (
                            <Pressable
                              key={role}
                              onPress={() => {
                                if (has) revokeRole.mutate({ id: person.id, role });
                                else grantRole.mutate({ id: person.id, role });
                              }}
                              disabled={grantRole.isPending || revokeRole.isPending}
                              accessibilityRole="button"
                              accessibilityState={{ selected: has }}
                              style={[styles.chip, has ? styles.chipActive : null]}
                            >
                              <Text style={[styles.chipText, has ? styles.chipTextActive : null]}>
                                {t(ROLE_LABELS, role)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Field>

                    <View style={styles.actions}>
                      <Pressable
                        onPress={() => {
                          setActive.mutate({ id: person.id, isActive: !person.isActive });
                        }}
                        disabled={setActive.isPending}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.action,
                          styles.actionFlex,
                          person.isActive ? styles.actionDanger : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text
                          style={person.isActive ? styles.actionDangerText : styles.actionText}
                        >
                          {person.isActive ? m('emp.disable') : m('emp.restore')}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => {
                          update.mutate({
                            id: person.id,
                            fullName: fullName.trim(),
                            phone: phone.trim(),
                            jobTitle: jobTitle.trim() === '' ? null : jobTitle.trim(),
                            department,
                          });
                        }}
                        disabled={update.isPending}
                        accessibilityRole="button"
                        accessibilityState={{ busy: update.isPending }}
                        style={({ pressed }) => [
                          styles.action,
                          styles.actionFlex,
                          styles.actionPrimary,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        {update.isPending ? (
                          <ActivityIndicator color={colors.onAccent} size="small" />
                        ) : (
                          <Text style={styles.actionPrimaryText}>{m('emp.save')}</Text>
                        )}
                      </Pressable>
                    </View>

                    <Text style={styles.note}>{m('emp.resetNote')}</Text>
                  </View>
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
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  nameOff: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  editor: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  chevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  /* Гасит нижний отступ заголовка, когда под ним ничего нет. */
  titleOnly: {
    marginBottom: -spacing.md,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  /*
    Чип роли — как в общем выборе (`ChipSelect`, им выбирается
    подразделение строкой выше): та же высота, волосяная рамка и подпись,
    которая при выборе меняет только начертание. Ролей можно выбрать
    несколько, поэтому чипы свои, но выглядеть по-другому им незачем.
  */
  chip: {
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.header,
    borderColor: colors.header,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    // Насыщенность — семейством: вес поверх Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.headerText,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  /*
    Кнопки правки — общей системы (`SubmitButton`): высота кнопки действия,
    таблетка, жирная подпись. Было 46 и скругление 14 — на высоту поля, и
    «Сохранить» читалась ещё одним полем, а не итогом формы. «Фото» — та же
    кнопка во всю ширину поля, пара внизу делит ряд поровну.

    Белая, как поля ввода: на подложке правки прозрачная кнопка сливалась
    с фоном, и от неё оставалась одна рамка.
  */
  action: {
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionFlex: {
    flex: 1,
  },
  actionText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actionDanger: {
    borderColor: colors.danger,
  },
  actionDangerText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.danger,
    textAlign: 'center',
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionPrimaryText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
