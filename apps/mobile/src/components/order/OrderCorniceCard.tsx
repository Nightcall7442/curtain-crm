import { CORNICE_STATUS_LABELS, CorniceStatus, formatDateTime, Role } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useLocale } from '../../hooks/useLocale';
import { notifyError, notifySuccess } from '../../lib/haptics';
import { trpc, type RouterOutputs } from '../../lib/trpc';
import { colors, spacing, typography } from '../../theme';
import { Card, CardTitle, Row } from '../Card';
import { SubmitButton } from '../SubmitButton';

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
      {/* Свой значок: сеткой окна рисуется «Позиции заказа» на этом же экране. */}
      <CardTitle title={m('order.corniceTitle')} icon="cornice" />

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
      {/*
        Общая кнопка действия: той же высоты и того же вида, что остальные
        кнопки карточки заказа. Своя была в 52 точки, с подписью, которой
        браузер дорисовывал ложный жирный поверх полужирного.
      */}
      {isCorniceInstaller && order.corniceStatus === CorniceStatus.PENDING && (
        <SubmitButton
          label={m('order.takeCornice')}
          onPress={() => {
            takeCornice.mutate({ id: orderId });
          }}
          pending={takeCornice.isPending}
        />
      )}

      {isCorniceInstaller &&
        order.corniceStatus === CorniceStatus.IN_PROGRESS &&
        order.corniceInstaller?.id === user?.id && (
          <>
            <SubmitButton
              label={m('order.finishCornice')}
              onPress={() => {
                finishCornice.mutate({ id: orderId });
              }}
              pending={finishCornice.isPending}
            />
            <Text style={styles.corniceHint}>{m('order.corniceHint')}</Text>
          </>
        )}
    </Card>
  );
}

const styles = StyleSheet.create({
  corniceHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
