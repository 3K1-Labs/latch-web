import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getWaitlistDatabase } from "./db";
import { waitlistSubscribers } from "./schema";
import type {
  ConfirmationResult,
  PrepareSignupInput,
  SignupPreparation,
  WaitlistStore,
} from "./service";

type Database = NeonHttpDatabase<{ waitlistSubscribers: typeof waitlistSubscribers }>;

export class DrizzleWaitlistStore implements WaitlistStore {
  constructor(private readonly database: Database) {}

  async prepareSignup(input: PrepareSignupInput): Promise<SignupPreparation> {
    const result = await this.database.execute<{ id: string }>(sql`
      insert into waitlist_subscribers (
        email,
        status,
        confirmation_token_hash,
        confirmation_token_expires_at,
        confirmation_sent_at,
        confirmation_last_attempted_at,
        confirmation_send_count,
        confirmation_send_window_started_at,
        consent_version,
        created_at,
        updated_at
      ) values (
        ${input.email},
        'pending',
        ${input.confirmationTokenHash},
        ${input.confirmationTokenExpiresAt},
        null,
        ${input.attemptedAt},
        1,
        ${input.attemptedAt},
        ${input.consentVersion},
        ${input.attemptedAt},
        ${input.attemptedAt}
      )
      on conflict (email) do update set
        status = 'pending',
        confirmation_token_hash = excluded.confirmation_token_hash,
        confirmation_token_expires_at = excluded.confirmation_token_expires_at,
        confirmation_sent_at = null,
        confirmation_last_attempted_at = excluded.confirmation_last_attempted_at,
        confirmation_send_count = case
          when waitlist_subscribers.confirmation_send_window_started_at is null
            or waitlist_subscribers.confirmation_send_window_started_at <= ${input.sendWindowCutoff}
          then 1
          else waitlist_subscribers.confirmation_send_count + 1
        end,
        confirmation_send_window_started_at = case
          when waitlist_subscribers.confirmation_send_window_started_at is null
            or waitlist_subscribers.confirmation_send_window_started_at <= ${input.sendWindowCutoff}
          then excluded.confirmation_send_window_started_at
          else waitlist_subscribers.confirmation_send_window_started_at
        end,
        consent_version = excluded.consent_version,
        updated_at = excluded.updated_at
      where waitlist_subscribers.status in ('pending', 'unsubscribed')
        and (
          waitlist_subscribers.confirmation_last_attempted_at is null
          or waitlist_subscribers.confirmation_last_attempted_at <= ${input.cooldownCutoff}
        )
        and (
          waitlist_subscribers.confirmation_send_window_started_at is null
          or waitlist_subscribers.confirmation_send_window_started_at <= ${input.sendWindowCutoff}
          or waitlist_subscribers.confirmation_send_count < ${input.maximumSendsPerWindow}
        )
      returning id
    `);

    return { shouldSend: result.rows.length === 1 };
  }

  async markConfirmationSent(confirmationTokenHash: string, sentAt: Date): Promise<void> {
    await this.database
      .update(waitlistSubscribers)
      .set({ confirmationSentAt: sentAt, updatedAt: sentAt })
      .where(
        and(
          eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash),
          eq(waitlistSubscribers.status, "pending"),
        ),
      );
  }

  async releaseFailedConfirmation(
    confirmationTokenHash: string,
    releasedAt: Date,
  ): Promise<void> {
    await this.database
      .update(waitlistSubscribers)
      .set({
        confirmationTokenHash: null,
        confirmationTokenExpiresAt: null,
        confirmationSentAt: null,
        confirmationLastAttemptedAt: null,
        updatedAt: releasedAt,
      })
      .where(
        and(
          eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash),
          eq(waitlistSubscribers.status, "pending"),
        ),
      );
  }

  async confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult> {
    const confirmed = await this.database
      .update(waitlistSubscribers)
      .set({
        status: "confirmed",
        confirmedAt,
        updatedAt: confirmedAt,
        unsubscribeTokenVersion: sql`${waitlistSubscribers.unsubscribeTokenVersion} + 1`,
      })
      .where(
        and(
          eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash),
          eq(waitlistSubscribers.status, "pending"),
          gt(waitlistSubscribers.confirmationTokenExpiresAt, confirmedAt),
        ),
      )
      .returning({ id: waitlistSubscribers.id });

    if (confirmed.length === 1) {
      return "confirmed";
    }

    const [subscriber] = await this.database
      .select({
        status: waitlistSubscribers.status,
        confirmationTokenExpiresAt: waitlistSubscribers.confirmationTokenExpiresAt,
      })
      .from(waitlistSubscribers)
      .where(eq(waitlistSubscribers.confirmationTokenHash, confirmationTokenHash))
      .limit(1);

    if (subscriber?.status === "confirmed") {
      return "confirmed";
    }

    if (
      subscriber?.status === "pending" &&
      subscriber.confirmationTokenExpiresAt &&
      subscriber.confirmationTokenExpiresAt <= confirmedAt
    ) {
      return "expired";
    }

    return "invalid";
  }

  async unsubscribe(
    subscriberId: string,
    tokenVersion: number,
    unsubscribedAt: Date,
  ): Promise<boolean> {
    const result = await this.database.execute<{ id: string }>(sql`
      update waitlist_subscribers
      set
        status = 'unsubscribed',
        unsubscribed_at = case
          when status = 'unsubscribed' then unsubscribed_at
          else ${unsubscribedAt}
        end,
        updated_at = case
          when status = 'unsubscribed' then updated_at
          else ${unsubscribedAt}
        end
      where id = ${subscriberId}
        and unsubscribe_token_version = ${tokenVersion}
        and status in ('confirmed', 'unsubscribed')
      returning id
    `);

    return result.rows.length === 1;
  }
}

export function getWaitlistStore(): WaitlistStore {
  return new DrizzleWaitlistStore(getWaitlistDatabase());
}
