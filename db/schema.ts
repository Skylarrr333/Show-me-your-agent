import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Mirrors the existing payload contract; queries use bound D1 statements.
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  payload: text("payload").notNull(),
});
