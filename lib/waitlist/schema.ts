import { check, integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const WAITLIST_STATUSES = ["pending", "confirmed", "unsubscribed"] as const;

export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const waitlistSubscribers = pgTable(
  "waitlist_subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<WaitlistStatus>()
      .default("pending")
      .notNull(),
    confirmationTokenHash: varchar("confirmation_token_hash", { length: 64 }),
    confirmationTokenExpiresAt: timestamp("confirmation_token_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    confirmationSentAt: timestamp("confirmation_sent_at", {
      withTimezone: true,
      mode: "date",
    }),
    confirmationLastAttemptedAt: timestamp("confirmation_last_attempted_at", {
      withTimezone: true,
      mode: "date",
    }),
    confirmationSendCount: integer("confirmation_send_count").default(0).notNull(),
    confirmationSendWindowStartedAt: timestamp("confirmation_send_window_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    unsubscribeTokenVersion: integer("unsubscribe_token_version").default(0).notNull(),
    consentVersion: varchar("consent_version", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "date" }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("waitlist_subscribers_email_unique").on(table.email),
    uniqueIndex("waitlist_subscribers_confirmation_token_hash_unique")
      .on(table.confirmationTokenHash)
      .where(sql`${table.confirmationTokenHash} is not null`),
    check(
      "waitlist_subscribers_status_check",
      sql`${table.status} in ('pending', 'confirmed', 'unsubscribed')`,
    ),
    check(
      "waitlist_subscribers_email_normalized_check",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check(
      "waitlist_subscribers_confirmation_send_count_check",
      sql`${table.confirmationSendCount} >= 0`,
    ),
    check(
      "waitlist_subscribers_unsubscribe_token_version_check",
      sql`${table.unsubscribeTokenVersion} >= 0`,
    ),
  ],
);

export type WaitlistSubscriber = typeof waitlistSubscribers.$inferSelect;
