import { DEPARTMENT_LABELS, formatTenure, type Department } from '@curtain-crm/shared';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useState, type ReactElement } from 'react';
import { useLocale } from '../hooks/useLocale';

import { colors, radius, spacing, typography, opacity, fonts } from '../theme';

import { Card } from './Card';
import { Icon, type IconName } from './Icon';

/**
 * Карточка сотрудника на экране «Мой профиль».
 *
 * Фото необязательно: если аватара нет, показываются инициалы на плашке —
 * пустая рамка выглядела бы как незагрузившееся изображение.
 *
 * Нажатие на плашку меняет фото, если экран передал `onPressPhoto`. Сам выбор
 * снимка карточка не делает: она про отображение, а работа с камерой и
 * галереей — забота экрана.
 */

export function ProfileCard({
  fullName,
  jobTitle,
  ratingPlace,
  department,
  hiredAt,
  avatarUrl,
  onPressPhoto,
  isPhotoBusy = false,
}: {
  readonly fullName: string;
  readonly jobTitle: string | null;
  /** Место в сводном рейтинге за месяц; `null` — вне конкурса или пока нет данных. */
  readonly ratingPlace: number | null;
  readonly department: Department;
  readonly hiredAt: string | null;
  readonly avatarUrl: string | null;
  /** Если задан, плашка становится кнопкой смены фото. */
  readonly onPressPhoto?: () => void;
  readonly isPhotoBusy?: boolean;
}): ReactElement {
  const { t, m, locale } = useLocale();
  /*
    Фото рядом с полями — только когда полям остаётся место. На 360 точках
    колонка портрета в 152 оставляла тексту 94: «Подразделение» ломалось
    посреди слова, а своё имя и должность человек видел с многоточием.
    Ширину портрета задал владелец, и уменьшать её нельзя (см. `photo`),
    поэтому на узком экране портрет встаёт строкой над полями.

    Ширина берётся из раскладки самой карточки: в браузере окно бывает
    шире колонки приложения. До первого замера — оценка по окну, чтобы
    карточка не перестраивалась на глазах.
  */
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? screen.width - SCREEN_AND_CARD_PADDING;
  const stacked = width - PHOTO_WIDTH - spacing.md - FIELD_ICON_SPACE < MIN_FIELD_TEXT_WIDTH;

  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <Card>
      <View
        style={[styles.container, stacked ? styles.containerStacked : null]}
        onLayout={(event) => {
          setMeasured(event.nativeEvent.layout.width);
        }}
      >
        <View style={styles.details}>
          {/*
            Порядок полей задал владелец: имя, подразделение, должность,
            стаж, табельный номер. Подразделение стоит вторым не случайно —
            в цеху человека ищут сначала по участку, а уже потом по
            должности.
          */}
          <Field icon="person" label={m('profileCard.fullName')} value={fullName} />
          <Field icon="branch" label={m('profileCard.department')} value={t(DEPARTMENT_LABELS, department)} />
          <Field icon="jobTitle" label={m('profileCard.jobTitle')} value={jobTitle ?? m('profileCard.jobTitleEmpty')} />
          <Field icon="calendar" label={m('profileCard.tenure')} value={formatTenure(hiredAt, new Date(), locale)} />
          <Field
            icon="badge"
            label={m('profileCard.ratingPlace')}
            value={ratingPlace === null ? '—' : `№ ${ratingPlace.toString()}`}
            isLast
          />
        </View>

        <View style={[styles.photoColumn, stacked ? styles.photoColumnStacked : null]}>
          <Pressable
            onPress={onPressPhoto}
            disabled={onPressPhoto === undefined || isPhotoBusy}
            accessibilityRole={onPressPhoto === undefined ? 'image' : 'button'}
            accessibilityLabel={
              onPressPhoto === undefined
                ? m('profileCard.photoOf', { name: fullName })
                : m('profileCard.changePhoto')
            }
          >
            {({ pressed }) => (
              <View style={pressed ? styles.photoPressed : null}>
                {avatarUrl === null ? (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <Text style={styles.initials}>{initials}</Text>
                  </View>
                ) : (
                  /*
                    `cover` задан явно, хотя он же и по умолчанию: рамка
                    держит соотношение съёмки, и любое другое значение здесь
                    сломало бы кадр — пусть это будет видно в коде.
                  */
                  <Image source={{ uri: avatarUrl }} style={styles.photo} resizeMode="cover" />
                )}

                {isPhotoBusy && (
                  <View style={styles.photoOverlay}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                )}

                {/*
                  Подписи под фото нет.

                  Стояло «Изменить» — владелец убрал: карточка про человека,
                  а не про действие, и корпоративные снимки всё равно ставит
                  кадровик из панели, а не каждый сам.

                  Нажатие осталось рабочим: у кого есть право сменить фото,
                  тот меняет его тапом по портрету. Подсказка о нём живёт в
                  `accessibilityLabel` — её читает голосовой доступ, а экран
                  не загромождает.
                */}
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
  isLast = false,
}: {
  /**
   * Тип, а не `string`.
   *
   * Пока здесь стоял `string`, компонент принимал что угодно и рисовал это
   * текстом. При переходе с эмодзи на векторные иконки сюда подставили имена
   * (`person`, `jobTitle`), и экран профиля стал показывать эти слова
   * по-английски вместо значков — компилятор промолчал, потому что имя
   * иконки тоже строка. `IconName` делает такую подстановку невозможной.
   */
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly isLast?: boolean;
}): ReactElement {
  return (
    <View style={[styles.field, isLast ? null : styles.fieldSpacing]}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={14} color={colors.accent} />
      </View>
      <View style={styles.fieldText}>
        <Text style={styles.label}>{label}</Text>
        {/* Без ограничения строк: своё имя и должность человек должен видеть целиком. */}
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * Ширина портрета — решение владельца (104 → 136 → 152), см. `photo`.
 */
const PHOTO_WIDTH = 152;
/** Кружок значка поля (30) и отступ до текста (8). */
const FIELD_ICON_SPACE = 30 + spacing.sm;
/**
 * Меньше этого тексту поля нельзя: в столько помещаются самые длинные
 * подписи — «Место в рейтинге», «Reytingdagi o'rin» — без переноса посреди
 * слова.
 */
const MIN_FIELD_TEXT_WIDTH = 120;
/** Поля экрана и карточки по обе стороны — для оценки до первого замера. */
const SCREEN_AND_CARD_PADDING = 4 * spacing.lg;

const styles = StyleSheet.create({
  photoPressed: {
    opacity: opacity.pressed,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  /* Узкий экран: портрет сверху, поля под ним во всю ширину. */
  containerStacked: {
    flexDirection: 'column-reverse',
    gap: spacing.lg,
  },
  details: {
    flex: 1,
    minWidth: 0,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldSpacing: {
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  fieldText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
  },
  value: {
    ...typography.value,
    marginTop: 1,
  },
  photoColumn: {
    justifyContent: 'center',
  },
  photoColumnStacked: {
    alignItems: 'center',
  },
  photo: {
    /*
      Ширину задал владелец, и не с первого раза: 104 → 136 → 152.

      Портрет — главное на карточке, а не приложение к полям: по фото
      сотрудника узнают в цеху, а табельный номер читают раз в месяц.
      Колонка полей рядом ужимается сама (`flex: 1`), длинные значения
      переносятся на вторую строку, так что рамка ничего не обрезает.

      Рядом с полями 152 помещается от 390 точек. На 360 полям оставалось
      94 точки, и подписи ломались посреди слова, — там портрет стоит
      отдельной строкой над полями (см. `stacked`).
    */
    width: PHOTO_WIDTH,
    /*
      Высота задаётся соотношением, а не числом.

      Рамка была 104×132 (0.79), а корпоративная съёмка идёт в 309×433
      (0.71). При `cover` система масштабирует снимок по ширине и срезает
      лишнюю высоту поровну сверху и снизу — около семи пикселей с каждой
      стороны. На портрете, где голова начинается почти у верхнего края,
      этих семи пикселей хватало, чтобы срезать макушку.

      Соотношение вместо высоты выбрано намеренно: оно объясняет, ОТКУДА
      взялось число, и не даст молча вернуть обрезку, поправив высоту
      «на глаз» ради вёрстки.
    */
    aspectRatio: 309 / 433,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: fonts.semibold,
    fontSize: 30,
    fontWeight: '600',
    color: colors.header,
  },
});
