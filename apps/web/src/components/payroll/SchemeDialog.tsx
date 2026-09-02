'use client';

import {
  PAYROLL_SCHEME_REQUIRED_FIELDS,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  PAYROLL_SCHEME_TYPES,
  PayrollSchemeType,
  type PayrollSchemeType as PayrollSchemeTypeName,
  ROLE_LABELS_RU,
} from '@curtain-crm/shared';
import { useMemo, useState, type ReactElement } from 'react';

import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Условия оплаты КОНКРЕТНОГО сотрудника в одной его роли.
 *
 * Раньше схема настраивалась на роль целиком: все швеи работали на
 * одинаковых условиях, и разница в опыте не выражалась ничем. Теперь
 * условия у каждого свои.
 *
 * Роли в списке — только те, что у сотрудника действительно есть: назначить
 * швее условия установщика бессмысленно, заказов в этой роли у неё не будет.
 * Сервер это тоже проверяет — здесь просто не показываем заведомо мёртвый
 * вариант.
 *
 * Действующая схема у пары «сотрудник + роль» одна. При сохранении
 * предыдущая деактивируется, а не правится: снимок параметров в уже
 * посчитанных ведомостях должен остаться прежним, иначе прошлый месяц
 * пересчитается задним числом.
 *
 * Набор обязательных полей зависит от типа и берётся из
 * `PAYROLL_SCHEME_REQUIRED_FIELDS` — того же источника, что использует
 * сервер и check-констрейнт таблицы. Трёх копий правила не существует.
 */

const FIELD_LABELS: Readonly<Record<string, { label: string; hint: string }>> = {
  baseAmount: { label: 'Оклад за месяц, сум', hint: 'Начисляется независимо от выработки' },
  rate: {
    label: 'Ставка, сум',
    hint: 'Почасовая — за час. KPI — максимальная премия при 100 % плана. Фикс за заказ — за каждый закрытый',
  },
  kpiTarget: { label: 'План KPI', hint: 'Число закрытых за месяц заказов' },
  commissionPercent: { label: 'Процент от выручки, %', hint: 'От суммы работ закрытых заказов' },
};

export function SchemeDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [type, setType] = useState<PayrollSchemeTypeName>(PayrollSchemeType.HOURLY);
  const [values, setValues] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const utils = trpc.useUtils();

  // Список сотрудников грузится только с открытием окна: на странице зарплат
  // он не нужен, а держать его в памяти ради редкой настройки незачем.
  const staff = trpc.users.list.useQuery({ page: 1, pageSize: 100 }, { enabled: open });

  const upsert = trpc.payroll.schemes.upsert.useMutation({
    async onSuccess() {
      await utils.payroll.schemes.list.invalidate();
      onClose();
    },
  });

  const errors = fieldErrors(upsert.error);
  const required = PAYROLL_SCHEME_REQUIRED_FIELDS[type];

  const employees = useMemo(
    () => (staff.data?.items ?? []).filter((entry) => entry.isActive),
    [staff.data],
  );

  const selected = employees.find((entry) => entry.id.toString() === userId);
  const availableRoles = selected?.roles ?? [];

  const numberOf = (key: string): number | undefined => {
    const raw = values[key];
    if (raw === undefined || raw.trim().length === 0) return undefined;
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return (
    <Modal
      open={open}
      title="Условия оплаты сотрудника"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={upsert.isPending}
            disabled={
              selected === undefined ||
              role === '' ||
              required.some((key) => numberOf(key) === undefined)
            }
            onClick={() => {
              if (selected === undefined || role === '') return;

              upsert.mutate({
                userId: selected.id,
                role: role as (typeof availableRoles)[number],
                type,
                effectiveFrom,
                ...(numberOf('baseAmount') === undefined ? {} : { baseAmount: numberOf('baseAmount') }),
                ...(numberOf('rate') === undefined ? {} : { rate: numberOf('rate') }),
                ...(numberOf('kpiTarget') === undefined ? {} : { kpiTarget: numberOf('kpiTarget') }),
                ...(numberOf('commissionPercent') === undefined
                  ? {}
                  : { commissionPercent: numberOf('commissionPercent') }),
              });
            }}
          >
            Сохранить условия
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError
          message={Object.keys(errors).length === 0 ? (upsert.error?.message ?? null) : null}
        />

        <Field label="Сотрудник" required>
          <Select
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
              // Роль сбрасываем: у нового сотрудника она может быть другая,
              // и сохранённый выбор увёл бы условия не в ту роль.
              setRole('');
            }}
            placeholder={staff.isLoading ? 'Загружаем…' : 'Выберите сотрудника'}
            options={employees.map((entry) => ({
              value: entry.id.toString(),
              label: entry.fullName,
            }))}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Роль"
            required
            hint={selected === undefined ? 'Сначала выберите сотрудника' : undefined}
          >
            <Select
              value={role}
              disabled={selected === undefined}
              onChange={(event) => {
                setRole(event.target.value);
              }}
              placeholder="Выберите роль"
              options={availableRoles.map((value) => ({
                value,
                label: ROLE_LABELS_RU[value],
              }))}
            />
          </Field>

          <Field label="Тип начисления" required>
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value as PayrollSchemeTypeName);
                // Поля другого типа очищаем: иначе в схему уедет ставка
                // от предыдущего выбора, которая для нового типа не значит ничего.
                setValues({});
              }}
              options={PAYROLL_SCHEME_TYPES.map((value) => ({
                value,
                label: PAYROLL_SCHEME_TYPE_LABELS_RU[value],
              }))}
            />
          </Field>
        </div>

        {required.map((key) => {
          const meta = FIELD_LABELS[key];
          return (
            <Field
              key={key}
              label={meta?.label ?? key}
              hint={meta?.hint}
              required
              error={errors[key]}
            >
              <Input
                inputMode="decimal"
                value={values[key] ?? ''}
                onChange={(event) => {
                  setValues((current) => ({ ...current, [key]: event.target.value }));
                }}
                invalid={errors[key] !== undefined}
              />
            </Field>
          );
        })}

        <Field label="Действует с" required error={errors['effectiveFrom']}>
          <Input
            type="date"
            value={effectiveFrom}
            onChange={(event) => {
              setEffectiveFrom(event.target.value);
            }}
          />
        </Field>

        <p className="text-footnote text-muted">
          Предыдущие условия этого сотрудника в выбранной роли будут заменены.
          Уже утверждённые ведомости не изменятся — в них хранится снимок
          старых параметров.
        </p>
      </div>
    </Modal>
  );
}
