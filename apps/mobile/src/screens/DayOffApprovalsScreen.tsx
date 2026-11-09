import { DAY_OFF_STATUS_LABELS, DayOffStatus, workshopDayIso } from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { TeamDaysOff } from '../components/TeamDaysOff';
import { Input } from '../components/Field';
import {
  dayOffPeriod,
  latePeriod,
  RequestKindLabel,
  requestStatusTone,
  type RequestKind,
} from '../components/TimeOffRequest';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { notifyError, notifySuccess } from '../lib/haptics';
import { mergeRequests } from '../lib/requestOrder';
import { serverNow } from '../lib/serverClock';
import { trpc } from '../lib/trpc';
import { colors, fonts, opacity, radius, sizes, spacing, typography } from '../theme';

/**
 * Заявки на отгул и на опоздание: одобрить или отклонить.
 *
 * Решение по отгулу — самое «телефонное» из всего, что делает директор:
 * человек подходит и просит, ответ нужен здесь и сейчас. До этого экрана
 * ответить можно было только из веб-панели, то есть вернувшись к столу.
 * Опоздание решается так же и туда же: уведомление о нём ведёт сюда
 * (`notificationDestination` → `dayOffApprovals`), и оба вида стоят одним
 * списком — подпись над датами говорит, о чём просят.
 *
 * Показываются все заявки, а не только ждущие: директор приходит сюда и
 * с вопросом «а что я решил на той неделе». Ждущие идут первыми — так их
 * упорядочивает сервер; два вида сливаются по тому же правилу
 * (`mergeRequests`).
 *
 * Причина отказа обязательна и вводится прямо в карточке, а не в
 * `Alert.prompt`: тот есть только на iOS, и на Android отказ молча
 * не работал бы.
 *
 * Одобренное можно снять — и выходной (`dayOff.withdraw`), и опоздание
 * (`lateRequests.withdraw`). Владелец решает с телефона, а снять прежде
 * можно было только выходной и только в веб-панели: опоздание, одобренное
 * не тому или не на тот день, оставалось одобренным навсегда.
 */
export function DayOffApprovalsScreen(): ReactElement {
  const { t, m } = useLocale();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const insets = useSafeAreaInsets();
  /* Снизу — безопасная зона и обычный отступ, а не место под панель
     вкладок: это экран стека, панели под ним нет. */
  const contentStyle = [styles.content, { paddingBottom: spacing.xl + insets.bottom }];

  /**
   * Заявка, которой пишут причину отказа: вид и id. `null` — никому.
   * С видом, а не голым id: выходные и опоздания — разные таблицы, и id
   * у них совпадают.
   */
  const [rejecting, setRejecting] = useState<RequestRef | null>(null);
  const [reason, setReason] = useState('');

  const dayOffQuery = trpc.dayOff.list.useQuery({});
  const lateQuery = trpc.lateRequests.list.useQuery({});

  /*
    Обновляется всё, что меняет решение, а не только сами списки.

    Счётчик на «Руководстве» читает те же списки с `status: 'pending'` —
    `invalidate` без входа обновляет и его; весь роутер, а не `list`, —
    чтобы руководитель, снявший СВОЙ запрос, увидел это и в «Моих
    запросах». Выходной меняет табель — из него собрана карточка «Кто
    отдыхает» прямо на этом экране — и табло цеха. Опоздание, одобренное
    или снятое за сегодня или прошлый день, сервер пересчитывает, и
    меняются нарушения.
  */
  const refresh = async (): Promise<void> => {
    await Promise.all([
      utils.dayOff.invalidate(),
      utils.lateRequests.invalidate(),
      utils.notifications.list.invalidate(),
      utils.shifts.timesheet.invalidate(),
      utils.discipline.invalidate(),
      utils.monitor.invalidate(),
    ]);
  };

  const onDecided = async (): Promise<void> => {
    notifySuccess();
    setRejecting(null);
    setReason('');
    await refresh();
  };

  /*
    После отказа сервера список тоже перечитывается: чаще всего это
    «Запрос уже рассмотрен» — второй руководитель успел раньше, — и
    карточка с кнопками, которые уже ничего не сделают, не должна
    оставаться на экране.
  */
  const onFailed = (title: string, error: { readonly message: string }): void => {
    notifyError();
    Alert.alert(title, error.message);
    void refresh();
  };
  const onApproveError = (error: { readonly message: string }): void => {
    onFailed(m('approvals.approveError'), error);
  };
  const onRejectError = (error: { readonly message: string }): void => {
    onFailed(m('approvals.rejectError'), error);
  };
  const onWithdrawError = (error: { readonly message: string }): void => {
    onFailed(m('approvals.withdrawError'), error);
  };

  const onWithdrawn = async (): Promise<void> => {
    notifySuccess();
    await refresh();
  };

  const approveDayOff = trpc.dayOff.approve.useMutation({ onSuccess: onDecided, onError: onApproveError });
  const rejectDayOff = trpc.dayOff.reject.useMutation({ onSuccess: onDecided, onError: onRejectError });
  const approveLate = trpc.lateRequests.approve.useMutation({ onSuccess: onDecided, onError: onApproveError });
  const rejectLate = trpc.lateRequests.reject.useMutation({ onSuccess: onDecided, onError: onRejectError });
  const withdrawDayOff = trpc.dayOff.withdraw.useMutation({ onSuccess: onWithdrawn, onError: onWithdrawError });
  const withdrawLate = trpc.lateRequests.withdraw.useMutation({ onSuccess: onWithdrawn, onError: onWithdrawError });

  const isBusy =
    approveDayOff.isPending ||
    rejectDayOff.isPending ||
    approveLate.isPending ||
    rejectLate.isPending ||
    withdrawDayOff.isPending ||
    withdrawLate.isPending;

  /*
    Крутилка — только на той заявке, что решается сейчас. Прежде она
    вставала на «Одобрить» у всех ждущих разом, и было не понять, какую
    заявку одобрили.
  */
  const isApproving = (ref: RequestRef): boolean =>
    ref.kind === 'late'
      ? approveLate.isPending && approveLate.variables.id === ref.id
      : approveDayOff.isPending && approveDayOff.variables.id === ref.id;
  const isRejecting = (ref: RequestRef): boolean =>
    ref.kind === 'late'
      ? rejectLate.isPending && rejectLate.variables.id === ref.id
      : rejectDayOff.isPending && rejectDayOff.variables.id === ref.id;
  const isWithdrawing = (ref: RequestRef): boolean =>
    ref.kind === 'late'
      ? withdrawLate.isPending && withdrawLate.variables.id === ref.id
      : withdrawDayOff.isPending && withdrawDayOff.variables.id === ref.id;

  const approve = (ref: RequestRef): void => {
    if (ref.kind === 'late') approveLate.mutate({ id: ref.id });
    else approveDayOff.mutate({ id: ref.id });
  };
  const reject = (ref: RequestRef): void => {
    const payload = { id: ref.id, reason: reason.trim() };
    if (ref.kind === 'late') rejectLate.mutate(payload);
    else rejectDayOff.mutate(payload);
  };

  /*
    Снятие — только после подтверждения: оно не откатывается одним
    нажатием, а у опоздания ещё и пересчитывает нарушение. В тексте —
    кто и когда, чтобы было видно, ту ли карточку тронули, и что будет
    дальше: про опоздание сотрудник узнает сам (сервер шлёт уведомление),
    про выходной — нет, и предупредить его надо самому. Свой запрос
    руководитель снимает без «сотрудник получит уведомление»: сервер
    в этом случае его и не шлёт.
  */
  const confirmWithdraw = (ref: RequestRef, requester: Requester, period: string): void => {
    const isOwn = user !== null && requester.id === user.id;
    const name = requester.fullName;
    const title = ref.kind === 'late' ? m('approvals.withdrawLateTitle') : m('approvals.withdrawDayOffTitle');
    const body =
      ref.kind === 'late'
        ? isOwn
          ? m('approvals.withdrawLateBodyOwn', { period })
          : m('approvals.withdrawLateBody', { name, period })
        : isOwn
          ? m('approvals.withdrawDayOffBodyOwn', { period })
          : m('approvals.withdrawDayOffBody', { name, period });

    Alert.alert(title, body, [
      { text: m('approvals.withdrawKeep'), style: 'cancel' },
      {
        text: m('approvals.withdraw'),
        style: 'destructive',
        onPress: () => {
          if (ref.kind === 'late') withdrawLate.mutate({ id: ref.id });
          else withdrawDayOff.mutate({ id: ref.id });
        },
      },
    ]);
  };

  /*
    «Сегодня» — день цеха (Ташкент) по часам сервера, как его считает и
    сервер: часы телефона могут стоять в другом поясе или убежать.
  */
  const today = workshopDayIso(new Date(serverNow()));

  const items = mergeRequests(
    (dayOffQuery.data?.items ?? []).map((item) => ({ ...item, kind: 'dayOff' as const })),
    (lateQuery.data?.items ?? []).map((item) => ({ ...item, kind: 'late' as const })),
  );

  /*
    Сбой и загрузка — внутри своей карточки, а не вместо всего экрана.

    Прежде при обрыве связи экран целиком заменялся надписью по центру:
    пропадал и график «Кто отдыхает», который грузится отдельно и мог быть
    цел, а текстом шёл служебный ответ сервера, порой по-английски.
  */
  return (
    <ScrollView contentContainerStyle={contentStyle}>
      <TeamDaysOff />

      {dayOffQuery.isError || lateQuery.isError ? (
        <Card>
          <ErrorState />
        </Card>
      ) : dayOffQuery.data === undefined || lateQuery.data === undefined ? (
        <Card>
          <Skeleton />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Empty message={m('approvals.none')} hint={m('approvals.noneHint')} />
        </Card>
      ) : (
        items.map((item) => {
          const ref: RequestRef = { kind: item.kind, id: item.id };
          const isPending = item.status === DayOffStatus.PENDING;
          const isOpen = rejecting !== null && sameRef(rejecting, ref);
          const period =
            item.kind === 'late'
              ? latePeriod(item.date, item.arriveBy, m)
              : dayOffPeriod(item.startDate, item.endDate);
          /*
            Просьба опоздать СЕГОДНЯ — отметкой у даты. Список идёт по
            времени подачи, и вчерашняя просьба на сегодня оказывалась ниже
            свежих на следующую неделю: директор пролистывал её, а решать
            надо было до начала смены.

            Только у ждущих решения: отметка зовёт решить сейчас, а у
            отозванной, отклонённой или одобренной карточки решать нечего —
            там она шум, и среди закрытых терялась единственная живая.
          */
          const isToday = isPending && item.kind === 'late' && item.date === today;

          return (
            <Card key={`${item.kind}:${item.id.toString()}`}>
              <CardTitle
                title={item.requester.fullName}
                icon="person"
                action={
                  <Pill text={t(DAY_OFF_STATUS_LABELS, item.status)} tone={requestStatusTone(item.status)} />
                }
              />

              <RequestKindLabel kind={item.kind} />
              <View style={styles.periodRow}>
                <Text style={styles.dates}>{period}</Text>
                {isToday && <Pill text={m('approvals.today')} tone="accent" />}
              </View>

              {item.reason !== null && <Text style={styles.reason}>{item.reason}</Text>}

              {item.rejectionReason !== null && (
                <Text style={styles.decision}>
                  {m('dayoff.rejection', { reason: item.rejectionReason })}
                </Text>
              )}

              {isPending && !isOpen && (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => {
                      setRejecting(ref);
                      setReason('');
                    }}
                    disabled={isBusy}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonGhost,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    <Text style={styles.buttonGhostText}>{m('approvals.reject')}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      approve(ref);
                    }}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isBusy, busy: isApproving(ref) }}
                    style={({ pressed }) => [
                      styles.button,
                      styles.buttonPrimary,
                      pressed ? styles.buttonPressed : null,
                    ]}
                  >
                    {isApproving(ref) ? (
                      <ActivityIndicator color={colors.onAccent} size="small" />
                    ) : (
                      <Text style={styles.buttonPrimaryText}>{m('approvals.approve')}</Text>
                    )}
                  </Pressable>
                </View>
              )}

              {/*
                «Снять» — ссылкой, а не третьей большой кнопкой: одобренных в
                истории много, и полноширинная кнопка в каждой карточке
                превратила бы историю в стену кнопок. Вид и размер — как у
                «Отозвать» в «Моих запросах»: та же операция над запросом,
                та же красная подпись, зона нажатия в полные 44 точки.
              */}
              {item.status === DayOffStatus.APPROVED && (
                <Pressable
                  onPress={() => {
                    confirmWithdraw(ref, item.requester, period);
                  }}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel={m('approvals.withdrawA11y', { name: item.requester.fullName, period })}
                  accessibilityState={{ disabled: isBusy, busy: isWithdrawing(ref) }}
                  style={({ pressed }) => [styles.withdrawLink, pressed ? styles.buttonPressed : null]}
                >
                  {isWithdrawing(ref) ? (
                    <ActivityIndicator color={colors.danger} size="small" />
                  ) : (
                    <Text style={styles.withdrawText}>{m('approvals.withdraw')}</Text>
                  )}
                </Pressable>
              )}

              {isOpen && (
                <View style={styles.rejectBox}>
                  <Text style={styles.rejectLabel}>{m('approvals.why')}</Text>
                  <Input
                    value={reason}
                    onChangeText={setReason}
                    placeholder={m('approvals.whyPlaceholder')}
                    multiline
                    autoFocus
                  />

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => {
                        setRejecting(null);
                        setReason('');
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.button,
                        styles.buttonGhost,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      <Text style={styles.buttonGhostText}>{m('common.cancel')}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        reject(ref);
                      }}
                      disabled={reason.trim().length === 0 || isBusy}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: reason.trim().length === 0 || isBusy, busy: isRejecting(ref) }}
                      style={({ pressed }) => [
                        styles.button,
                        styles.buttonDanger,
                        reason.trim().length === 0 ? styles.buttonOff : null,
                        pressed ? styles.buttonPressed : null,
                      ]}
                    >
                      {isRejecting(ref) ? (
                        <ActivityIndicator color={colors.onAccent} size="small" />
                      ) : (
                        <Text style={styles.buttonPrimaryText}>{m('approvals.reject')}</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

/** Какая заявка: вид и id внутри своего вида. */
interface RequestRef {
  readonly kind: RequestKind;
  readonly id: number;
}

function sameRef(a: RequestRef, b: RequestRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Кто просит — как его отдают оба списка (`dayOff.list`, `lateRequests.list`). */
interface Requester {
  readonly id: number;
  readonly fullName: string;
}

/**
 * Насколько зона нажатия ссылки «Снять» выступает за строку текста сверху и
 * снизу. Отрицательный отступ возвращает карточке прежнюю высоту: ссылка
 * крупнее для пальца, но не для глаза (как «Отозвать» в `DayOffScreen`).
 */
const LINK_BLEED = (sizes.touchTarget - typography.caption.lineHeight) / 2;

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  /*
    Дата и «сегодня» — одной строкой, с переносом: «12.11, до 10:30» на
    узбекском длиннее, и на узком экране метка уходит на вторую строку,
    а не выдавливает дату за край.
  */
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  dates: {
    ...typography.value,
    color: colors.textPrimary,
  },
  reason: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  decision: {
    ...typography.caption,
    // Причина отказа — терракотой, как у сотрудника: это отказ, а не сноска.
    color: colors.danger,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  /*
    Кнопки — общей системы приложения (`SubmitButton`): высота кнопки
    действия, таблетка, подпись основным кеглем жирным начертанием. Своя
    здесь только пара в ряд и цвет «Отклонить» — общая кнопка не умеет ни
    того, ни другого. Было скругление 14 и полужирный — рядом с таблетками
    соседних экранов кнопки выглядели взятыми из другого набора.
  */
  button: {
    flex: 1,
    minHeight: sizes.buttonHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Одна прозрачность «недоступно» на всё приложение — как у `SubmitButton`.
  buttonOff: {
    opacity: opacity.disabled,
  },
  buttonPressed: {
    opacity: opacity.pressed,
  },
  buttonPrimaryText: {
    ...typography.body,
    // Насыщенность — семейством: вес на Medium браузер рисует поддельным жирным.
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.onAccent,
    textAlign: 'center',
  },
  buttonGhostText: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  withdrawLink: {
    alignSelf: 'flex-start',
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    justifyContent: 'center',
    // Подпись — в 8 точках под текстом выше, как у «Отозвать».
    marginTop: spacing.sm - LINK_BLEED,
    marginBottom: -LINK_BLEED,
  },
  // Вид ссылок в шапках карточек (`CardLink`), только красный: снятие отменяет решение.
  withdrawText: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.danger,
  },
  rejectBox: {
    marginTop: spacing.md,
  },
  rejectLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
