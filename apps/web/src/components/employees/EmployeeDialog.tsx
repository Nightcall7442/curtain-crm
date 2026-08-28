'use client';

import {
  DEPARTMENT_LABELS_RU,
  DEPARTMENTS,
  EMPLOYMENT_TYPE_LABELS_RU,
  EMPLOYMENT_TYPES,
  ROLE_LABELS_RU,
  ROLES,
  type Department,
  type EmploymentType,
  type Role,
} from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';

import {
  Button,
  Field,
  fieldErrors,
  FormError,
  Input,
  Modal,
  Select,
} from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

/**
 * Заведение и правка сотрудника.
 *
 * Создавать сотрудников и менять их роли вправе ТОЛЬКО директор — так решил
 * заказчик, и так объявлены процедуры (`ceoProcedure`). Администратор увидит
 * форму, но получит `FORBIDDEN`: показывать её всем и честно объяснять отказ
 * лучше, чем прятать и оставлять человека гадать, почему у него нет кнопки.
 *
 * При создании роли и филиалы задаются сразу: сотрудник без роли не может
 * ничего, а без филиала — не откроет смену.
 */

export interface EmployeeDraft {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string;
  readonly jobTitle: string | null;
  readonly department: Department;
  readonly employmentType: EmploymentType;
  readonly birthDate: string | null;
  readonly hiredAt: string | null;
  readonly roles: readonly Role[];
  readonly branchIds: readonly number[];
  readonly primaryBranchId: number | null;
}

export function EmployeeDialog({
  open,
  employee,
  onClose,
}: {
  readonly open: boolean;
  /** `null` — создание нового сотрудника. */
  readonly employee: EmployeeDraft | null;
  readonly onClose: () => void;
}): ReactElement {
  const isEdit = employee !== null;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState<Department>('sewing');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('permanent');
  const [birthDate, setBirthDate] = useState('');
  const [hiredAt, setHiredAt] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [branchIds, setBranchIds] = useState<number[]>([]);

  const utils = trpc.useUtils();
  const branches = trpc.branches.list.useQuery({}, { enabled: open });

  /** При открытии подставляем текущие значения или чистим форму. */
  useEffect(() => {
    if (!open) return;

    setFullName(employee?.fullName ?? '');
    setPhone(employee?.phone ?? '');
    setPassword('');
    setJobTitle(employee?.jobTitle ?? '');
    setDepartment(employee?.department ?? 'sewing');
    setEmploymentType(employee?.employmentType ?? 'permanent');
    setBirthDate(employee?.birthDate ?? '');
    setHiredAt(employee?.hiredAt ?? '');
    setRoles([...(employee?.roles ?? [])]);
    setBranchIds([...(employee?.branchIds ?? [])]);
  }, [open, employee]);

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.users.list.invalidate(),
      utils.users.stats.invalidate(),
      utils.users.performance.invalidate(),
    ]);
  };

  const create = trpc.users.create.useMutation({
    async onSuccess() {
      await refresh();
      onClose();
    },
  });

  const update = trpc.users.update.useMutation({
    async onSuccess() {
      await refresh();
      onClose();
    },
  });

  const setBranches = trpc.users.setBranches.useMutation({ onSuccess: refresh });

  const errors = fieldErrors(isEdit ? update.error : create.error);
  const pending = create.isPending || update.isPending || setBranches.isPending;

  const handleSubmit = (): void => {
    if (isEdit) {
      update.mutate({
        id: employee.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        jobTitle: jobTitle.trim().length > 0 ? jobTitle.trim() : null,
        department,
        employmentType,
        birthDate: birthDate.length > 0 ? birthDate : null,
        hiredAt: hiredAt.length > 0 ? hiredAt : null,
      });

      // Филиалы меняются отдельной процедурой — она доступна и админу,
      // тогда как правка анкеты только директору.
      if (branchIds.length > 0) {
        setBranches.mutate({ id: employee.id, branchIds });
      }
      return;
    }

    create.mutate({
      fullName: fullName.trim(),
      phone: phone.trim(),
      password,
      roles,
      branchIds,
      ...(jobTitle.trim().length > 0 ? { jobTitle: jobTitle.trim() } : {}),
      department,
      employmentType,
      ...(birthDate.length > 0 ? { birthDate } : {}),
      ...(hiredAt.length > 0 ? { hiredAt } : {}),
    });
  };

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <Modal
      open={open}
      title={isEdit ? `Сотрудник: ${employee.fullName}` : 'Новый сотрудник'}
      width="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={pending}>
            {isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormError
          message={
            Object.keys(errors).length === 0
              ? ((isEdit ? update.error?.message : create.error?.message) ?? null)
              : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ФИО" required error={errors['fullName']}>
            <Input
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
              }}
              placeholder="Юсупова Малика"
              invalid={errors['fullName'] !== undefined}
            />
          </Field>

          <Field
            label="Телефон"
            required
            error={errors['phone']}
            hint="Он же логин для входа"
          >
            <Input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              placeholder="+998 90 123 45 67"
              inputMode="tel"
              invalid={errors['phone'] !== undefined}
            />
          </Field>

          {!isEdit && (
            <Field
              label="Пароль"
              required
              error={errors['password']}
              hint="Минимум 8 символов. Сотрудник сменит его сам"
              className="sm:col-span-2"
            >
              <Input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
                invalid={errors['password'] !== undefined}
              />
            </Field>
          )}

          <Field label="Должность" error={errors['jobTitle']}>
            <Input
              value={jobTitle}
              onChange={(event) => {
                setJobTitle(event.target.value);
              }}
              placeholder="Швея"
            />
          </Field>

          <Field label="Подразделение">
            <Select
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value as Department);
              }}
              options={DEPARTMENTS.map((value) => ({
                value,
                label: DEPARTMENT_LABELS_RU[value],
              }))}
            />
          </Field>

          <Field label="Тип занятости">
            <Select
              value={employmentType}
              onChange={(event) => {
                setEmploymentType(event.target.value as EmploymentType);
              }}
              options={EMPLOYMENT_TYPES.map((value) => ({
                value,
                label: EMPLOYMENT_TYPE_LABELS_RU[value],
              }))}
            />
          </Field>

          <Field label="Дата приёма" error={errors['hiredAt']}>
            <Input
              type="date"
              value={hiredAt}
              onChange={(event) => {
                setHiredAt(event.target.value);
              }}
            />
          </Field>

          <Field label="Дата рождения" error={errors['birthDate']} hint="Для виджета дней рождения">
            <Input
              type="date"
              value={birthDate}
              onChange={(event) => {
                setBirthDate(event.target.value);
              }}
            />
          </Field>
        </div>

        {/* Роли задаются только при создании: у существующего сотрудника
            они меняются отдельными действиями с записью в журнал. */}
        {!isEdit && (
          <Field label="Роли" required error={errors['roles']}>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((role) => {
                const selected = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setRoles((current) => toggle(current, role));
                    }}
                    className={cn(
                      'rounded border px-2.5 py-1 text-[11.5px] transition-colors',
                      selected
                        ? 'border-gold/50 bg-gold/15 text-gold-soft'
                        : 'border-subtle text-secondary hover:bg-raised hover:text-primary',
                    )}
                  >
                    {ROLE_LABELS_RU[role]}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Field
          label="Филиалы"
          required
          error={errors['branchIds']}
          hint="Первый выбранный станет основным. Смену можно открыть только у своего филиала"
        >
          <div className="flex flex-wrap gap-1.5">
            {(branches.data ?? []).map((branch) => {
              const selected = branchIds.includes(branch.id);
              return (
                <button
                  key={branch.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setBranchIds((current) => toggle(current, branch.id));
                  }}
                  className={cn(
                    'rounded border px-2.5 py-1 text-[11.5px] transition-colors',
                    selected
                      ? 'border-gold/50 bg-gold/15 text-gold-soft'
                      : 'border-subtle text-secondary hover:bg-raised hover:text-primary',
                  )}
                >
                  {branch.name}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
