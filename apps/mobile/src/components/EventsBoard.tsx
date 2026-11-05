import { formatIsoDateShort, todayIso } from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { useIsManagement } from '../hooks/useAuth';
import { useLocale, type Translate } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, opacity, radius, sizes, spacing, typography, fonts } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Card, CardLink, CardTitle } from './Card';
import { DateField } from './DateField';
import { Field, Input } from './Field';
import { Icon } from './Icon';
import { SubmitButton } from './SubmitButton';

/**
 * Ближайшие события: мероприятия, дни рождения, выходные.
 *
 * Единственное место в приложении, где сотрудник видит не работу, а людей.
 * Поэтому плитки крупные и с фотографией: список фамилий никого не заставит
 * подойти и поздравить, а лицо — заставит.
 *
 * Плиток всегда три. Владелец обвёл пустое место справа от единственного
 * именинника: ряд из одной карточки выглядит поломанным. Пустые места
 * занимает «+ Мероприятие» — руководство добавляет своё событие прямо
 * оттуда, остальные видят тихую подпись «пока пусто».
 *
 * Возраст не показывается. Дата и «через сколько» — всё, что нужно, чтобы
 * поздравить; объявлять всему цеху, сколько человеку лет, для этого не
 * требуется. Руководству возраст по-прежнему виден в панели.
 */

/** Сколько плиток в ряду всегда: меньше — ряд выглядит недоделанным. */
const SLOTS = 3;

export interface StaffEvent {
  readonly id: string;
  readonly kind: 'birthday' | 'event';
  /** Мероприятие, которое можно убрать; у дней рождения и выходных — `null`. */
  readonly eventId: number | null;
  readonly title: string;
  readonly subtitle: string | null;
  /** Дата события: день рождения, первый день выходных или день мероприятия. */
  readonly date: string;
  readonly endDate: string | null;
  readonly daysUntil: number;
  readonly photoUrl: string | null;
}

/*
  «сегодня» / «завтра» / «5 дней» — человеческий счёт, а не голое число.

  Без «через»: плитка узкая, три в ряд, и «через 41 день» переносилось на
  вторую строку, наезжая на дату. Под строкой и так стоит день и месяц,
  так что предлог ничего не добавлял.
*/
function whenLabel(daysUntil: number, m: Translate): string {
  if (daysUntil === 0) return m('birthday.today');
  if (daysUntil === 1) return m('birthday.tomorrow');

  /*
    Склонение по последней цифре: 1 → «день», 2–4 → «дня», остальное →
    «дней». Одиннадцатый–четырнадцатый — исключение, там всегда «дней»,
    иначе выходило «через 41 дней».
  */
  const tail = daysUntil % 10;
  const teen = daysUntil % 100 >= 11 && daysUntil % 100 <= 14;
  const word = teen
    ? m('birthday.day5')
    : tail === 1
      ? m('birthday.day1')
      : tail >= 2 && tail <= 4
        ? m('birthday.day2')
        : m('birthday.day5');
  return m('birthday.inDays', { n: daysUntil, word });
}

function initials(title: string): string {
  return title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function EventsBoard({
  events,
  isLoading,
}: {
  readonly events: readonly StaffEvent[];
  readonly isLoading: boolean;
}): ReactElement {
  const { m } = useLocale();
  const isManager = useIsManagement();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => todayIso());
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);
  /*
    Ширина плитки — ровно треть ряда, посчитанная от его настоящей ширины.

    Плитки росли от `minWidth: 96`, а три таких с промежутками (304) не
    влезали во внутреннюю ширину карточки на 360 точках (296): ряд
    ломался «две и одна», и третья плитка растягивалась на всю ширину.
    Фиксированная треть держит три в ряд на любом телефоне, а четвёртое
    событие переносится вниз той же ширины, не растягиваясь.

    До первого замера — оценка в процентах (`personEstimate`), тоже по три
    в ряд. Прежняя заглушка делила ширину поровну между ВСЕМИ плитками без
    переноса: при четырёх событиях первый кадр показывал четыре сжатые
    плитки в одну строку, и они перепрыгивали в ряды, как только приходил
    замер, — при каждом появлении доски.
  */
  const [tileWidth, setTileWidth] = useState<number | null>(null);
  const onRowLayout = (event: LayoutChangeEvent): void => {
    const width = Math.floor((event.nativeEvent.layout.width - spacing.sm * (SLOTS - 1)) / SLOTS);
    setTileWidth((current) => (current === width ? current : width));
  };
  const tileSize = tileWidth === null ? styles.personEstimate : { width: tileWidth };

  const create = trpc.events.create.useMutation({
    async onSuccess() {
      notifySuccess();
      setOpen(false);
      setTitle('');
      setDescription('');
      setPhoto(null);
      setDate(todayIso());
      await utils.events.upcoming.invalidate();
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const remove = trpc.events.remove.useMutation({
    async onSuccess() {
      notifySuccess();
      await utils.events.upcoming.invalidate();
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const pickPhoto = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(m('photo.noAccess'), m('photo.allowGallery'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
      exif: false,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset?.base64 == null) {
      Alert.alert(m('photo.readError'), m('common.tryAgain'));
      return;
    }
    setPhoto({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  /* Ряд всегда из трёх мест: события слева, пустые места — справа. */
  const blanks = Math.max(0, SLOTS - events.length);

  return (
    <Card>
      <CardTitle
        title={m('events.title')}
        icon="calendar"
        /* Общая ссылка шапки: цель 44 точки и подпись одной строкой —
           прежде «+» и «Мероприятие» расходились на две строки. */
        action={
          isManager ? (
            <CardLink
              label={m('events.add')}
              onPress={() => {
                setOpen(true);
              }}
            />
          ) : undefined
        }
      />

      {/*
        Заглушка — те же три плитки, что приедут: фото, две строки имени,
        две строки должности, срок и дата. Общий `Skeleton` — полосы
        «подпись — значение» высотой около 130 точек — сменялся плитками
        выше двухсот, и всё, что ниже доски, прыгало вниз.
      */}
      {isLoading ? (
        <View style={styles.row} onLayout={onRowLayout}>
          {Array.from({ length: SLOTS }, (_, index) => (
            <View key={`ghost-${index.toString()}`} style={[styles.person, tileSize]}>
              <View style={styles.photo} />
              <View style={[styles.ghostSlot, styles.ghostName]}>
                <View style={[styles.ghostBar, styles.ghostBarWide]} />
              </View>
              <View style={[styles.ghostSlot, styles.ghostJob]}>
                <View style={styles.ghostBar} />
              </View>
              <View style={[styles.ghostSlot, styles.ghostWhen]}>
                <View style={styles.ghostBar} />
              </View>
              <View style={[styles.ghostSlot, styles.ghostDate]} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.row} onLayout={onRowLayout}>
          {events.map((item) => {
            const isSoon = item.daysUntil === 0;
            const highlight = isSoon;

            return (
              <View
                key={item.id}
                style={[styles.person, tileSize, highlight ? styles.personToday : null]}
              >
                {item.photoUrl === null ? (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <Text style={styles.initials}>{initials(item.title)}</Text>
                  </View>
                ) : (
                  <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" />
                )}

                <Text style={styles.name} numberOfLines={2}>
                  {item.title}
                </Text>

                {/* Строка должности есть всегда, пустая — тоже: иначе у
                    мероприятия без подписи дата вставала выше, чем у соседей.
                    Две строки: «Продавец-консультант» в одну не входит. */}
                <Text style={styles.jobTitle} numberOfLines={2}>
                  {item.subtitle ?? ''}
                </Text>

                <Text style={[styles.when, highlight ? styles.whenToday : null]} numberOfLines={1}>
                  {isSoon ? m('birthday.todayMark') : whenLabel(item.daysUntil, m)}
                </Text>
                <Text style={styles.date}>
                  {/* Событие на несколько дней — диапазоном: «24.09 – 26.09». */}
                  {item.endDate === null || item.endDate === item.date
                    ? formatIsoDateShort(item.date)
                    : `${formatIsoDateShort(item.date)} – ${formatIsoDateShort(item.endDate)}`}
                </Text>

                {/* Убрать можно только своё мероприятие: дни рождения не отменишь. */}
                {isManager && item.eventId !== null && (
                  <Pressable
                    onPress={() => {
                      Alert.alert(m('events.removeTitle'), item.title, [
                        { text: m('common.cancel'), style: 'cancel' },
                        {
                          text: m('events.remove'),
                          style: 'destructive',
                          onPress: () => {
                            remove.mutate({ id: item.eventId ?? 0 });
                          },
                        },
                      ]);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${m('events.remove')}: ${item.title}`}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>{m('events.remove')}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {Array.from({ length: blanks }, (_, index) =>
            isManager ? (
              <Pressable
                key={`blank-${index.toString()}`}
                onPress={() => {
                  setOpen(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.person,
                  tileSize,
                  styles.blank,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Icon name="calendar" size={22} color={colors.accent} />
                <Text style={styles.blankText}>{m('events.add')}</Text>
              </Pressable>
            ) : (
              <View key={`blank-${index.toString()}`} style={[styles.person, tileSize, styles.blank]}>
                <Text style={styles.blankQuiet}>{m('events.empty')}</Text>
              </View>
            ),
          )}
        </View>
      )}

      <Text style={styles.footnote}>{m('birthday.horizon')}</Text>

      <BottomSheet
        visible={open}
        title={m('events.newTitle')}
        onClose={() => {
          setOpen(false);
        }}
      >
        <Field label={m('events.name')} required>
          <Input value={title} onChangeText={setTitle} placeholder={m('events.namePlaceholder')} />
        </Field>

        <Field label={m('events.date')} required>
          <DateField
            value={date}
            onChange={setDate}
            placeholder={m('events.date')}
            emptyText={m('common.datePlaceholder')}
          />
        </Field>

        <Field label={m('events.note')}>
          <Input value={description} onChangeText={setDescription} placeholder={m('events.notePlaceholder')} />
        </Field>

        <Pressable
          onPress={() => {
            void pickPhoto();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.photoPick, pressed ? styles.pressed : null]}
        >
          {photo === null ? (
            <>
              <Icon name="camera" size={18} color={colors.accent} />
              <Text style={styles.photoPickText}>{m('events.photo')}</Text>
            </>
          ) : (
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} resizeMode="cover" />
          )}
        </Pressable>

        <SubmitButton
          label={m('events.save')}
          onPress={() => {
            create.mutate({
              title: title.trim(),
              startDate: date,
              ...(description.trim() === '' ? {} : { description: description.trim() }),
              ...(photo === null ? {} : { photo: { mimeType: photo.mimeType, content: photo.base64 } }),
            });
          }}
          disabled={title.trim() === ''}
          pending={create.isPending}
        />
      </BottomSheet>
    </Card>
  );
}

/** Имя и должность — по две строки сноски, всегда: даты встают на одну высоту. */
const TWO_FOOTNOTE_LINES = typography.footnote.lineHeight * 2;
/** Зазор между именем и должностью: должность — продолжение имени. */
const JOB_GAP = 2;
/** Высота строки «через сколько» — постоянная: дата под ней у всех плиток на одной высоте. */
const WHEN_LINE = 17;

const styles = StyleSheet.create({
  /*
    Плитки делят ширину ряда на три равные доли (см. `onRowLayout`), а не
    растут от минимальной ширины: та не помещалась втроём на узком экране.
    Четвёртая и дальше (мероприятие рядом с именинниками) переносятся вниз
    той же шириной.
  */
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  person: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  /*
    До первого замера ряда — треть в процентах. 31% × 3 плюс два
    промежутка по 8 меньше ширины ряда на любом телефоне от 320 точек, так
    что ряд сразу ложится по три, а замер потом добавляет плитке точку-две.
  */
  personEstimate: {
    width: '31%',
  },
  // Событие дня выделяем фоном, а не только подписью: карточка должна
  // цеплять взгляд с первого экрана, иначе поздравят те же, кто и так помнит.
  personToday: {
    backgroundColor: colors.accentSoft,
    ...cardShadow,
  },
  blank: {
    justifyContent: 'center',
    minHeight: 148,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  blankText: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  blankQuiet: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: opacity.pressed,
  },
  photo: {
    width: 56,
    // Формат корпоративной съёмки — тот же, что в профиле (309×433).
    aspectRatio: 309 / 433,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.bold,
    fontSize: 20,
    fontWeight: '700',
    color: colors.accentStrong,
  },
  /*
    У каждой строки своя постоянная высота, а не «сколько займёт текст».

    Иначе плитки стояли криво: у одного фамилия в две строки, у другого в
    одну, у именинника дня подпись жирнее — и дата в каждой плитке
    оказывалась на своей высоте. Две строки под фамилию хватает и самой
    длинной: шрифт подобран так, чтобы «Palvannazirova» помещалась целиком
    и не рвалась посередине слова.
  */
  /*
    Кегли — не меньше 12: имя, должность и дата — то, что читают, а 10 и
    11,5 на телефоне в цеху уже щурятся. Высоты строк заданы под этот кегль.
  */
  name: {
    ...typography.footnote,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    height: TWO_FOOTNOTE_LINES,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  jobTitle: {
    ...typography.footnote,
    height: TWO_FOOTNOTE_LINES,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: JOB_GAP,
  },
  when: {
    ...typography.caption,
    lineHeight: WHEN_LINE,
    height: WHEN_LINE,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  whenToday: {
    fontFamily: fonts.bold,
    color: colors.accentStrong,
    fontWeight: '700',
  },
  date: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  removeButton: {
    // Цель в палец ростом; подпись по центру. Без `hitSlop`: в браузере его
    // нет, размер цели — только сама коробка.
    minHeight: sizes.touchTarget,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: {
    ...typography.footnote,
    color: colors.danger,
  },
  photoPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  photoPickText: {
    ...typography.caption,
    color: colors.accent,
  },
  photoPreview: {
    width: '100%',
    height: 140,
    borderRadius: radius.md,
  },
  footnote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  /*
    Заглушка плитки: каждая «строка» — той же высоты и с тем же отступом,
    что строка настоящей плитки, поэтому заглушка ровно её роста.
  */
  ghostSlot: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostName: {
    height: TWO_FOOTNOTE_LINES,
    marginTop: spacing.sm,
  },
  ghostJob: {
    height: TWO_FOOTNOTE_LINES,
    marginTop: JOB_GAP,
  },
  ghostWhen: {
    height: WHEN_LINE,
    marginTop: spacing.xs,
  },
  ghostDate: {
    height: typography.footnote.lineHeight,
  },
  ghostBar: {
    width: '55%',
    height: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  ghostBarWide: {
    width: '75%',
  },
});
