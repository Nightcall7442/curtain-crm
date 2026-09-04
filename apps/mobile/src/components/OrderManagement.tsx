import {
  formatMoney,
  ORDER_STAGE_FEE_LABELS,
  ORDER_STAGE_FEE_ROLE,
  parseMoney,
  ROLE_LABELS,
  stageFeesOfOrderType,
  type OrderStageFee,
  type OrderType,
  type Role,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Row, Skeleton } from './Card';
import { Field, Input } from './Field';

/**
 * Управление заказом: назначение, цена, расценки, отмена.
 *
 * Заказ приходит к админу от продавца (`new` → `pending_admin_review`), и
 * дальше всё решает он: кто делает каждый этап, сколько стоит работа для
 * клиента и сколько получит исполнитель. До этого блока делать это можно
 * было только в веб-панели, хотя решают такое, стоя над раскроечным столом.
 *
 * Блок показывается только руководству. Это удобство, а не защита: все
 * четыре процедуры закрыты `managementProcedure` и откажут любому другому,
 * даже если он доберётся до них в обход интерфейса.
 *
 * Этапы берутся из `stageFeesOfOrderType`, а не перечисляются здесь: у
 * готовых штор нет ни замера, ни пошива, и четыре пустых поля вместо
 * одного нужного — верный способ, чтобы перестали заполнять и его.
 */

/** Колонка суммы, приходящая с сервера для каждого этапа. */
const FEE_FIELD = {
  measurement: 'measurementFee',
  cutting: 'cuttingFee',
  sewing: 'sewingFee',
  qc: 'qcFee',
  installation: 'installationFee',
} as const satisfies Readonly<Record<OrderStageFee, string>>;

export function OrderManagement({
  orderId,
  orderType,
  workPrice,
  deposit,
  fees,
  assignees,
}: {
  readonly orderId: number;
  readonly orderType: OrderType;
  readonly workPrice: string;
  readonly deposit: string;
  /** Суммы по этапам. `null` — скрыта от этого пользователя сервером. */
  readonly fees: Readonly<Record<string, string | null>>;
  readonly assignees: Readonly<Partial<Record<Role, { readonly id: number; readonly fullName: string } | null>>>;
}): ReactElement {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const [price, setPrice] = useState('');
  const [prepaid, setPrepaid] = useState('');
  const [feeDrafts, setFeeDrafts] = useState<Readonly<Record<string, string>>>({});

  /** Роль, которой сейчас выбирают исполнителя. `null` — никакая. */
  const [assigning, setAssigning] = useState<Role | null>(null);

  const stages = stageFeesOfOrderType(orderType);

  const people = trpc.users.list.useQuery(
    { page: 1, pageSize: 100, isActive: true },
    { enabled: assigning !== null },
  );

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
      utils.orders.availableTransitions.invalidate({ id: orderId }),
    ]);
  };

  const fail = (title: string) => (error: { message: string }) => {
    notifyError();
    Alert.alert(title, error.message);
  };

  const setPriceMutation = trpc.orders.setPrice.useMutation({
    async onSuccess() {
      notifySuccess();
      setPrice('');
      setPrepaid('');
      await refresh();
    },
    onError: fail('Не удалось изменить цену'),
  });

  const setFees = trpc.orders.setStageFees.useMutation({
    async onSuccess() {
      notifySuccess();
      setFeeDrafts({});
      await refresh();
    },
    onError: fail('Не удалось назначить расценки'),
  });

  const assign = trpc.orders.assign.useMutation({
    async onSuccess() {
      notifySuccess();
      setAssigning(null);
      await refresh();
    },
    onError: fail('Не удалось назначить исполнителя'),
  });

  /*
    Себестоимость и маржа считаются сервером по закупкам этого заказа.
    Управленческие цифры он отдаёт только руководству — здесь блок и так
    показывается лишь ему, но решает это `purchases.orderCost`, а не экран.
  */
  const economics = trpc.purchases.orderCost.useQuery({ orderId });

  return (
    <>
      {/* --- Деньги по заказу ------------------------------------------------ */}
      <Card>
        <CardTitle title="Экономика заказа" icon="payroll" />

        {economics.data === undefined ? (
          <Skeleton rows={2} />
        ) : (
          <>
            <Row label="Работа" value={economics.data.revenueFormatted ?? '—'} />
            <Row
              label={`Закупки (${economics.data.purchaseLines.toString()})`}
              value={economics.data.costFormatted}
            />
            {/*
              Наценки как отдельного поля в системе нет и не будет: она не
              хранится, а считается — выручка минус закупки по этому заказу.
              Процент показывается рядом с суммой, потому что «сто тысяч»
              и «сто тысяч из миллиона» — разные новости.
            */}
            <Row
              label="Маржа"
              value={
                economics.data.marginFormatted === null
                  ? '—'
                  : economics.data.marginPercent === null
                    ? economics.data.marginFormatted
                    : `${economics.data.marginFormatted} · ${economics.data.marginPercent.toString()} %`
              }
              valueColor={
                (economics.data.marginMinor ?? 0) < 0 ? colors.danger : colors.textPrimary
              }
            />
          </>
        )}
      </Card>

      {/* --- Исполнители ---------------------------------------------------- */}
      <Card>
        <CardTitle title="Назначение" icon="people" />

        {stages.map((stage) => {
          const role = ORDER_STAGE_FEE_ROLE[stage];
          const current = assignees[role] ?? null;

          return (
            <View key={stage}>
              <Pressable
                onPress={() => {
                  setAssigning(assigning === role ? null : role);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Назначить: ${t(ROLE_LABELS, role)}`}
                style={({ pressed }) => [styles.assignRow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.assignRole}>{t(ROLE_LABELS, role)}</Text>
                <Text style={current === null ? styles.assignEmpty : styles.assignName}>
                  {current?.fullName ?? 'не назначен'}
                </Text>
              </Pressable>

              {assigning === role && (
                <View style={styles.pickerBox}>
                  {people.isLoading ? (
                    <Skeleton rows={1} />
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.people}
                    >
                      {/*
                        «Снять» отдельной кнопкой: процедура принимает
                        `assigneeId: null`, и без этой кнопки ошибочное
                        назначение нельзя было бы отменить с телефона.
                      */}
                      <Pressable
                        onPress={() => {
                          assign.mutate({ id: orderId, role, assigneeId: null });
                        }}
                        accessibilityRole="button"
                        style={[styles.chip, styles.chipClear]}
                      >
                        <Text style={styles.chipClearText}>Снять</Text>
                      </Pressable>

                      {(people.data?.items ?? [])
                        .filter((person) => person.roles.includes(role))
                        .map((person) => (
                          <Pressable
                            key={person.id}
                            onPress={() => {
                              assign.mutate({ id: orderId, role, assigneeId: person.id });
                            }}
                            accessibilityRole="button"
                            style={[
                              styles.chip,
                              person.id === current?.id ? styles.chipActive : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                person.id === current?.id ? styles.chipTextActive : null,
                              ]}
                            >
                              {person.fullName}
                            </Text>
                          </Pressable>
                        ))}
                    </ScrollView>
                  )}

                  {assign.isPending && <ActivityIndicator color={colors.accent} size="small" />}
                </View>
              )}
            </View>
          );
        })}
      </Card>

      {/* --- Цена для клиента ------------------------------------------------ */}
      <Card>
        <CardTitle title="Цена и предоплата" icon="paid" />
        <Text style={styles.hint}>
          {`Сейчас: ${formatMoney(parseMoney(workPrice))}, предоплата ${formatMoney(
            parseMoney(deposit),
          )}. Пустое поле оставляет прежнее значение.`}
        </Text>

        <Field label="Стоимость работы, сум">
          <Input
            value={price}
            onChangeText={setPrice}
            placeholder={trimAmount(workPrice)}
            keyboardType="numeric"
          />
        </Field>

        <Field label="Предоплата, сум">
          <Input
            value={prepaid}
            onChangeText={setPrepaid}
            placeholder={trimAmount(deposit)}
            keyboardType="numeric"
          />
        </Field>

        <Pressable
          onPress={() => {
            const parsedPrice = Number.parseFloat(price.replace(',', '.'));
            const parsedDeposit = Number.parseFloat(prepaid.replace(',', '.'));

            setPriceMutation.mutate({
              id: orderId,
              ...(Number.isFinite(parsedPrice) ? { workPrice: parsedPrice } : {}),
              ...(Number.isFinite(parsedDeposit) ? { deposit: parsedDeposit } : {}),
            });
          }}
          disabled={
            setPriceMutation.isPending || (price.trim() === '' && prepaid.trim() === '')
          }
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            price.trim() === '' && prepaid.trim() === '' ? styles.submitOff : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {setPriceMutation.isPending ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.submitText}>Сохранить цену</Text>
          )}
        </Pressable>
      </Card>

      {/* --- Расценки по этапам ---------------------------------------------- */}
      <Card>
        <CardTitle title="Расценки по этапам" icon="payroll" />
        <Text style={styles.hint}>
          Сколько получит исполнитель за свой этап. Пустое поле оставляет
          прежнее значение.
        </Text>

        {stages.map((stage) => {
          const stored = fees[FEE_FIELD[stage]] ?? null;

          return (
            <Field
              key={stage}
              label={t(ORDER_STAGE_FEE_LABELS, stage)}
              hint={stored === null ? undefined : `Сейчас: ${formatMoney(parseMoney(stored))}`}
            >
              <Input
                value={feeDrafts[stage] ?? ''}
                onChangeText={(value) => {
                  setFeeDrafts((current) => ({ ...current, [stage]: value }));
                }}
                placeholder={stored === null ? '0' : trimAmount(stored)}
                keyboardType="numeric"
              />
            </Field>
          );
        })}

        <Pressable
          onPress={() => {
            const payload: Record<string, number> = {};
            for (const stage of stages) {
              const typed = Number.parseFloat((feeDrafts[stage] ?? '').replace(',', '.'));
              if (Number.isFinite(typed)) payload[FEE_FIELD[stage]] = typed;
            }
            setFees.mutate({ id: orderId, ...payload });
          }}
          disabled={setFees.isPending || Object.keys(feeDrafts).length === 0}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            Object.keys(feeDrafts).length === 0 ? styles.submitOff : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {setFees.isPending ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.submitText}>Сохранить расценки</Text>
          )}
        </Pressable>
      </Card>
    </>
  );
}

/** Сумма без хвоста «.00» — она нужна в подсказке, а не в расчёте. */
function trimAmount(value: string): string {
  return Number.parseFloat(value).toString();
}

const styles = StyleSheet.create({
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 46,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  assignRole: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  assignName: {
    ...typography.value,
    color: colors.textPrimary,
  },
  assignEmpty: {
    ...typography.value,
    color: colors.textMuted,
  },
  pickerBox: {
    paddingBottom: spacing.md,
  },
  people: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    minHeight: 40,
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
  chipClear: {
    borderColor: colors.danger,
  },
  chipClearText: {
    ...typography.caption,
    color: colors.danger,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.headerText,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  submit: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitOff: {
    opacity: 0.4,
  },
  submitText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.onAccent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
});
