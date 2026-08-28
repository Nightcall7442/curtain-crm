import {
  formatMoney,
  formatPhone,
  ORDER_STATUS_LABELS_RU,
  parseMoney,
  ROLE_LABELS_RU,
  TransitionKind,
  type OrderStatus,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card, CardTitle, Empty, Pill, Row } from '../components/Card';
import { OrderPhotoUpload } from '../components/OrderPhotoUpload';
import { VoiceCommentPlayer, VoiceRecorderButton } from '../components/VoiceComment';
import { trpc } from '../lib/trpc';
import { colors, radius, spacing, typography } from '../theme';
import type { RootStackScreenProps } from '../types';

/**
 * Карточка заказа.
 *
 * Кнопки действий приходят с сервера (`orders.availableTransitions`):
 * приложение не решает само, что доступно этой роли на этом этапе, и не
 * дублирует правила перехода. Обязательность причины тоже приходит оттуда.
 */
export function OrderDetailScreen({
  route,
}: RootStackScreenProps<'OrderDetail'>): ReactElement {
  const { orderId } = route.params;

  const utils = trpc.useUtils();
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  const order = trpc.orders.byId.useQuery({ id: orderId });
  const transitions = trpc.orders.availableTransitions.useQuery({ id: orderId });
  const comments = trpc.orderComments.listByOrder.useQuery({ orderId });

  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.orders.byId.invalidate({ id: orderId }),
      utils.orders.availableTransitions.invalidate({ id: orderId }),
      utils.orders.list.invalidate(),
    ]);
  };

  const changeStatus = trpc.orders.changeStatus.useMutation({
    onSuccess: async () => {
      setPendingStatus(null);
      setReason('');
      await refresh();
    },
  });

  const addComment = trpc.orderComments.add.useMutation({
    onSuccess: async () => {
      setComment('');
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
  });

  if (order.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (order.isError || order.data === undefined) {
    return (
      <View style={styles.loading}>
        <Empty
          message={order.error?.message ?? 'Заказ не найден'}
          hint="Возможно, вы больше не участвуете в этом заказе"
        />
      </View>
    );
  }

  const data = order.data;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.headerRow}>
          <Text style={styles.orderNumber}>
            {data.orderNumber ?? `#${data.id.toString()}`}
          </Text>
          <Pill text={ORDER_STATUS_LABELS_RU[data.status]} tone="info" />
        </View>

        <Text style={styles.client}>{data.clientName}</Text>

        <Pressable
          onPress={() => {
            void Linking.openURL(`tel:${data.clientPhone}`);
          }}
          style={({ pressed }) => [styles.callButton, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel={`Позвонить клиенту ${data.clientName}`}
        >
          <Text style={styles.callText}>{`📞 ${formatPhone(data.clientPhone)}`}</Text>
        </Pressable>

        <View style={styles.details}>
          <Row
            label="Срок"
            value={
              data.deadline === null
                ? '—'
                : new Date(data.deadline).toLocaleDateString('ru-RU')
            }
          />
          <Row label="Стоимость" value={formatMoney(parseMoney(data.workPrice))} />
          <Row label="Предоплата" value={formatMoney(parseMoney(data.deposit))} />
          <Row
            label="Остаток"
            value={
              data.remainingPayment === null
                ? '—'
                : formatMoney(parseMoney(data.remainingPayment))
            }
          />
          <Row label="Филиал" value={data.branch.name} />
        </View>

        {data.installAddress !== null && (
          <Text style={styles.address}>{`📍 ${data.installAddress}`}</Text>
        )}
      </Card>

      {/* --- Действия ---------------------------------------------------- */}
      <Card>
        <CardTitle title="Действия" icon="⚡" />

        {transitions.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : transitions.data === undefined || transitions.data.length === 0 ? (
          <Empty
            message="Действий сейчас нет"
            hint="Либо заказ закрыт, либо этот этап ведёт другой сотрудник"
          />
        ) : (
          <View style={styles.actions}>
            {transitions.data.map((transition) => (
              <Pressable
                key={transition.to}
                disabled={changeStatus.isPending}
                onPress={() => {
                  if (transition.requiresComment) {
                    setPendingStatus(transition.to);
                    setReason('');
                    return;
                  }
                  changeStatus.mutate({ id: orderId, toStatus: transition.to });
                }}
                style={({ pressed }) => [
                  styles.action,
                  transition.kind === TransitionKind.FORWARD
                    ? styles.actionForward
                    : transition.kind === TransitionKind.CANCEL
                      ? styles.actionCancel
                      : styles.actionRollback,
                  pressed ? styles.pressed : null,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.actionText,
                    transition.kind === TransitionKind.FORWARD
                      ? styles.actionTextForward
                      : transition.kind === TransitionKind.CANCEL
                        ? styles.actionTextCancel
                        : styles.actionTextRollback,
                  ]}
                >
                  {transition.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {pendingStatus !== null && (
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonTitle}>
              {`Переход в «${ORDER_STATUS_LABELS_RU[pendingStatus]}» требует причины`}
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Опишите причину"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
              style={styles.reasonInput}
            />
            <View style={styles.reasonButtons}>
              <Pressable
                disabled={reason.trim().length < 3 || changeStatus.isPending}
                onPress={() => {
                  changeStatus.mutate({
                    id: orderId,
                    toStatus: pendingStatus,
                    comment: reason.trim(),
                  });
                }}
                style={({ pressed }) => [
                  styles.confirmButton,
                  reason.trim().length < 3 ? styles.disabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.confirmText}>Подтвердить</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPendingStatus(null);
                }}
                style={({ pressed }) => [styles.cancelButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.cancelText}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        )}

        {changeStatus.error !== null && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{changeStatus.error.message}</Text>
          </View>
        )}
      </Card>

      {/* --- Позиции ------------------------------------------------------ */}
      <Card>
        <CardTitle title="Позиции заказа" icon="🪟" />
        {data.items.length === 0 ? (
          <Empty message="Позиций нет" />
        ) : (
          data.items.map((item, index) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>
                {`${(index + 1).toString()}. ${item.model ?? 'Без модели'}`}
              </Text>
              {item.widthCm !== null && item.heightCm !== null && (
                <Text style={styles.itemDetail}>
                  {`Размер: ${item.widthCm} × ${item.heightCm} см`}
                  {item.areaM2 === null ? '' : ` · ${item.areaM2} м²`}
                </Text>
              )}
              {item.materials.length > 0 && (
                <Text style={styles.itemDetail}>{`Материалы: ${item.materials.join(', ')}`}</Text>
              )}
              {item.color !== null && (
                <Text style={styles.itemDetail}>{`Цвет: ${item.color}`}</Text>
              )}
              {item.cornice !== null && (
                <Text style={styles.itemDetail}>{`Карниз: ${item.cornice}`}</Text>
              )}
              {item.comment !== null && <Text style={styles.itemComment}>{item.comment}</Text>}
            </View>
          ))
        )}
      </Card>

      {/* --- Фотофиксация --------------------------------------------------- */}
      <OrderPhotoUpload orderId={orderId} orderStatus={data.status} />

      {/* --- Исполнители --------------------------------------------------- */}
      <Card>
        <CardTitle title="Исполнители" icon="👥" />
        <Row label={ROLE_LABELS_RU.master} value={data.master?.fullName ?? 'не назначен'} />
        <Row label={ROLE_LABELS_RU.sewer} value={data.sewer?.fullName ?? 'не назначена'} />
        <Row label={ROLE_LABELS_RU.qc} value={data.qc?.fullName ?? 'не назначен'} />
        <Row label={ROLE_LABELS_RU.installer} value={data.installer?.fullName ?? 'не назначен'} />
      </Card>

      {/* --- Комментарии ---------------------------------------------------- */}
      <Card>
        <CardTitle title="Комментарии" icon="💬" />

        <View style={styles.commentForm}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Написать участникам заказа"
            placeholderTextColor={colors.textMuted}
            style={styles.commentInput}
            multiline
          />
          <Pressable
            disabled={comment.trim().length === 0 || addComment.isPending}
            onPress={() => {
              addComment.mutate({ orderId, body: comment.trim() });
            }}
            style={({ pressed }) => [
              styles.sendButton,
              comment.trim().length === 0 ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Отправить комментарий"
          >
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        </View>

        <VoiceRecorderButton orderId={orderId} />

        {comments.data === undefined || comments.data.length === 0 ? (
          <Empty message="Комментариев пока нет" />
        ) : (
          comments.data.map((entry) => (
            <View key={entry.id} style={styles.comment}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{entry.authorName}</Text>
                <Text style={styles.commentTime}>
                  {new Date(entry.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              {entry.isVoice ? (
                <>
                  <VoiceCommentPlayer
                    url={entry.voiceUrl}
                    durationSeconds={entry.voiceDurationSeconds}
                  />
                  {/* Расшифровка, если она когда-нибудь появится: поле в схеме
                      есть, распознавания речи в этой версии нет. */}
                  {entry.body !== null && <Text style={styles.commentBody}>{entry.body}</Text>}
                </>
              ) : (
                <Text style={styles.commentBody}>{entry.body ?? ''}</Text>
              )}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.header,
  },
  client: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  callButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  callText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  details: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  address: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionForward: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  actionRollback: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  actionCancel: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  actionText: {
    ...typography.body,
    fontWeight: '600',
  },
  actionTextForward: {
    color: colors.accent,
  },
  actionTextRollback: {
    color: '#B45309',
  },
  actionTextCancel: {
    color: colors.danger,
  },
  reasonBlock: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  reasonTitle: {
    ...typography.caption,
    color: '#92400E',
    fontWeight: '600',
  },
  reasonInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reasonButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.headerText,
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  error: {
    marginTop: spacing.md,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemTitle: {
    ...typography.value,
  },
  itemDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemComment: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  commentForm: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    maxHeight: 96,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sendText: {
    color: colors.headerText,
    fontSize: 17,
  },
  comment: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  commentBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});
