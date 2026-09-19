import { formatDateTime } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { trpc } from '../../lib/trpc';
import { colors, fonts, opacity, radius, spacing, typography } from '../../theme';
import { Card, CardTitle, Empty } from '../Card';
import { VoiceCommentPlayer, VoiceRecorderButton } from '../VoiceComment';

/** Комментарии к заказу: текст и голос, своя лента и своя форма. */
export function OrderCommentsCard({ orderId }: { readonly orderId: number }): ReactElement {
  const { m } = useLocale();
  const utils = trpc.useUtils();
  const [comment, setComment] = useState('');
  const comments = trpc.orderComments.listByOrder.useQuery({ orderId });
  const addComment = trpc.orderComments.add.useMutation({
    onSuccess: async () => {
      setComment('');
      await utils.orderComments.listByOrder.invalidate({ orderId });
    },
  });

  return (
    <Card>
      <CardTitle title={m('order.comments')} icon="comment" />

      <View style={styles.commentForm}>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={m('order.commentPlaceholder')}
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
          accessibilityLabel={m('order.sendComment')}
        >
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>

      <VoiceRecorderButton orderId={orderId} />

      {comments.data === undefined || comments.data.length === 0 ? (
        <Empty message={m('order.noComments')} />
      ) : (
        comments.data.map((entry) => (
          <View key={entry.id} style={styles.comment}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentAuthor}>{entry.authorName}</Text>
              <Text style={styles.commentTime}>{formatDateTime(entry.createdAt, false)}</Text>
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
  );
}

const styles = StyleSheet.create({
  comment: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentAuthor: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  commentBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  commentForm: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentInput: {
    fontFamily: fonts.medium,
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
  commentTime: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
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
    fontFamily: fonts.medium,
    color: colors.onAccent,
    fontSize: 17,
  },
});
