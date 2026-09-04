import { useRef, type ReactElement, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { tapMedium } from '../lib/haptics';
import { radius, typography } from '../theme';

import { Icon, type IconName } from './Icon';

/**
 * Горизонтальный свайп по карточке с действиями под ней.
 *
 * Свайп ВПРАВО открывает левую подложку, ВЛЕВО — правую; отпускание за
 * порогом запускает действие и возвращает карточку на место. Реализовано
 * на `PanResponder` из ядра RN — без новых нативных зависимостей, поэтому
 * работает и в Expo Go, и в вебе.
 *
 * Жест — УСКОРИТЕЛЬ, а не единственный путь: оба действия доступны и без
 * него (звонок — из карточки заказа, действие этапа — кнопкой). Поэтому
 * недоступность свайпа для экранного диктора не отрезает функциональность,
 * а сами подложки от Accessibility-дерева скрыты.
 *
 * Захват жеста начинается только с заметного горизонтального движения
 * (10 точек при малом вертикальном) — иначе свайп дрался бы с прокруткой
 * списка за каждое касание.
 */
export function SwipeableRow({
  children,
  left,
  right,
}: {
  readonly children: ReactNode;
  /** Действие, открываемое свайпом вправо. Не передано — свайп вправо выключен. */
  readonly left?: SwipeAction;
  /** Действие, открываемое свайпом влево. */
  readonly right?: SwipeAction;
}): ReactElement {
  const shift = useRef(new Animated.Value(0)).current;
  const current = useRef(0);

  // Действия кладутся в ref: PanResponder создаётся один раз, и замыкание
  // без этого держало бы обработчики первого рендера.
  const actions = useRef({ left, right });
  actions.current = { left, right };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 12,
      onPanResponderMove: (_event, gesture) => {
        const { left: l, right: r } = actions.current;
        let dx = gesture.dx;
        if (dx > 0 && l === undefined) dx = 0;
        if (dx < 0 && r === undefined) dx = 0;
        // Дальше ширины подложки карточка идёт с сопротивлением.
        const capped = Math.sign(dx) * Math.min(Math.abs(dx), REVEAL + (Math.abs(dx) - REVEAL) / 4);
        current.current = Number.isNaN(capped) ? dx : capped;
        shift.setValue(current.current);
      },
      onPanResponderRelease: () => {
        const dx = current.current;
        const { left: l, right: r } = actions.current;

        if (dx > TRIGGER && l !== undefined) {
          tapMedium();
          l.onTrigger();
        } else if (dx < -TRIGGER && r !== undefined) {
          tapMedium();
          r.onTrigger();
        }

        Animated.spring(shift, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
          speed: 16,
        }).start();
        current.current = 0;
      },
      onPanResponderTerminate: () => {
        Animated.spring(shift, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
        current.current = 0;
      },
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.under} importantForAccessibility="no-hide-descendants" aria-hidden>
        {left !== undefined ? (
          <View style={[styles.pad, styles.padLeft, { backgroundColor: left.color }]}>
            <Icon name={left.icon} size={20} color="#FFFFFF" />
            <Text style={styles.padText}>{left.label}</Text>
          </View>
        ) : (
          <View />
        )}
        {right !== undefined && (
          <View style={[styles.pad, styles.padRight, { backgroundColor: right.color }]}>
            <Icon name={right.icon} size={20} color="#FFFFFF" />
            <Text style={styles.padText}>{right.label}</Text>
          </View>
        )}
      </View>

      <Animated.View style={{ transform: [{ translateX: shift }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

export interface SwipeAction {
  readonly icon: IconName;
  readonly label: string;
  readonly color: string;
  readonly onTrigger: () => void;
}

/** Насколько выезжает подложка до начала «сопротивления». */
const REVEAL = 88;
/** Порог срабатывания при отпускании. */
const TRIGGER = 64;

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  under: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pad: {
    width: REVEAL + 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  padLeft: {
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  padRight: {
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  padText: {
    ...typography.footnote,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
