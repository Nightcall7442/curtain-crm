// Аккаунты сотрудников: администраторы и кассиры.
// Пароли хранятся как scrypt-хэши (node:crypto), исходный пароль
// нигде не сохраняется.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { utcNow } from "../db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import { JournalEvent, logEvent } from "./journal.js";

export const ROLES = ["admin", "cashier"];
export const ROLE_LABELS = { admin: "Администратор", cashier: "Кассир" };

const MIN_PASSWORD_LENGTH = 4;

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Публичное представление пользователя (без хэша пароля). */
export function toPublicUser(row) {
  return {
    id: row.id,
    login: row.login,
    name: row.name,
    role: row.role,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
  };
}

/** @param {import("node:sqlite").DatabaseSync} db */
export function listUsers(db) {
  return db
    .prepare("SELECT * FROM users ORDER BY id")
    .all()
    .map(toPublicUser);
}

export function getUser(db, userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!row) throw new NotFoundError(`Сотрудник id=${userId} не найден`);
  return row;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new ConflictError(
      `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
    );
  }
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{login: string, name: string, password: string, role: string}} data
 * @param {{id: number, name: string} | null} [author] кто создаёт (для журнала)
 */
export function createUser(db, data, author = null) {
  const login = String(data.login ?? "").trim().toLowerCase();
  const name = String(data.name ?? "").trim();
  if (!login) throw new ConflictError("Логин не может быть пустым");
  if (!name) throw new ConflictError("Имя не может быть пустым");
  if (!ROLES.includes(data.role)) {
    throw new ConflictError(`Недопустимая роль «${data.role}»`);
  }
  validatePassword(data.password);
  if (db.prepare("SELECT id FROM users WHERE login = ?").get(login)) {
    throw new ConflictError(`Логин «${login}» уже занят`);
  }
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (login, name, password_hash, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(login, name, hashPassword(data.password), data.role, utcNow());
  const user = getUser(db, Number(lastInsertRowid));
  logEvent(
    db,
    JournalEvent.USER_CREATED,
    `Создан сотрудник «${name}» (${login}, ${ROLE_LABELS[data.role]})` +
      (author ? ` — ${author.name}` : "")
  );
  return toPublicUser(user);
}

function countOtherActiveAdmins(db, exceptUserId) {
  return db
    .prepare(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?"
    )
    .get(exceptUserId).n;
}

/**
 * Обновление сотрудника: имя, роль, активность, сброс пароля.
 * Нельзя оставить систему без активного администратора и нельзя
 * деактивировать самого себя.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {number} userId
 * @param {{name?: string, role?: string, is_active?: boolean, password?: string}} patch
 * @param {{id: number, name: string}} author
 */
export function updateUser(db, userId, patch, author) {
  const user = getUser(db, userId);

  const next = {
    name: user.name,
    role: user.role,
    is_active: Boolean(user.is_active),
    password_hash: user.password_hash,
  };
  if ("name" in patch) {
    next.name = String(patch.name ?? "").trim();
    if (!next.name) throw new ConflictError("Имя не может быть пустым");
  }
  if ("role" in patch) {
    if (!ROLES.includes(patch.role)) {
      throw new ConflictError(`Недопустимая роль «${patch.role}»`);
    }
    next.role = patch.role;
  }
  if ("is_active" in patch) next.is_active = Boolean(patch.is_active);
  if ("password" in patch && patch.password !== "") {
    validatePassword(patch.password);
    next.password_hash = hashPassword(patch.password);
  }

  const losesAdmin =
    user.role === "admin" &&
    user.is_active &&
    (next.role !== "admin" || !next.is_active);
  if (losesAdmin && countOtherActiveAdmins(db, user.id) === 0) {
    throw new ConflictError("Нельзя убрать последнего активного администратора");
  }
  if (!next.is_active && user.id === author.id) {
    throw new ConflictError("Нельзя деактивировать собственный аккаунт");
  }

  db.prepare(
    `UPDATE users SET name = ?, role = ?, is_active = ?, password_hash = ?
     WHERE id = ?`
  ).run(next.name, next.role, next.is_active ? 1 : 0, next.password_hash, user.id);

  logEvent(
    db,
    JournalEvent.USER_UPDATED,
    `Обновлён сотрудник «${next.name}» (${user.login}) — ${author.name}`
  );
  return toPublicUser(getUser(db, user.id));
}

/**
 * Проверка логина и пароля. Возвращает публичного пользователя или null.
 * @param {import("node:sqlite").DatabaseSync} db
 */
export function authenticate(db, login, password) {
  const row = db
    .prepare("SELECT * FROM users WHERE login = ? AND is_active = 1")
    .get(String(login ?? "").trim().toLowerCase());
  if (!row) return null;
  if (!verifyPassword(String(password ?? ""), row.password_hash)) return null;
  return toPublicUser(row);
}

/** Смена собственного пароля (требует старый пароль). */
export function changeOwnPassword(db, userId, oldPassword, newPassword) {
  const user = getUser(db, userId);
  if (!verifyPassword(String(oldPassword ?? ""), user.password_hash)) {
    throw new ConflictError("Текущий пароль указан неверно");
  }
  validatePassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(newPassword),
    user.id
  );
}
