import { relations } from 'drizzle-orm';

import { auditLog } from './auditLog.schema';
import { branches } from './branches.schema';
import { catalogItems } from './catalog.schema';
import { notifications } from './notifications.schema';
import { orderComments } from './orderComments.schema';
import { orderPhotos } from './orderPhotos.schema';
import { orderStatusHistory } from './orderStatusHistory.schema';
import { orderInstallationTeam, orderItems, orders } from './orders.schema';
import { payrollRecords, payrollSchemes } from './payroll.schema';
import { purchaseItems, purchases } from './purchases.schema';
import { tasks } from './tasks.schema';
import { shifts } from './shifts.schema';
import { refreshTokens, userBranches, userRoles, users } from './users.schema';

/**
 * Связи между таблицами для Drizzle Relational Queries
 * (`db.query.orders.findMany({ with: { items: true } })`).
 *
 * Все `relations()` собраны в одном файле намеренно: `user_branches` ссылается
 * и на `users`, и на `branches`, а `orders` — на `users` четырьмя разными
 * колонками. Если описывать связи прямо в файлах таблиц, появляются взаимные
 * импорты между модулями схемы. Здесь же граф связей виден целиком.
 *
 * У заказа несколько ссылок на `users`, поэтому каждой задан `relationName` —
 * без него Drizzle не сможет различить, какая связь к какой колонке относится.
 */

export const usersRelations = relations(users, ({ many }) => ({
  roles: many(userRoles, { relationName: 'userRoleOwner' }),
  grantedRoles: many(userRoles, { relationName: 'userRoleGrantor' }),
  branches: many(userBranches),
  refreshTokens: many(refreshTokens),
  shifts: many(shifts, { relationName: 'shiftOwner' }),
  adjustedShifts: many(shifts, { relationName: 'shiftAdjuster' }),
  notifications: many(notifications),
  auditEntries: many(auditLog),

  createdOrders: many(orders, { relationName: 'orderCreator' }),
  measurementOrders: many(orders, { relationName: 'orderMaster' }),
  sewingOrders: many(orders, { relationName: 'orderSewer' }),
  qcOrders: many(orders, { relationName: 'orderQc' }),
  installationOrders: many(orders, { relationName: 'orderInstaller' }),

  orderComments: many(orderComments),
  uploadedPhotos: many(orderPhotos),
  statusChanges: many(orderStatusHistory),
  payrollRecords: many(payrollRecords, { relationName: 'payrollOwner' }),

  // Обратные стороны связей, у которых до этого была объявлена только `one()`.
  // Работали и без них — Drizzle не требует симметрии, — но односторонняя
  // связь не даёт спросить «в каких бригадах состоит сотрудник» и «какие
  // расчёты он утвердил», а именно это и понадобится следующей задаче.
  installationAssignments: many(orderInstallationTeam, {
    relationName: 'installationTeamMember',
  }),
  addedInstallationMembers: many(orderInstallationTeam, {
    relationName: 'installationTeamAuthor',
  }),
  approvedPayrollRecords: many(payrollRecords, { relationName: 'payrollApprover' }),

  createdCatalogItems: many(catalogItems),
  createdPurchaseItems: many(purchaseItems),
  createdPurchases: many(purchases),
  createdPayrollSchemes: many(payrollSchemes),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: 'userRoleOwner',
  }),
  grantor: one(users, {
    fields: [userRoles.grantedBy],
    references: [users.id],
    relationName: 'userRoleGrantor',
  }),
}));

export const userBranchesRelations = relations(userBranches, ({ one }) => ({
  user: one(users, { fields: [userBranches.userId], references: [users.id] }),
  branch: one(branches, { fields: [userBranches.branchId], references: [branches.id] }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  members: many(userBranches),
  shifts: many(shifts),
  orders: many(orders),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  user: one(users, {
    fields: [shifts.userId],
    references: [users.id],
    relationName: 'shiftOwner',
  }),
  branch: one(branches, { fields: [shifts.branchId], references: [branches.id] }),
  adjustedByUser: one(users, {
    fields: [shifts.adjustedBy],
    references: [users.id],
    relationName: 'shiftAdjuster',
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),

  creator: one(users, {
    fields: [orders.createdBy],
    references: [users.id],
    relationName: 'orderCreator',
  }),
  master: one(users, {
    fields: [orders.masterId],
    references: [users.id],
    relationName: 'orderMaster',
  }),
  sewer: one(users, {
    fields: [orders.sewerId],
    references: [users.id],
    relationName: 'orderSewer',
  }),
  qc: one(users, {
    fields: [orders.qcId],
    references: [users.id],
    relationName: 'orderQc',
  }),
  installer: one(users, {
    fields: [orders.installerId],
    references: [users.id],
    relationName: 'orderInstaller',
  }),

  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  photos: many(orderPhotos),
  comments: many(orderComments),
  purchases: many(purchases),
  installationTeam: many(orderInstallationTeam),
  notifications: many(notifications),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
  changedByUser: one(users, {
    fields: [orderStatusHistory.changedBy],
    references: [users.id],
  }),
}));

export const orderPhotosRelations = relations(orderPhotos, ({ one }) => ({
  order: one(orders, { fields: [orderPhotos.orderId], references: [orders.id] }),
  uploader: one(users, { fields: [orderPhotos.uploadedBy], references: [users.id] }),
}));

export const orderCommentsRelations = relations(orderComments, ({ one }) => ({
  order: one(orders, { fields: [orderComments.orderId], references: [orders.id] }),
  author: one(users, { fields: [orderComments.userId], references: [users.id] }),
}));

export const orderInstallationTeamRelations = relations(orderInstallationTeam, ({ one }) => ({
  order: one(orders, { fields: [orderInstallationTeam.orderId], references: [orders.id] }),
  member: one(users, {
    fields: [orderInstallationTeam.userId],
    references: [users.id],
    relationName: 'installationTeamMember',
  }),
  addedByUser: one(users, {
    fields: [orderInstallationTeam.addedBy],
    references: [users.id],
    relationName: 'installationTeamAuthor',
  }),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one, many }) => ({
  creator: one(users, { fields: [purchaseItems.createdBy], references: [users.id] }),
  purchases: many(purchases),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  order: one(orders, { fields: [purchases.orderId], references: [orders.id] }),
  item: one(purchaseItems, { fields: [purchases.itemId], references: [purchaseItems.id] }),
  creator: one(users, { fields: [purchases.createdBy], references: [users.id] }),
}));

export const catalogItemsRelations = relations(catalogItems, ({ one }) => ({
  creator: one(users, { fields: [catalogItems.createdBy], references: [users.id] }),
}));

export const payrollSchemesRelations = relations(payrollSchemes, ({ one }) => ({
  creator: one(users, { fields: [payrollSchemes.createdBy], references: [users.id] }),
}));

export const payrollRecordsRelations = relations(payrollRecords, ({ one }) => ({
  user: one(users, {
    fields: [payrollRecords.userId],
    references: [users.id],
    relationName: 'payrollOwner',
  }),
  approver: one(users, {
    fields: [payrollRecords.approvedBy],
    references: [users.id],
    relationName: 'payrollApprover',
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  order: one(orders, { fields: [notifications.relatedOrderId], references: [orders.id] }),
}));

/**
 * У поручения два человека — адресат и автор; обе связи смотрят в `users`,
 * поэтому пары разводит `relationName`.
 */
export const tasksRelations = relations(tasks, ({ one }) => ({
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: 'taskAssignee',
  }),
  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: 'taskCreator',
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}));
