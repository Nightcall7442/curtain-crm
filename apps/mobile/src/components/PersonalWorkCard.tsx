import {
  formatIsoDateShort,
  PERSONAL_WORK_STATUS_LABELS,
  todayIso,
  PersonalWorkStatus,
  type PersonalWorkStatus as PersonalWorkStatusName,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';

import { Pill } from './Card';
import { Input } from './Field';
import { Icon } from './Icon';

/**
 * Личная работа в списке «Работа → Личные».
 *
 * Устроена как карточка доп. работы и по той же причине: весь смысл записи
 * помещается в карточку, и отдельный экран только отдалял бы «дошил» от
 * «отметил».
 *
 * Отмена спрашивает причину, а выполнение — нет. Это не забывчивость:
 * готовая вещь не нуждается в объяснении, а брошенная посреди цеха —
 * нуждается, иначе через месяц не разобрать, почему станок стоял занятым.
 */
export function PersonalWorkCard({
  work,
}: {
  readonly work: {
    readonly id: number;
    readonly title: string;
    readonly details: string | null;
    readonly status: PersonalWorkStatusName;
    readonly cancellationReason: string | null;
    readonly createdAt: Date;
  };
}): ReactElement {
  const { t, m } = useLocale();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  /*
    Причина отмены спрашивается полем прямо в карточке.

    Системный `Alert.prompt` подошёл бы лучше по виду, но он существует
    только на iOS: на Android вызов молча ничего не делает, и половина цеха
    просто не смогла бы отменить работу. Своё поле работает одинаково везде.
  */
  const [cancelReason, setCancelReason] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    await utils.personalWorks.my.invalidate();
  };

  const complete = trpc.personalWorks.complete.useMutation({
    async onSuccess() {
      notifySuccess();
      await refresh();
    },
    onError(error) {
      Alert.alert(m('personal.completeError'), error.message);
    },
  });

  const cancel = trpc.personalWorks.cancel.useMutation({
    async onSuccess() {
      await refresh();
    },
    onError(error) {
      Alert.alert(m('personal.cancelError'), error.message);
    },
  });

  /*
    Без открытой смены сервер не примет ни «Готово», ни отмену
    (`requiresOpenShift`) и отвечал отказом уже после нажатия. Кнопки
    гаснут заранее, как галочка доп. работы рядом; причину называет баннер
    «Смена не начата» над списком. Запрос тот же, что у экрана.
  */
  const isBoss = useIsManagement();
  const shift = trpc.shifts.current.useQuery(undefined, { enabled: !isBoss });
  const needsShift = !isBoss && shift.data === null;

  const isOpen = work.status === PersonalWorkStatus.IN_PROGRESS;
  const expandable = work.details !== null || work.cancellationReason !== null;
  const toggle = (): void => {
    if (expandable) setExpanded((current) => !current);
  };

  /*
    Карточка — не кнопка целиком, а контейнер.

    Прежде вся карточка была кнопкой, и «Отменить»/«Готово» оказывались
    кнопкой внутри кнопки: в браузере это `<button>` в `<button>`, React
    сыпал ошибками в консоль, а программа чтения с экрана читала карточку
    одной кнопкой вместе с действиями. Раскрывают текст — заголовок и
    подробности, — а действия стоят рядом, а не внутри.
  */
  return (
    <View style={[styles.card, !isOpen && styles.cardClosed]}>
      <View style={styles.header}>
        <Pressable
          onPress={toggle}
          disabled={!expandable}
          accessibilityRole={expandable ? 'button' : undefined}
          accessibilityState={expandable ? { expanded } : undefined}
          style={styles.titleWrap}
        >
          <Text style={[styles.title, !isOpen && styles.titleClosed]}>{work.title}</Text>
        </Pressable>

        {isOpen ? (
          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                setCancelReason((current) => (current === null ? '' : null));
              }}
              disabled={cancel.isPending || needsShift}
              accessibilityRole="button"
              accessibilityLabel={m('personal.cancelA11y', { title: work.title })}
              accessibilityState={{ disabled: cancel.isPending || needsShift }}
              style={({ pressed }) => [
                styles.cancelButton,
                needsShift ? styles.off : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon name="cancelled" size={18} color={colors.danger} />
            </Pressable>

            <Pressable
              onPress={() => {
                complete.mutate({ id: work.id });
              }}
              disabled={complete.isPending || needsShift}
              accessibilityRole="button"
              accessibilityLabel={m('personal.completeA11y', { title: work.title })}
              accessibilityState={{ disabled: complete.isPending || needsShift, busy: complete.isPending }}
              style={({ pressed }) => [
                styles.doneButton,
                needsShift ? styles.off : null,
                pressed ? styles.pressed : null,
              ]}
            >
              {complete.isPending ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Icon name="completed" size={20} color={colors.onAccent} />
              )}
            </Pressable>
          </View>
        ) : (
          <Pill
            text={t(PERSONAL_WORK_STATUS_LABELS, work.status)}
            tone={work.status === PersonalWorkStatus.DONE ? 'positive' : 'neutral'}
          />
        )}
      </View>

      {/*
        Поле — общее (`Input`), а не своё: со своим в браузере не было
        видно, что оно в фокусе (рамку браузера снимает `index.html`, а
        замену ей рисует только общее поле), и кегль 13 выбивался из всех
        остальных полей приложения.
      */}
      {cancelReason !== null && (
        <View style={styles.cancelBox}>
          <Input
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder={m('personal.reasonPlaceholder')}
            multiline
            autoFocus
          />
          <Pressable
            onPress={() => {
              cancel.mutate({ id: work.id, reason: cancelReason.trim() });
            }}
            // Порог тот же, что у сервера (`reasonSchema`): кнопка не должна
            // предлагать отправить то, что заведомо вернётся ошибкой.
            disabled={cancelReason.trim().length < 3 || cancel.isPending}
            accessibilityRole="button"
            accessibilityState={{
              disabled: cancelReason.trim().length < 3 || cancel.isPending,
              busy: cancel.isPending,
            }}
            style={({ pressed }) => [
              styles.cancelConfirm,
              cancelReason.trim().length < 3 ? styles.off : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {cancel.isPending ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.cancelConfirmText}>{m('personal.cancelWork')}</Text>
            )}
          </Pressable>
        </View>
      )}

      {/* Касание текста раскрывает его так же, как касание заголовка; для
          программы чтения с экрана кнопка одна — заголовок. */}
      <Pressable onPress={toggle} disabled={!expandable} accessible={false}>
        {work.details !== null && (
          <Text style={styles.details} numberOfLines={expanded ? undefined : 2}>
            {work.details}
          </Text>
        )}

        {work.cancellationReason !== null && (
          <Text style={styles.reason} numberOfLines={expanded ? undefined : 1}>
            {m('personal.cancelReason', { reason: work.cancellationReason })}
          </Text>
        )}

        {/*
          Дата начала — местная календарная. `formatIsoDateShort` ждёт
          «ГГГГ-ММ-ДД», а получал полную отметку времени, и на карточке
          выходило «начата 05T06:37:25.244Z.11». `toISOString().slice(0, 10)`
          тоже не годится: это дата по Гринвичу, и работа, начатая в Ташкенте
          до пяти утра, показывалась бы вчерашней.
        */}
        <Text style={styles.started}>
          {m('personal.started', { date: formatIsoDateShort(todayIso(work.createdAt)) })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  cardClosed: {
    opacity: 0.65,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  /* Заголовок раскрывает подробности — цель для пальца полной высоты. */
  titleWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
  },
  title: {
    ...typography.body,
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  titleClosed: {
    textDecorationLine: 'line-through',
  },
  // Порог пальца; 40 точек в перчатках в цеху промахивались.
  doneButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  // Одна прозрачность «недоступно» на всё приложение — как у `SubmitButton`.
  off: {
    opacity: opacity.disabled,
  },
  cancelBox: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  /*
    Кнопка общей системы (`SubmitButton`): высота кнопки действия, таблетка,
    подпись основным кеглем. Своя — только из-за цвета: отмена работы —
    действие разрушительное, и зелёная кнопка звала бы нажать не глядя.
    Было 44, скругление 14 и подпись 13.
  */
  cancelConfirm: {
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelConfirmText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  details: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  reason: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  started: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
