import { formatTime, parseMoney, todayIso } from '@curtain-crm/shared';
import { useEffect, useState, type ReactElement } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle, Empty, ErrorState, Skeleton } from '../components/Card';
import { DateField } from '../components/DateField';
import { Field } from '../components/Field';
import { PayTypeBadge } from '../components/PayTypeBadge';
import { TerminalDaySummary } from '../components/TerminalDaySummary';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, fonts, radius, spacing, typography } from '../theme';

/**
 * Терминальные чеки за день — с фото.
 *
 * Руководитель открывает с главной по «Подробнее»: там только кто, сколько
 * и когда; здесь — сами чеки, как их сняли. Фото во всю ширину: цифры на
 * чеке мелкие, и превью-квадратик читать пришлось бы через увеличение.
 *
 * Под «День» — сумма чеков за день с разбивкой по типам оплаты, у чека —
 * значок типа под именем (просьба заказчика 05.11).
 */
export function TerminalChecksScreen(): ReactElement {
  const { m, money } = useLocale();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(() => todayIso());
  const query = trpc.terminalChecks.byDay.useQuery({ day });
  /*
    «Сегодня N из 3» — только про сегодня. За прошлый день подпись
    показывала «Сегодня 4 из 3» — вчерашние чеки под словом «сегодня».
    Для прошлого дня — то же «N из 3», но без «сегодня»: выполнил ли
    продавец норму в тот день, руководитель и спрашивает, листая дни назад.
  */
  const isToday = day === todayIso();
  const summary = query.data?.summary;
  const hasSummary = summary != null && summary.count > 0;

  return (
    <ScrollView
      /*
        Экран открыт поверх вкладок: снизу — обычный отступ и безопасная
        зона, а не место под панель вкладок, которой здесь нет (было 114
        точек пустоты под последним чеком).
      */
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Card>
        <CardTitle
          title={m('terminal.title')}
          icon="paid"
          action={
            query.data === undefined ? undefined : (
              <Text style={styles.total}>
                {m(isToday ? 'terminal.progress' : 'terminal.dayProgress', {
                  n: query.data.count,
                  target: query.data.target,
                })}
              </Text>
            )
          }
        />
        {/* Без итогов под ним поле — последнее в карточке, и его нижний отступ не нужен. */}
        <Field label={m('terminal.day')} last={!hasSummary}>
          {/*
            День нужен всегда, поэтому «очистить» у поля нет: прежний крестик
            ничего не стирал — пустую дату тут же подменял сегодняшний день.
            С пустой датой сервер отвечал 400, а экран показывал «Чеков за
            этот день нет» — сбой выглядел как пустой день; подмена на
            сегодня осталась на всякий случай.
          */}
          <DateField
            value={day}
            onChange={(value) => {
              setDay(value === '' ? todayIso() : value);
            }}
            placeholder={m('terminal.day')}
            clearable={false}
          />
        </Field>
        {hasSummary && <TerminalDaySummary summary={summary} title={m('terminal.dayTotal')} />}
      </Card>

      {/*
        Сбой — ошибкой, а не пустым днём: «Чеков за этот день нет» при
        упавшем запросе читалось как «сегодня никто не пробивал». Текст —
        свой, локализованный: ответ сервера при сбое бывает служебным
        английским («Missing result»).
      */}
      {query.isError ? (
        <Card>
          <ErrorState />
        </Card>
      ) : query.isLoading ? (
        <Card>
          <Skeleton rows={3} />
        </Card>
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <Card>
          <Empty message={m('terminal.noChecks')} />
        </Card>
      ) : (
        query.data?.rows.map((row) => (
          <Card key={row.id}>
            {/*
              Строение у всех чеков одно: имя и сумма — первой строкой, тип
              оплаты и время — второй, комментарий — под ними. Раньше значок
              типа стоял в строке имени с переносом: на 360 точках у длинного
              имени он падал на свою строку, и в одном списке карточки были
              то в две строки, то в три, а сумма «плавала» по высоте.
            */}
            <View style={styles.headLine}>
              <Text style={styles.name} numberOfLines={1}>
                {row.fullName}
              </Text>
              <Text style={styles.amount}>{money(parseMoney(row.amount))}</Text>
            </View>
            <View style={styles.metaLine}>
              <PayTypeBadge type={row.payType} />
              <Text style={styles.time}>{formatTime(row.createdAt)}</Text>
            </View>
            {row.comment !== null && <Text style={styles.comment}>{row.comment}</Text>}
            {row.photoUrl !== null && <CheckPhoto uri={row.photoUrl} label={m('terminal.photo')} />}
          </Card>
        ))
      )}
    </ScrollView>
  );
}

/** Пропорции, пока снимок не загрузился: чек снимают стоя. */
const DEFAULT_PHOTO_RATIO = 3 / 4;
/*
  Пределы пропорций: очень длинный чек не должен растягивать карточку на
  несколько экранов, а панорама — сплющиваться в полоску.
*/
const MIN_PHOTO_RATIO = 9 / 16;
const MAX_PHOTO_RATIO = 4 / 3;

/**
 * Фото чека в пропорциях самого снимка.
 *
 * Рамка была 3:4 при снимках 434×540, и фото с `contain` садилось в неё с
 * бежевыми полосами по 13 точек сверху и снизу: прямоугольный снимок в
 * скруглённой рамке выглядел вклеенным. Теперь рамка берёт пропорции
 * снимка, и скругление ложится на само фото.
 */
function CheckPhoto({ uri, label }: { readonly uri: string; readonly label: string }): ReactElement {
  const [ratio, setRatio] = useState(DEFAULT_PHOTO_RATIO);

  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (!alive || width <= 0 || height <= 0) return;
        setRatio(Math.min(MAX_PHOTO_RATIO, Math.max(MIN_PHOTO_RATIO, width / height)));
      },
      () => {
        // Размер не узнали — остаётся рамка по умолчанию, фото в ней целиком.
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  return (
    <Image
      source={{ uri }}
      style={[styles.photo, { aspectRatio: ratio }]}
      resizeMode="contain"
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  // Вес — семейством: `fontWeight` поверх Medium браузер дорисовывает ложным жирным.
  total: {
    ...typography.caption,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accent,
  },
  headLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  name: {
    ...typography.body,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  amount: {
    ...typography.value,
    color: colors.textPrimary,
    flexShrink: 0,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  time: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  comment: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // Отступ — у фото, а не под шапкой: у чека без фото низ карточки был
  // на 8 точек толще верха.
  photo: {
    width: '100%',
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
