import { formatIsoDateShort, formatTime, SHIFT_ACTIVITY_LABELS } from '@curtain-crm/shared';
import type { ReactElement } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, CardTitle, Empty, ErrorState, Pill, Skeleton } from '../components/Card';
import { Icon } from '../components/Icon';
import { InstallationTripCard } from '../components/InstallationTripCard';
import { ShiftControl } from '../components/ShiftControl';
import { useIsCeo } from '../hooks/useAuth';
import { serverNow } from '../lib/serverClock';
import { trpc } from '../lib/trpc';
import { colors, hairline, spacing, tabBarSpace, typography } from '../theme';
import { useLocale, type Translate } from '../hooks/useLocale';

/**
 * Явка цеха глазами руководителя: кто сейчас в цеху и чем занят, кто уже
 * ушёл, и что ждёт установки.
 *
 * Список — тот же `shifts.openNow`, что и на главной: одна выдача, одна
 * цифра «на смене» везде. У каждого — во сколько пришёл и дело: «шьёт
 * DH-0012», «на установке DH-0013». Дело выводится из заказов, а не
 * спрашивается у человека: заказ «в пошиве» на швее — значит, шьёт.
 *
 * Своей смены директора здесь нет: карточка «Проведите, чтобы начать смену»
 * первой строкой мешала смотреть цех, владелец её зачеркнул. Отмечается он
 * в профиле — там всё, что про него самого. Админ — сотрудник цеха и
 * отмечается вместе со всеми, ему карточка остаётся здесь.
 */
export function AttendanceScreen(): ReactElement {
  const { m, t } = useLocale();
  const isCeo = useIsCeo();

  const roster = trpc.shifts.openNow.useQuery();
  const queue = trpc.orders.installationQueue.useQuery();
  const current = trpc.shifts.current.useQuery(undefined, { enabled: !isCeo });

  const refresh = (): void => {
    void roster.refetch();
    void queue.refetch();
  };

  /*
    Сбой загрузки — внутри своей карточки, а не вместо всего экрана.

    Раньше при обрыве связи экран целиком заменялся надписью: пропадала и
    своя смена админа, а выйти из ошибки можно было только уходом с
    вкладки — обещанного «потяните вниз» у голой надписи не было. Теперь
    прокрутка с обновлением остаётся, смена работает, а в карточке —
    кнопка «Повторить». Текст сервера в карточку не идёт: служебный ответ
    бывает по-английски («Internal server error») и ничего не объясняет.
  */
  const rows = roster.data ?? [];
  const working = rows.filter((row) => row.endedAt === null);
  const finished = rows.filter((row) => row.endedAt !== null);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={roster.isFetching && !roster.isLoading}
          onRefresh={refresh}
          tintColor={colors.accent}
        />
      }
    >
      {!isCeo && (
        <ShiftControl showTimer={false}>
          <InstallationTripCard shiftOpen={(current.data ?? null) !== null} />
        </ShiftControl>
      )}

      <Card>
        <CardTitle title={m('attendance.now')} icon="people" />

        {roster.isError ? (
          <ErrorState />
        ) : roster.data === undefined ? (
          <Skeleton />
        ) : working.length === 0 ? (
          <Empty message={m('attendance.nobodyOpened')} hint={m('attendance.nobodyOpenedHint')} />
        ) : (
          working.map((row, index) => {
            /*
              Дело важнее перерыва: «на установке DH-0013» отвечает, где
              человек, перерыв — только чем занят. Без заказа на руках —
              сколько уже в цеху.

              Перерыв и выезд без заказа строкой не повторяются: их уже
              называет плашка справа, и «с 06:52 · перерыв» рядом с
              «Перерыв» говорило одно и то же дважды. Вместо повтора —
              сколько человек в цеху.
            */
            const doing =
              row.activity !== null && row.activityOrder !== null
                ? `${t(SHIFT_ACTIVITY_LABELS, row.activity)} ${row.activityOrder}`
                : row.activity !== null && !row.onTrip && !row.onBreak
                  ? t(SHIFT_ACTIVITY_LABELS, row.activity)
                  : elapsed(row.startedAt, m);

            return (
              <View
                key={`${row.userId.toString()}-${row.startedAt.toISOString()}`}
                style={[styles.row, index === working.length - 1 ? styles.rowLast : null]}
              >
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  <Text style={styles.meta}>
                    {m('attendance.sinceDoing', { start: clock(row.startedAt), doing })}
                  </Text>
                </View>

                <Pill
                  text={
                    row.onTrip
                      ? m('attendance.trip')
                      : row.onBreak
                        ? m('attendance.break')
                        : m('attendance.working')
                  }
                  tone={row.onTrip ? 'info' : row.onBreak ? 'warning' : 'positive'}
                />
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <CardTitle title={m('attendance.queue')} icon="orders" />

        {queue.isError ? (
          <ErrorState />
        ) : queue.data === undefined ? (
          <Skeleton rows={2} />
        ) : queue.data.length === 0 ? (
          <Empty message={m('attendance.queueEmpty')} />
        ) : (
          /*
            Установщик — третьей строкой под адресом, а не колонкой справа.
            Колонка забирала до 40% ширины, и адрес — то, ради чего очередь
            смотрят, — обрезался многоточием на «ул. Буюк …» в половине
            строк. Теперь адрес идёт во всю ширину и целиком.
          */
          queue.data.map((order, index, all) => (
            <View
              key={order.id}
              style={[styles.row, styles.queueRow, index === all.length - 1 ? styles.rowLast : null]}
            >
              <Text style={styles.name} numberOfLines={1}>
                {order.orderNumber}
                <Text style={styles.metaInline}>
                  {` · ${order.deadline === null ? m('attendance.noDeadline') : formatIsoDateShort(order.deadline)}`}
                </Text>
              </Text>
              <Text style={styles.meta}>{order.installAddress ?? m('attendance.noAddress')}</Text>
              <View style={styles.installerRow}>
                <Icon
                  name="person"
                  size={14}
                  color={order.installerName === null ? colors.textMuted : colors.accent}
                />
                <Text
                  style={order.installerName === null ? styles.unassigned : styles.installer}
                  numberOfLines={1}
                >
                  {order.installerName ?? m('attendance.noInstaller')}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      {/* При сбое о нём уже сказала карточка «Сейчас в цеху» — вторая такая
          же ошибка с кнопкой ниже была бы повтором. */}
      {!roster.isError && (
        <Card>
          <CardTitle title={m('attendance.left')} icon="shift" />

          {roster.data === undefined ? (
            <Skeleton rows={2} />
          ) : finished.length === 0 ? (
            <Empty message={m('attendance.nobodyClosed')} />
          ) : (
            finished.map((row, index) => (
              <View
                key={`${row.userId.toString()}-${row.startedAt.toISOString()}`}
                style={[styles.row, index === finished.length - 1 ? styles.rowLast : null]}
              >
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.fullName}
                  </Text>
                  <Text style={styles.meta}>
                    {`${clock(row.startedAt)} — ${
                      row.endedAt === null ? '' : clock(row.endedAt)
                    } · ${worked(row.startedAt, row.endedAt, m)}`}
                    {/* Закрыл сервер, не человек: уход не отмечен, время условное. */}
                    {row.autoClosed ? ` · ${m('home.autoClosed')}` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>
      )}

      {/* Людей, не смен: кто отлучался и вернулся — открыл вторую, но он один. */}
      {roster.data !== undefined && (
        <Text style={styles.note}>
          {m('attendance.note', { n: new Set(rows.map((row) => row.userId)).size })}
        </Text>
      )}
    </ScrollView>
  );
}

const clock = (value: Date): string => formatTime(value);

/** Сколько прошло с начала смены — в часах и минутах. */
function elapsed(startedAt: Date, m: Translate): string {
  return humanize(serverNow() - startedAt.getTime(), m);
}

function worked(startedAt: Date, endedAt: Date | null, m: Translate): string {
  if (endedAt === null) return '';
  return humanize(endedAt.getTime() - startedAt.getTime(), m);
}

function humanize(ms: number, m: Translate): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0
    ? m('shift.minutes', { n: minutes })
    : m('shift.hoursMinutes', { h: hours, m: minutes % 60 });
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  // Разделитель — только между строками: под последней он висел линией в
  // 16 точках над скруглённым низом карточки.
  rowLast: {
    borderBottomWidth: 0,
  },
  // Строка очереди — столбиком: номер, адрес, установщик.
  queueRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
  },
  installerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...typography.body,
    color: colors.textPrimary,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  metaInline: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  installer: {
    ...typography.caption,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  unassigned: {
    ...typography.caption,
    color: colors.textMuted,
    flexShrink: 1,
  },
  note: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
