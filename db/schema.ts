import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  usernameNormalized: text("username_normalized").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("users_username_normalized_idx").on(table.usernameNormalized)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
});

export const trackerState = sqliteTable("tracker_state", {
  userId: text("user_id").primaryKey(),
  dataJson: text("data_json").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const githubSettings = sqliteTable("github_settings", {
  userId: text("user_id").primaryKey(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull().default("main"),
  path: text("path").notNull().default("data/progress.json"),
  tokenCiphertext: text("token_ciphertext").notNull(),
  tokenIv: text("token_iv").notNull(),
  lastBackupAt: text("last_backup_at"),
  lastBackupError: text("last_backup_error"),
  updatedAt: text("updated_at").notNull(),
});

export const setupState = sqliteTable("setup_state", {
  id: integer("id").primaryKey(),
  completedAt: text("completed_at").notNull(),
});
