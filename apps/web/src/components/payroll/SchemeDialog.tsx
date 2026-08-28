'use client';

import {
  PAYROLL_SCHEME_REQUIRED_FIELDS,
  PAYROLL_SCHEME_TYPE_LABELS_RU,
  PAYROLL_SCHEME_TYPES,
  type PayrollSchemeType,
  Role,
  ROLE_LABELS_RU,
  ROLES,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';

import { Button, Field, fieldErrors, FormError, Input, Modal, Select } from '@/components/ui/Form';
import { trpc } from '@/lib/trpc';

/**
 * Настройка схемы начисления для роли.
 *
 * Действующая схема у роли одна. При сохранении предыдущая деактивируется,
 * а не правится: снимок параметров в уже посчитанных ведомостях должен
 * остаться прежним, иначе прошлый месяц пересчитается задним числом.
 *
 * Набор обязательных полей зависит от типа и берётся из
 * `PAYROLL_SCHEME_REQUIRED_FIELDS` — того же источника, что использует
 * сервер и check-констрейнт таблицы. Трёх копий правила не существует.
 */

const FIELD_LABELS: Readonly<Record<string, { label: string; hint: string }>> = {
  baseAmount: { label: 'Оклад за месяц, сум', hint: 'Начисляется независимо от выработки' },
  rate: {
    label: 'Ставка, сум',
    hint: 'Для почасовой — за час. Для KPI — максимальная премия при 100 % плана',
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
  const [role, setRole] = useState<Role>(Role.SEWER);
  const [type, setType] = useState<PayrollSchemeType>('hourly');
  const [values, setValues] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  const utils = trpc.useUtils();

  const upsert = trpc.payroll.schemes.upsert.useMutation({
    async onSuccess() {
      await utils.payroll.schemes.list.invalidate();
      onClose();
    },
  });

  const errors = fieldErrors(upsert.error);
  const required = PAYROLL_SCHEME_REQUIRED_FIELDS[type];

  const numberOf = (key: string): number | undefined => {
    const raw = values[key];
    if (raw === undefined || raw.trim().length === 0) return undefined;
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return (
    <Modal
      open={open}
      title="Схема начисления"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={upsert.isPending}
            disabled={required.some((key) => numberOf(key) === undefined)}
            onClick={() => {
              upsert.mutate({
                role,
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
            Сохранить схему
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormError
          message={Object.keys(errors).length === 0 ? (upsert.error?.message ?? null) : null}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Роль" required>
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role);
              }}
              options={ROLES.map((value) => ({ value, label: ROLE_LABELS_RU[value] }))}
            />
          </Field>

          <Field label="Тип начисления" required>
            <Select
              value={type}
              onChange={(event) => {
                setType(event.target.value as PayrollSchemeType);
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

        <p className="text-[11.5px] text-muted">
          Предыдущая схема этой роли будет деактивирована. Уже утверждённые
          ведомости не изменятся — в них хранится снимок старых параметров.
        </p>
      </div>
    </Modal>
  );
}
