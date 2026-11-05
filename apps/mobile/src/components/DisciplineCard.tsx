import {
  DISCIPLINE_KIND_LABELS,
  DISCIPLINE_LEVEL_LABELS,
  DisciplineLevel,
  formatDisciplinePoints,
  formatIsoDateShort,
} from '@curtain-crm/shared';
import { useState, type ReactElement } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '../hooks/useLocale';
import { notifySuccess } from '../lib/haptics';
import { trpc } from '../lib/trpc';
import { colors, fonts, hairline, opacity, radius, spacing, typography } from '../theme';
import { BottomSheet } from './BottomSheet';
import { SubmitButton } from './SubmitButton';
import { Card, CardTitle, Empty, Skeleton } from './Card';
import { Field, Input } from './Field';

/**
 * Мои баллы за месяц.
 *
 * Сотрудник видит то же, что менеджер в панели: штрафные и бонусные баллы,
 * уровень и каждую запись с фактом. Правило «не спорим, а фиксируем»
 * работает в обе стороны: по любой записи человек может дать объяснение —
 * его увидит руководство рядом с фактом, до разговора, а не во время.
 */
export function DisciplineCard({
  period,
}: {
  readonly period: { year: number; month: number };
}): ReactElement {
  const { m, t } = useLocale();
  const utils = trpc.useUtils();
  const query = trpc.discipline.my.useQuery(period);
  const [explaining, setExplaining] = useState<{ id: number; title: string } | null>(null);
  const [comment, setComment] = useState('');

  const explain = trpc.discipline.explain.useMutation({
    async onSuccess() {
      notifySuccess();
      setExplaining(null);
      setComment('');
      await utils.discipline.my.invalidate();
    },
    onError(error) {
      Alert.alert(m('common.saveError'), error.message);
    },
  });

  const summary = query.data?.summary ?? null;
  const events = query.data?.events ?? [];
  const clean =
    summary !== null && summary.violations === 0 && summary.level === DisciplineLevel.CONTROL;

  return (
    <Card>
      <CardTitle title={m('discipline.title')} icon="badge" />
      {query.isLoading ? (
        <Skeleton rows={2} />
      ) : summary === null ? (
        <Empty message={m('discipline.empty')} />
      ) : (
        <>
          <View style={styles.stats}>
            {/*
              Цвет — только у ненулевого числа. Ноль штрафных терракотой
              читался как штраф: чистый месяц показывал красную цифру.
            */}
            <Stat
              label={m('discipline.penalty')}
              value={formatDisciplinePoints(summary.penalty)}
              tone={summary.penalty === 0 ? 'plain' : 'danger'}
            />
            <Stat
              label={m('discipline.bonus')}
              value={formatDisciplinePoints(summary.bonus)}
              tone={summary.bonus === 0 ? 'plain' : 'positive'}
            />
            <Stat label={m('discipline.net')} value={formatDisciplinePoints(summary.net)} />
          </View>
          <View style={[styles.level, clean ? styles.levelClean : levelStyle(summary.level)]}>
            <Text style={styles.levelText}>
              {clean ? m('discipline.cleanMonth') : t(DISCIPLINE_LEVEL_LABELS, summary.level)}
            </Text>
          </View>

          {events.length === 0 ? (
            <Empty message={m('discipline.noEvents')} />
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>
                    {t(DISCIPLINE_KIND_LABELS, event.kind)}
                    {event.isRepeat ? ` · ${m('discipline.repeat')}` : ''}
                  </Text>
                  <Text style={styles.rowHint}>
                    {formatIsoDateShort(event.occurredOn)}
                    {event.description === null ? '' : ` — ${event.description}`}
                  </Text>
                  {event.employeeComment !== null ? (
                    <Text
                      style={styles.rowComment}
                    >{`${m('discipline.yourComment')}: ${event.employeeComment}`}</Text>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setExplaining({
                          id: event.id,
                          title: t(DISCIPLINE_KIND_LABELS, event.kind),
                        });
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.linkTarget, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.link}>{m('discipline.explain')}</Text>
                    </Pressable>
                  )}
                </View>
                <Text
                  style={[
                    styles.points,
                    event.points < 0 ? styles.pointsDanger : styles.pointsPositive,
                  ]}
                >
                  {formatDisciplinePoints(event.points)}
                </Text>
              </View>
            ))
          )}
        </>
      )}

      <BottomSheet
        visible={explaining !== null}
        title={explaining?.title ?? ''}
        onClose={() => {
          setExplaining(null);
        }}
      >
        <Field label={m('discipline.explainLabel')} hint={m('discipline.explainHint')} required>
          <Input
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={3}
            placeholder={m('discipline.explainPlaceholder')}
            style={styles.textarea}
          />
        </Field>
        <SubmitButton
          label={m('discipline.send')}
          onPress={() => {
            if (explaining === null) return;
            explain.mutate({ id: explaining.id, comment: comment.trim() });
          }}
          disabled={comment.trim().length === 0}
          pending={explain.isPending}
        />
      </BottomSheet>
    </Card>
  );
}

function levelStyle(level: DisciplineLevel): { backgroundColor: string } {
  switch (level) {
    case DisciplineLevel.CONTROL:
      return styles.levelClean;
    case DisciplineLevel.VERBAL:
      return styles.levelWarning;
    default:
      return styles.levelDanger;
  }
}

function Stat({
  label,
  value,
  tone = 'plain',
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'plain' | 'danger' | 'positive';
}): ReactElement {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          tone === 'danger'
            ? styles.pointsDanger
            : tone === 'positive'
              ? styles.pointsPositive
              : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/** Цель нажатия ссылки и запас по вертикали вокруг строки подписи (16). */
const LINK_TARGET = 44;
const LINK_SLACK = (LINK_TARGET - typography.footnote.lineHeight) / 2;

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  statValue: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: 2,
  },
  level: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  levelClean: {
    backgroundColor: colors.accentSoft,
  },
  levelWarning: {
    backgroundColor: colors.warningSoft,
  },
  levelDanger: {
    backgroundColor: colors.dangerSoft,
  },
  levelText: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: hairline,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
  },
  rowHint: {
    ...typography.footnote,
    color: colors.textMuted,
  },
  rowComment: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: 2,
  },
  /*
    Зона нажатия «Объяснить» — настоящие 44 точки. На `hitSlop` надежды
    нет: в браузере его нет вовсе (цель была 17 точек в высоту), а на
    телефоне он добирал до 29. Отрицательные отступы возвращают строке
    прежнюю высоту и прежнее место подписи. `flex-start` — чтобы нажатие
    в пустоту справа от слова ничего не открывало: раньше кнопкой была
    вся ширина строки.
  */
  linkTarget: {
    alignSelf: 'flex-start',
    minHeight: LINK_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
    marginTop: 2 - LINK_SLACK,
    marginBottom: -LINK_SLACK,
  },
  link: {
    ...typography.footnote,
    fontFamily: fonts.semibold,
    fontWeight: '600',
    color: colors.accent,
  },
  pressed: {
    opacity: opacity.pressed,
  },
  points: {
    ...typography.value,
  },
  pointsDanger: {
    color: colors.danger,
  },
  pointsPositive: {
    color: colors.positive,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
