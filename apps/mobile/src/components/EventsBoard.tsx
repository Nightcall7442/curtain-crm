import { formatIsoDateShort, todayIso } from '@curtain-crm/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState, type ReactElement } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsManagement } from '../hooks/useAuth';
import { useLocale, type Translate } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { cardShadow, colors, opacity, radius, spacing, typography, fonts } from '../theme';

import { BottomSheet } from './BottomSheet';
import { Card, CardTitle, Skeleton } from './Card';
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
        action={
          isManager ? (
            <Pressable
              onPress={() => {
                setOpen(true);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.addLink}>{m('events.add')}</Text>
            </Pressable>
          ) : undefined
        }
      />

      {isLoading ? (
        <Skeleton />
      ) : (
        <View style={styles.row}>
          {events.map((item) => {
            const isSoon = item.daysUntil === 0;
            const highlight = isSoon;

            return (
              <View key={item.id} style={[styles.person, highlight ? styles.personToday : null]}>
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

                {item.subtitle !== null && (
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}

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
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={m('events.remove')}
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
                style={({ pressed }) => [styles.person, styles.blank, pressed ? styles.pressed : null]}
              >
                <Icon name="calendar" size={22} color={colors.accent} />
                <Text style={styles.blankText}>{m('events.add')}</Text>
              </Pressable>
            ) : (
              <View key={`blank-${index.toString()}`} style={[styles.person, styles.blank]}>
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
          <DateField value={date} onChange={setDate} placeholder={m('events.date')} />
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

const styles = StyleSheet.create({
  /*
    Плитки делят ширину карточки поровну, а не стоят фиксированными 108
    точками: на телефоне три таких с отступами в строку не влезали, и
    третья — та, ради которой список и расширили, — обрезалась краем экрана.
    Четвёртая и дальше (мероприятие рядом с именинниками) переносятся вниз:
    `minWidth` не даёт ряду ужаться до нечитаемого.
  */
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  person: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
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
  addLink: {
    ...typography.caption,
    color: colors.accent,
  },
  photo: {
    width: 64,
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
  name: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    lineHeight: 14,
    height: 28,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  jobTitle: {
    fontFamily: fonts.medium,
    fontSize: 10,
    lineHeight: 13,
    height: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  when: {
    ...typography.caption,
    lineHeight: 17,
    height: 17,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  whenToday: {
    color: colors.accentStrong,
    fontWeight: '700',
  },
  date: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  removeButton: {
    marginTop: spacing.xs,
  },
  removeText: {
    fontFamily: fonts.medium,
    fontSize: 10,
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
});
