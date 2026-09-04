import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  formatPhone,
  ROLE_LABELS,
  ROLES,
  type Department,
  type Role,
} from '@curtain-crm/shared';
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

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Field, Input } from '../components/Field';
import { Icon } from '../components/Icon';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, tabBarSpace, typography } from '../theme';

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
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState('');
  /** Раскрытая карточка сотрудника. `null` — все свёрнуты. */
  const [openId, setOpenId] = useState<number | null>(null);
  /** Открыта ли форма приёма нового сотрудника. */
  const [isCreating, setCreating] = useState(false);

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

  const employees = trpc.users.list.useQuery({ page: 1, pageSize: 200 });
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
    onError: fail('Не удалось сохранить'),
  });

  const setActive = trpc.users.setActive.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail('Не удалось изменить'),
  });

  const grantRole = trpc.users.grantRole.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail('Не удалось выдать роль'),
  });

  const revokeRole = trpc.users.revokeRole.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError: fail('Не удалось снять роль'),
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
      Alert.alert('Сотрудник принят', `${person.fullName} может войти по своему номеру`);
    },
    onError: fail('Не удалось принять сотрудника'),
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
    setPhone(person.phone);
    setJobTitle(person.jobTitle ?? '');
    setDepartment(person.department);
  };

  if (employees.isError) {
    return (
      <View style={styles.center}>
        <ErrorState message={employees.error.message} />
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
    firstBranchId !== undefined &&
    !create.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* --- Приём нового ------------------------------------------------- */}
        <Card>
          <CardTitle
            title="Новый сотрудник"
            icon="person"
            action={
              <Pressable
                onPress={() => {
                  setCreating((current) => !current);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.toggle, pressed ? styles.pressed : null]}
              >
                <Text style={styles.toggleText}>{isCreating ? 'Скрыть' : 'Принять'}</Text>
              </Pressable>
            }
          />

          {isCreating && (
            <>
              <Field label="Имя и фамилия">
                <Input value={newName} onChangeText={setNewName} autoCapitalize="words" />
              </Field>

              <Field label="Рабочий телефон" hint="По нему сотрудник входит в приложение">
                <Input
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="+998 90 123 45 67"
                  keyboardType="phone-pad"
                />
              </Field>

              <Field label="Пароль" hint="Не короче восьми знаков — сотрудник сменит его сам">
                <Input value={newPassword} onChangeText={setNewPassword} />
              </Field>

              <Field label="Роли" hint="Определяют, что человек видит и делает">
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

              <Pressable
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
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.submit,
                  canCreate ? null : styles.submitOff,
                  pressed ? styles.pressed : null,
                ]}
              >
                {create.isPending ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.submitText}>Принять на работу</Text>
                )}
              </Pressable>
            </>
          )}
        </Card>

        {/* --- Список ------------------------------------------------------- */}
        <Card>
          <CardTitle title="Сотрудники" icon="people" />

          <Field label="Поиск">
            <Input value={search} onChangeText={setSearch} placeholder="Имя или телефон" />
          </Field>

          {employees.data === undefined ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <Empty message="Никого не найдено" />
          ) : (
            rows.map((person) => (
              <View key={person.id}>
                <Pressable
                  onPress={() => {
                    openEditor(person);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Открыть карточку: ${person.fullName}`}
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
                    </Text>
                  </View>

                  {!person.isActive && <Pill text="Отключён" tone="neutral" />}
                  <Icon name="chevron" size={16} color={colors.textMuted} />
                </Pressable>

                {openId === person.id && (
                  <View style={styles.editor}>
                    <Field label="Имя и фамилия">
                      <Input value={fullName} onChangeText={setFullName} autoCapitalize="words" />
                    </Field>

                    <Field label="Телефон">
                      <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                    </Field>

                    <Field label="Должность">
                      <Input value={jobTitle} onChangeText={setJobTitle} />
                    </Field>

                    <Field label="Подразделение">
                      <View style={styles.roles}>
                        {DEPARTMENTS.map((value) => (
                          <Pressable
                            key={value}
                            onPress={() => {
                              setDepartment(value);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: value === department }}
                            style={[styles.chip, value === department ? styles.chipActive : null]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                value === department ? styles.chipTextActive : null,
                              ]}
                            >
                              {t(DEPARTMENT_LABELS, value)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </Field>

                    {/*
                      Роли меняются по одной и сразу, а не вместе с формой:
                      выдача роли — отдельное действие на сервере, со своей
                      записью в журнале. Собрать их в общее «Сохранить»
                      значило бы потерять, кто и когда выдал доступ.
                    */}
                    <Field label="Роли" hint="Нажатие сразу выдаёт или снимает">
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
                          person.isActive ? styles.actionDanger : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text
                          style={person.isActive ? styles.actionDangerText : styles.actionText}
                        >
                          {person.isActive ? 'Отключить' : 'Вернуть'}
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
                        style={({ pressed }) => [
                          styles.action,
                          styles.actionPrimary,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        {update.isPending ? (
                          <ActivityIndicator color={colors.onAccent} size="small" />
                        ) : (
                          <Text style={styles.actionPrimaryText}>Сохранить</Text>
                        )}
                      </Pressable>
                    </View>

                    <Text style={styles.note}>
                      Сброс пароля остался в панели: новый пароль надо кому-то
                      передать, и показывать его посреди цеха не стоит.
                    </Text>
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
    paddingBottom: tabBarSpace,
  },
  toggle: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleText: {
    ...typography.caption,
    color: colors.accentStrong,
    fontWeight: '600',
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
    paddingBottom: spacing.md,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
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
    color: colors.headerText,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actionDanger: {
    borderColor: colors.danger,
  },
  actionDangerText: {
    ...typography.body,
    color: colors.danger,
  },
  actionPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionPrimaryText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  submit: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  submitOff: {
    opacity: 0.4,
  },
  submitText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.onAccent,
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
