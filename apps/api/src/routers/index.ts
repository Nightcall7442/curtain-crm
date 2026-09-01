import { archiveRouter } from './archive.router';
import { auditRouter } from './audit.router';
import { authRouter } from './auth.router';
import { branchesRouter } from './branches.router';
import { catalogRouter } from './catalog.router';
import { dayOffRouter } from './dayOff.router';
import { notificationsRouter } from './notifications.router';
import { orderCommentsRouter } from './orderComments.router';
import { orderPhotosRouter } from './orderPhotos.router';
import { ordersRouter } from './orders.router';
import { payrollRouter } from './payroll.router';
import { purchasesRouter } from './purchases.router';
import { ratingRouter } from './rating.router';
import { reportsRouter } from './reports.router';
import { shiftsRouter } from './shifts.router';
import { smmRouter } from './smm.router';
import { tasksRouter } from './tasks.router';
import { usersRouter } from './users.router';
import { baseProcedure, router } from '../trpc';

/**
 * Корневой роутер API.
 *
 * Тип `AppRouter` — это и есть контракт между бэкендом и клиентами:
 * `apps/web` и `apps/mobile` импортируют только его, поэтому изменение
 * сигнатуры процедуры ломает сборку клиента, а не продакшен в рантайме.
 */
export const appRouter = router({
  /** Публичная проверка живости — для мониторинга и мобильного клиента. */
  health: baseProcedure.query(() => ({ ok: true as const, timestamp: new Date() })),

  auth: authRouter,
  users: usersRouter,
  branches: branchesRouter,
  shifts: shiftsRouter,
  catalog: catalogRouter,
  purchases: purchasesRouter,
  orders: ordersRouter,
  orderPhotos: orderPhotosRouter,
  orderComments: orderCommentsRouter,
  payroll: payrollRouter,
  notifications: notificationsRouter,
  reports: reportsRouter,
  rating: ratingRouter,
  archive: archiveRouter,
  audit: auditRouter,
  smm: smmRouter,
  tasks: tasksRouter,
  dayOff: dayOffRouter,
});

export type AppRouter = typeof appRouter;
