import { parseMoney, Role } from '@curtain-crm/shared';
import { useNavigation } from '@react-navigation/native';
import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardTitle } from '../components/Card';
import { CashCollectionCard } from '../components/CashCollectionCard';
import { CashDayReport } from '../components/CashDayReport';
import { Icon } from '../components/Icon';
import { ShiftRequiredBanner } from '../components/ShiftRequiredBanner';
import { TerminalCheckCard } from '../components/TerminalCheckCard';
import { useAuth, useIsManagement } from '../hooks/useAuth';
import { useLocale } from '../hooks/useLocale';
import { trpc } from '../lib/trpc';
import { colors, hairline, opacity, spacing, typography } from '../theme';

/**
 * Касса: деньги за день.
 *
 * Руководству — касса дня, продавцу — терминальные чеки, свои чеки и
 * инкассация. Сама продажа по кодам склада отсюда ушла на отдельный экран
 * «Метраж»: владелец попросил развести продажу и деньги, и обе кнопки
 * стоят рядом на «Работе».
 */
export function CashDeskScreen(): ReactElement {
  const utils = trpc.useUtils();
  const isManager = useIsManagement();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  /*
    Терминальные чеки — тем же, кому их показывала «Работа»: продавцам.
    Владелец попросил перенести их сюда — чек на терминале пробивают у
    кассы, рядом со своими чеками и инкассацией, а не между заказами.
  */
  const isSeller = (user?.roles ?? []).includes(Role.SELLER);
  /*
    Свой флаг, а не `isRefetching` одного запроса: экран собран из
    нескольких карточек (касса дня, терминал, свои чеки, инкассация), и
    жест обновляет их все разом.
  */
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await Promise.all([
        utils.payments.invalidate(),
        utils.retail.sales.mine.invalidate(),
        utils.terminalChecks.today.invalidate(),
        utils.shifts.current.invalidate(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      /*
        Снизу — безопасная зона и обычный отступ, а не место под панель
        вкладок: касса открыта поверх вкладок, панели под ней нет. С
        `tabBarSpace` список кончался полосой пустоты в 114 точек.
      */
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={colors.accent}
        />
      }
    >
      {/*
        Без смены сервер не примет ни терминальный чек, ни инкассацию (412).
        Шторки этих карточек говорят об этом у своей кнопки, а баннер
        сверху — сразу при входе, до того как продавец откроет шторку.
      */}
      <ShiftRequiredBanner />

      {/*
        Руководству — сначала касса дня, как в панели: директор открывает
        «Кассу» посчитать вечер. Продавцу отчёт по всем не положен — у него
        ниже терминал, свои чеки и своя инкассация.
      */}
      {isManager && <CashDayReport />}

      {isSeller && <TerminalCheckCard />}

      <MySales />

      {/* Наличные на руках и «сдал в кассу» — здесь, у кассы, а не на
          экране заказов: деньги живут там же, где чеки за них. */}
      <CashCollectionCard />
    </ScrollView>
  );
}

/**
 * Свои чеки продавца — последние пробитые им продажи.
 *
 * Чек пробивают на «Метраже», а ищут здесь: «Мои чеки» остались в «Кассе»,
 * где продавец их и привык находить. Пять последних, а не все: это поиск
 * только что пробитого чека, а не журнал. Кому нужен полный список, тот
 * смотрит его в панели.
 */
function MySales(): ReactElement | null {
  const { m, money } = useLocale();
  const navigation = useNavigation();
  const sales = trpc.retail.sales.mine.useQuery({ page: 1, pageSize: 5 });

  const rows = sales.data?.items ?? [];
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardTitle title={m('cash.myReceipts')} icon="paid" />
      {rows.map((sale, index) => (
        <Pressable
          key={sale.id}
          onPress={() => {
            navigation.navigate('SaleDetail', { saleId: sale.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={m('cash.openReceipt', { n: sale.id })}
          style={({ pressed }) => [
            styles.saleRow,
            // Разделитель — только между чеками: у последнего линия
            // висела над скруглённым низом карточки лишней чертой.
            index === rows.length - 1 ? styles.saleRowLast : null,
            pressed ? styles.salePressed : null,
          ]}
        >
          <View style={styles.itemText}>
            <Text style={styles.itemName}>{m('cash.receiptN', { n: sale.id })}</Text>
            <Text style={styles.itemMeta}>
              {m('cash.receiptMeta', {
                name: sale.clientName ?? m('cash.noName'),
                n: Number(sale.lines),
              })}
            </Text>
          </View>
          <Text style={styles.saleTotal}>{money(parseMoney(sale.total))}</Text>
          <Icon name="chevron" size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: hairline,
    borderBottomColor: colors.border,
  },
  saleRowLast: {
    borderBottomWidth: 0,
  },
  salePressed: {
    opacity: opacity.pressed,
  },
  saleTotal: {
    ...typography.value,
    color: colors.textPrimary,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
