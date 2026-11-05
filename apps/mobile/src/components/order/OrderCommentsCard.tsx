import { formatDateTime } from '@curtain-crm/shared';
import { useRef, useState, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLocale } from '../../hooks/useLocale';
import { trpc } from '../../lib/trpc';
import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../../theme';
import { Card, CardTitle, Empty } from '../Card';
import { useWebAutoGrow } from '../Field';
import { Icon } from '../Icon';
import { VoiceCommentPlayer, VoiceRecorderButton } from '../VoiceComment';

/**
 * Высота строки ввода — та же, что у полей форм (`controlHeight`): поле и
 * кнопка «отправить» рядом обязаны быть одного роста.
 */
const CONTROL_HEIGHT = sizes.controlHeight;
const INPUT_LINE = typography.body.lineHeight;
const INPUT_BORDER = 1;
/** Одна строка текста ровно в `CONTROL_HEIGHT` — без пустоты под ней. */
const INPUT_PADDING_V = (CONTROL_HEIGHT - INPUT_LINE - INPUT_BORDER * 2) / 2;
/** Дальше четырёх строк поле не растёт — прокрутка внутри. */
const INPUT_MAX = INPUT_LINE * 4 + INPUT_PADDING_V * 2 + INPUT_BORDER * 2;
/** Значок на кнопке отправки. */
const SEND_ICON = 18;

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

  /*
    Поле растёт вместе с текстом — в браузере вручную.

    На телефоне многострочное поле растёт само, от одной строки до
    `maxHeight`. В браузере это `<textarea>` высотой в две строки по
    умолчанию, и он не растёт вовсе: пустое поле было выше кнопки рядом, а
    третья строка уезжала под рамку. Расчёт общий с `Input` из `Field` —
    своя копия того же кода уже однажды с ним разошлась.
  */
  const input = useRef<TextInput>(null);
  const webHeight = useWebAutoGrow(input, comment, { min: CONTROL_HEIGHT, max: INPUT_MAX });

  /*
    Фокус — рамкой акцента, как у полей форм. Кольцо браузера снято
    глобально в `public/index.html`, и без своей рамки в PWA не было видно,
    что поле вообще в фокусе.
  */
  const [focused, setFocused] = useState(false);

  const list = comments.data ?? [];

  return (
    <Card>
      <CardTitle title={m('order.comments')} icon="comment" />

      <View style={styles.commentForm}>
        <TextInput
          ref={input}
          value={comment}
          onChangeText={setComment}
          placeholder={m('order.commentPlaceholder')}
          placeholderTextColor={colors.textMuted}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          style={[
            styles.commentInput,
            webHeight === undefined ? null : { height: webHeight },
            focused ? styles.commentInputFocused : null,
          ]}
          multiline
          // В браузере — одна строка вместо двух по умолчанию у `<textarea>`.
          // На телефоне не задаётся: там это зафиксировало бы высоту поля.
          {...(Platform.OS === 'web' ? { numberOfLines: 1 } : {})}
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
          {/* Значок общего набора, а не символ «➤» системного шрифта. */}
          <Icon name="send" size={SEND_ICON} color={colors.onAccent} />
        </Pressable>
      </View>

      <VoiceRecorderButton orderId={orderId} />

      {list.length === 0 ? (
        <Empty message={m('order.noComments')} />
      ) : (
        /*
          Лента отбита от кнопки записи тем же шагом, что и пустое состояние
          (12 + 12 внутреннего отступа — как 24 у `Empty`). Прежде первый
          комментарий стоял на кнопке вплотную, линия в линию.
        */
        <View style={styles.list}>
          {list.map((entry, index) => (
            <View key={entry.id} style={[styles.comment, index === 0 ? null : styles.commentDivided]}>
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
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.md,
  },
  comment: {
    paddingVertical: spacing.md,
  },
  commentDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentAuthor: {
    ...typography.caption,
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  commentBody: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  commentForm: {
    flexDirection: 'row',
    // Кнопка остаётся у нижней строки, пока поле растёт, — как в мессенджере.
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  commentInput: {
    ...typography.body,
    flex: 1,
    minHeight: CONTROL_HEIGHT,
    maxHeight: INPUT_MAX,
    borderWidth: INPUT_BORDER,
    borderColor: colors.border,
    // Скругление полей форм: рядом на той же карточке заказа поля метража и
    // цены скруглены на `md`, и поле комментария с `sm` выглядело чужим.
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: INPUT_PADDING_V,
    color: colors.textPrimary,
    // Белое, как любое поле ввода: на бежевой подложке живое поле выглядело
    // бледнее отключённых полей той же карточки.
    backgroundColor: colors.surface,
    // Android по умолчанию ставит текст многострочного поля по центру.
    textAlignVertical: 'top',
  },
  commentInputFocused: {
    borderColor: colors.accent,
  },
  commentTime: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  sendButton: {
    width: CONTROL_HEIGHT,
    height: CONTROL_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
