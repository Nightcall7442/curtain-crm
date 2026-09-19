import { CORNICE_STATUS_LABELS, CorniceStatus, formatDateTime, Role } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useLocale } from '../../hooks/useLocale';
import { notifyError, notifySuccess } from '../../lib/haptics';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { colors, opacity, radius, spacing, typography } from '../../theme';
import { Card, CardTitle, Row } from '../Card';

type Order = RouterOutputs['orders']['byId'];

/**
 * Карниз по заказу: состояние, кто ставит, когда сделал; карнизчику — кнопки
 * взять свободный и закрыть свой. Карниза нет — карточки нет.
 */
export function OrderCorniceCard({
  order,
}: {
  readonly order: Pick<Order, 'id' | 'corniceStatus' | 'corniceInstaller' | 'corniceDoneAt'>;
}): ReactElement | null {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const orderId = order.id;
  const isCorniceInstaller = (user?.roles ?? []).includes(Role.CORNICE_INSTALLER);

  /*
    Карниз — своя пара мутаций, мимо `changeStatus`: он идёт параллельно
    цепочке статусов, и статус заказа при этом не меняется. Обе обновляют
    и карточку, и очередь карнизчиков — иначе взятая работа осталась бы
    висеть в списке свободных до перезахода на экран.
  */
  const corniceMutationOptions = {
    onSuccess: async () => {
      notifySuccess();
      await Promise.all([
        utils.orders.byId.invalidate({ id: orderId }),
        utils.orders.corniceQueue.invalidate(),
      ]);
    },
    onError: () => {
      notifyError();
    },
  };

  const takeCornice = trpc.orders.takeCornice.useMutation(corniceMutationOptions);
  const finishCornice = trpc.orders.finishCornice.useMutation(corniceMutationOptions);

  if (order.corniceStatus === CorniceStatus.NOT_REQUIRED) return null;

  return (
    <Card>
      <CardTitle title={m('order.corniceTitle')} icon="window" />

      <Row label={m('order.corniceState')} value={t(CORNICE_STATUS_LABELS, order.corniceStatus)} />
      {order.corniceInstaller !== null && (
        <Row label={m('order.corniceBy')} value={order.corniceInstaller.fullName} />
      )}
      {order.corniceDoneAt !== null && (
        <Row label={m('order.corniceDone')} value={formatDateTime(order.corniceDoneAt)} />
      )}

      {/*
            Кнопки видит только карнизчик и только по своей работе: взять
            свободный карниз или закрыть уже взятый им. Остальным карточка
            остаётся справкой — кто ставит и когда сделал.
          */}
      {isCorniceInstaller && order.corniceStatus === CorniceStatus.PENDING && (
        <Pressable
          disabled={takeCornice.isPending}
          onPress={() => {
            takeCornice.mutate({ id: orderId });
          }}
          style={({ pressed }) => [
            styles.primaryAction,
            styles.corniceAction,
            pressed ? styles.pressed : null,
            takeCornice.isPending ? styles.disabled : null,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryActionText}>{m('order.takeCornice')}</Text>
        </Pressable>
      )}

      {isCorniceInstaller &&
        order.corniceStatus === CorniceStatus.IN_PROGRESS &&
        order.corniceInstaller?.id === user?.id && (
          <>
            <Pressable
              disabled={finishCornice.isPending}
              onPress={() => {
                finishCornice.mutate({ id: orderId });
              }}
              style={({ pressed }) => [
                styles.primaryAction,
                styles.corniceAction,
                pressed ? styles.pressed : null,
                finishCornice.isPending ? styles.disabled : null,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryActionText}>{m('order.finishCornice')}</Text>
            </Pressable>
            <Text style={styles.corniceHint}>{m('order.corniceHint')}</Text>
          </>
        )}
    </Card>
  );
}

const styles = StyleSheet.create({
  corniceAction: {
    marginTop: spacing.md,
  },
  corniceHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  primaryAction: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    ...typography.headline,
    color: colors.onAccent,
    fontWeight: '700',
  },
});
