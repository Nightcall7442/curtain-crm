'use client';

import type { ReactElement } from 'react';

import { EmployeeDashboard } from '@/components/dashboard/EmployeeDashboard';
import { ManagementDashboard } from '@/components/dashboard/ManagementDashboard';
import { useAuth } from '@/components/providers/AuthProvider';
import { Skeleton } from '@/components/ui/Card';

/**
 * Главная панель.
 *
 * Экран выбирается по правам, потому что источники данных у них разные:
 * сводка компании собирается пятью `managementProcedure`, и рядовому
 * сотруднику все пять ответили бы `FORBIDDEN` — домашним экраном швеи,
 * мастера и установщика был бы экран ошибки.
 *
 * Развилка здесь — удобство, а не защита: показатели компании закрывает
 * сервер, и открыть их, обойдя эту проверку, невозможно.
 */
export default function DashboardPage(): ReactElement {
  const { isManagement, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_unused, index) => (
            <Skeleton key={index} className="h-[104px]" />
          ))}
        </section>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return isManagement ? <ManagementDashboard /> : <EmployeeDashboard />;
}
