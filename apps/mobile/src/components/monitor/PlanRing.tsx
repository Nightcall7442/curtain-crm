import { PLAN_PACE_LABELS, type PlanPace } from "@curtain-crm/shared";
import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useLocale } from "../../hooks/useLocale";
import { colors, fonts, typography } from "../../theme";

import { PACE_COLOR } from "./monitorStyle";

/**
 * Кольцо «План месяца»: дуга до 100 %, в центре процент. Перевыполнение
 * дуга не рисует — круг уже полон, насколько больше, говорит цифра.
 */
export function PlanRing({
  percent,
  pace,
  size = 112,
}: {
  readonly percent: number;
  readonly pace: PlanPace;
  readonly size?: number;
}): ReactElement {
  const { m, locale } = useLocale();
  const stroke = Math.max(8, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel={`${m("monitor.planTitle")}: ${percent.toString()}%, ${PLAN_PACE_LABELS[locale][pace]}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.min(100, percent) }}
    >
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surfaceMuted}
          strokeWidth={stroke}
          fill="none"
        />
        {filled > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={PACE_COLOR[pace]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled.toString()} ${circumference.toString()}`}
            fill="none"
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text
          style={[styles.value, { fontSize: size / 4.4 }]}
        >{`${percent.toString()}%`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Дуга начинается сверху, а не справа: так читается «часовая стрелка».
  svg: {
    transform: [{ rotate: "-90deg" }],
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    ...typography.body,
    fontFamily: fonts.bold,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
