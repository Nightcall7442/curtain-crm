import {
  formatMoney,
  groupDigits,
  ORDER_STAGE_FEE_LABELS,
  isAssignableRole,
  isManagement,
  ORDER_STAGE_FEE_ROLE,
  parseMoney,
  ROLE_LABELS,
  stageFeesOfOrderType,
  type OrderStageFee,
  type OrderType,
  type Role,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, radius, spacing, typography } from '../theme';

import { Card, CardTitle, Row, Skeleton } from './Card';
import { Field, MoneyInput } from './Field';

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
  cornice: 'corniceFee',
  installation: 'installationFee',
} as const satisfies Readonly<Record<OrderStageFee, string>>;

export function OrderManagement({
  orderId,
  orderType,
  workPrice,
  paidAmount,
  fees,
  assignees,
}: {
  readonly orderId: number;
  readonly orderType: OrderType;
  readonly workPrice: string;
  /** Оплачено по книге проводок — показывается, меняется приходом или возвратом. */
  readonly paidAmount: string;
  /** Суммы по этапам. `null` — скрыта от этого пользователя сервером. */
  readonly fees: Readonly<Record<string, string | null>>;
  readonly assignees: Readonly<Partial<Record<Role, { readonly id: number; readonly fullName: string } | null>>>;
}): ReactElement {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();

  const [price, setPrice] = useState('');
  const [feeDrafts, setFeeDrafts] = useState<Readonly<Record<string, string>>>({});

  /** Роль, которой сейчас выбирают исполнителя. `null` — никакая. */
  const [assigning, setAssigning] = useState<Role | null>(null);
  /** Показывать и тех, у кого этой роли нет. Сбрасывается вместе с ролью. */
  const [showOthers, setShowOthers] = useState(false);

  const stages = stageFeesOfOrderType(orderType);

  /*
    В «Назначении» — роли, а не этапы, и только те, на которые назначают.

    Этапов у одной роли бывает несколько: пока нет закройщика, раскрой и
    пошив числятся за швеёй, и по этапам в списке выходило две «Швеи» подряд.
    Карнизчика тут нет вовсе — карниз он берёт сам (см. `ASSIGNABLE_ROLES`),
    и строка «назначить» под него обещала бы действие, которого нет.
  */
  const assignedRoles = [
    ...new Set(stages.map((stage) => ORDER_STAGE_FEE_ROLE[stage]).filter(isAssignableRole)),
  ];

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
      await refresh();
    },
    onError: fail(m('manage.priceError')),
  });

  const setFees = trpc.orders.setStageFees.useMutation({
    async onSuccess() {
      notifySuccess();
      setFeeDrafts({});
      await refresh();
    },
    onError: fail(m('manage.feesError')),
  });

  const assign = trpc.orders.assign.useMutation({
    async onSuccess() {
      notifySuccess();
      setAssigning(null);
      await refresh();
    },
    onError: fail(m('manage.assignError')),
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
        <CardTitle title={m('manage.economics')} icon="payroll" />

        {economics.data === undefined ? (
          <Skeleton rows={2} />
        ) : (
          <>
            <Row label={m('manage.work')} value={economics.data.revenueFormatted ?? '—'} />
            <Row
              label={m('manage.purchases', { n: economics.data.purchaseLines })}
              value={economics.data.costFormatted}
            />
            {/*
              Наценки как отдельного поля в системе нет и не будет: она не
              хранится, а считается — выручка минус закупки по этому заказу.
              Процент показывается рядом с суммой, потому что «сто тысяч»
              и «сто тысяч из миллиона» — разные новости.
            */}
            <Row
              label={m('manage.margin')}
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
        <CardTitle title={m('manage.assignment')} icon="people" />

        {assignedRoles.map((role) => {
          const current = assignees[role] ?? null;

          return (
            <View key={role}>
              <Pressable
                onPress={() => {
                  setAssigning(assigning === role ? null : role);
                  setShowOthers(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={m('manage.assignRole', { role: t(ROLE_LABELS, role) })}
                style={({ pressed }) => [styles.assignRow, pressed ? styles.pressed : null]}
              >
                <Text style={styles.assignRole}>{t(ROLE_LABELS, role)}</Text>
                <Text style={current === null ? styles.assignEmpty : styles.assignName}>
                  {current?.fullName ?? m('order.notAssignedM')}
                </Text>
              </Pressable>

              {assigning === role && (
                <View style={styles.pickerBox}>
                  {people.isLoading ? (
                    <Skeleton rows={1} />
                  ) : (
                    (() => {
                      /*
                        Как в панели: сначала свои — у кого роль есть, это
                        обычный короткий список. По «Ещё» — все активные,
                        кроме директора и админа: швея, которая сегодня едет
                        на установку, — подработка, а не ошибка, роль ей
                        выдаст сам API при назначении.

                        Кнопки переносятся строками, а не едут лентой:
                        горизонтальная лента внутри экрана-ленты глотала
                        нажатия и прятала половину имён за краем.
                      */
                      const items = people.data?.items ?? [];
                      const own = items.filter((person) => person.roles.includes(role));
                      const others = items.filter(
                        (person) => !person.roles.includes(role) && !isManagement(person.roles),
                      );
                      const pool = showOthers ? [...own, ...others] : own;
                      if (current !== null && !pool.some((person) => person.id === current.id)) {
                        const kept = items.find((person) => person.id === current.id);
                        if (kept !== undefined) pool.push(kept);
                      }

                      return (
                        <View style={styles.people}>
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
                            <Text style={styles.chipClearText}>{m('manage.clear')}</Text>
                          </Pressable>

                          {pool.map((person) => {
                            const active = person.id === current?.id;
                            const foreign = !person.roles.includes(role);
                            return (
                              <Pressable
                                key={person.id}
                                onPress={() => {
                                  assign.mutate({ id: orderId, role, assigneeId: person.id });
                                }}
                                accessibilityRole="button"
                                style={[styles.chip, active ? styles.chipActive : null]}
                              >
                                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                                  {person.fullName}
                                </Text>
                                {foreign && person.roles[0] !== undefined && (
                                  <Text style={[styles.chipRole, active ? styles.chipTextActive : null]}>
                                    {t(ROLE_LABELS, person.roles[0])}
                                  </Text>
                                )}
                              </Pressable>
                            );
                          })}

                          {!showOthers && others.length > 0 && (
                            <Pressable
                              onPress={() => {
                                setShowOthers(true);
                              }}
                              accessibilityRole="button"
                              style={[styles.chip, styles.chipMore]}
                            >
                              <Text style={styles.chipText}>
                                {m('manage.more', { n: others.length })}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })()
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
        <CardTitle title={m('manage.priceTitle')} icon="paid" />
        <Text style={styles.hint}>
          {m('manage.priceHint', {
            price: formatMoney(parseMoney(workPrice)),
            paid: formatMoney(parseMoney(paidAmount)),
          })}
        </Text>

        <Field label={m('manage.workPrice')}>
          <MoneyInput
            value={price}
            onChangeText={setPrice}
            placeholder={trimAmount(workPrice)}
          />
        </Field>

        <Pressable
          onPress={() => {
            const parsedPrice = Number.parseFloat(price.replace(',', '.'));

            setPriceMutation.mutate({
              id: orderId,
              ...(Number.isFinite(parsedPrice) ? { workPrice: parsedPrice } : {}),
            });
          }}
          disabled={
            setPriceMutation.isPending || price.trim() === ''
          }
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            price.trim() === '' ? styles.submitOff : null,
            pressed ? styles.pressed : null,
          ]}
        >
          {setPriceMutation.isPending ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.submitText}>{m('manage.savePrice')}</Text>
          )}
        </Pressable>
      </Card>

      {/* --- Расценки по этапам ---------------------------------------------- */}
      <Card>
        <CardTitle title={m('manage.feesTitle')} icon="payroll" />
        <Text style={styles.hint}>{m('manage.feesHint')}</Text>

        {stages.map((stage) => {
          const stored = fees[FEE_FIELD[stage]] ?? null;

          return (
            <Field
              key={stage}
              label={t(ORDER_STAGE_FEE_LABELS, stage)}
              hint={stored === null ? undefined : m('manage.now', { v: formatMoney(parseMoney(stored)) })}
            >
              <MoneyInput
                value={feeDrafts[stage] ?? ''}
                onChangeText={(value) => {
                  setFeeDrafts((current) => ({ ...current, [stage]: value }));
                }}
                placeholder={stored === null ? '0' : trimAmount(stored)}
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
            <Text style={styles.submitText}>{m('manage.saveFees')}</Text>
          )}
        </Pressable>
      </Card>
    </>
  );
}

/** Сумма без хвоста «.00» — она нужна в подсказке, а не в расчёте. */
/** Подсказка в пустом поле — теми же разрядами, что и ввод: «5 000 000». */
function trimAmount(value: string): string {
  return groupDigits(Number.parseFloat(value).toString());
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
    flexWrap: 'wrap',
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
  chipMore: {
    borderStyle: 'dashed',
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipRole: {
    ...typography.footnote,
    color: colors.textMuted,
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
