import type { ReactElement } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { InstallationTripCard } from '../components/InstallationTripCard';
import { PersonalBreakCard } from '../components/PersonalBreakCard';
import { ShiftControl } from '../components/ShiftControl';
import { trpc } from '../lib/trpc';
import { spacing, tabBarSpace } from '../theme';

/**
 * Смена сотрудника: отметка прихода и ухода, выезд на объект, отлучка.
 *
 * Сама отметка живёт в `ShiftControl` — тем же компонентом отмечается
 * руководство на своём экране явки. Здесь к ней добавлены две вещи,
 * которые случаются ВНУТРИ смены и её не закрывают: выезд на установку и
 * личная отлучка.
 */
export function CheckInOutScreen(): ReactElement {
  /* Тот же запрос, что и внутри `ShiftControl`: React Query отдаст обоим
     один ответ по общему ключу, второго обращения к серверу не будет. */
  const current = trpc.shifts.current.useQuery();
  const shiftOpen = (current.data ?? null) !== null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ShiftControl>
        <InstallationTripCard shiftOpen={shiftOpen} />
        <PersonalBreakCard shiftOpen={shiftOpen} />
      </ShiftControl>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: tabBarSpace,
  },
});
