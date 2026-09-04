import { DEPARTMENT_LABELS, formatTenure, type Department } from '@curtain-crm/shared';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactElement } from 'react';
import { useLocale } from '../hooks/useLocale';

import { colors, radius, spacing, typography, opacity } from '../theme';

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
  employeeCode,
  department,
  hiredAt,
  avatarUrl,
  onPressPhoto,
  isPhotoBusy = false,
}: {
  readonly fullName: string;
  readonly jobTitle: string | null;
  readonly employeeCode: string | null;
  readonly department: Department;
  readonly hiredAt: string | null;
  readonly avatarUrl: string | null;
  /** Если задан, плашка становится кнопкой смены фото. */
  readonly onPressPhoto?: () => void;
  readonly isPhotoBusy?: boolean;
}): ReactElement {
  const { t } = useLocale();
  const initials = fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <Card>
      <View style={styles.container}>
        <View style={styles.details}>
          {/*
            Порядок полей задал владелец: имя, подразделение, должность,
            стаж, табельный номер. Подразделение стоит вторым не случайно —
            в цеху человека ищут сначала по участку, а уже потом по
            должности.
          */}
          <Field icon="person" label="Имя и фамилия" value={fullName} />
          <Field icon="branch" label="Подразделение" value={t(DEPARTMENT_LABELS, department)} />
          <Field icon="jobTitle" label="Должность" value={jobTitle ?? 'Не указана'} />
          <Field icon="calendar" label="Стаж работы" value={formatTenure(hiredAt)} />
          <Field icon="badge" label="Табельный номер" value={employeeCode ?? '—'} isLast />
        </View>

        <View style={styles.photoColumn}>
          <Pressable
            onPress={onPressPhoto}
            disabled={onPressPhoto === undefined || isPhotoBusy}
            accessibilityRole={onPressPhoto === undefined ? 'image' : 'button'}
            accessibilityLabel={
              onPressPhoto === undefined
                ? `Фото сотрудника ${fullName}`
                : 'Изменить фото профиля'
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

                {onPressPhoto !== undefined && !isPhotoBusy && (
                  <Text style={styles.photoHint}>
                    {avatarUrl === null ? 'Добавить фото' : 'Изменить'}
                  </Text>
                )}
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
        <Text style={styles.value} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoPressed: {
    opacity: opacity.pressed,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHint: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  container: {
    flexDirection: 'row',
    gap: spacing.md,
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
  photo: {
    /*
      Ширину задал владелец, и не с первого раза: 104 → 136 → 152.

      Портрет — главное на карточке, а не приложение к полям: по фото
      сотрудника узнают в цеху, а табельный номер читают раз в месяц.
      Колонка полей рядом ужимается сама (`flex: 1`), длинные значения
      переносятся на вторую строку, так что рамка ничего не обрезает.

      152 — предел для узкого экрана: на 360 точках полям остаётся 130,
      и «EMP-2026-0010» ещё помещается в две строки. Дальше расширять
      нельзя, не отдав фото отдельную строку над полями.
    */
    width: 152,
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
    fontSize: 30,
    fontWeight: '600',
    color: colors.header,
  },
});
