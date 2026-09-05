CREATE TABLE "waitlist_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"confirmation_token_hash" varchar(64),
	"confirmation_token_expires_at" timestamp with time zone,
	"confirmation_sent_at" timestamp with time zone,
	"confirmation_last_attempted_at" timestamp with time zone,
	"confirmation_send_count" integer DEFAULT 0 NOT NULL,
	"confirmation_send_window_started_at" timestamp with time zone,
	"unsubscribe_token_version" integer DEFAULT 0 NOT NULL,
	"consent_version" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	CONSTRAINT "waitlist_subscribers_status_check" CHECK ("waitlist_subscribers"."status" in ('pending', 'confirmed', 'unsubscribed')),
	CONSTRAINT "waitlist_subscribers_email_normalized_check" CHECK ("waitlist_subscribers"."email" = lower(btrim("waitlist_subscribers"."email"))),
	CONSTRAINT "waitlist_subscribers_confirmation_send_count_check" CHECK ("waitlist_subscribers"."confirmation_send_count" >= 0),
	CONSTRAINT "waitlist_subscribers_unsubscribe_token_version_check" CHECK ("waitlist_subscribers"."unsubscribe_token_version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_subscribers_email_unique" ON "waitlist_subscribers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_subscribers_confirmation_token_hash_unique" ON "waitlist_subscribers" USING btree ("confirmation_token_hash") WHERE "waitlist_subscribers"."confirmation_token_hash" is not null;