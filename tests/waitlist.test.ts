import { beforeEach, describe, expect, test } from "bun:test";
import {
  ConfirmationEmailError,
  InvalidWaitlistEmailError,
  confirmWaitlistSubscription,
  requestWaitlistSignup,
  unsubscribeWaitlistSubscriber,
  WaitlistUnavailableError,
  type ConfirmationEmailSender,
  type ConfirmationResult,
  type PrepareSignupInput,
  type SendConfirmationInput,
  type SignupPreparation,
  type WaitlistStore,
} from "../lib/waitlist/service";
import {
  createUnsubscribeToken,
  hashConfirmationToken,
  verifyUnsubscribeToken,
} from "../lib/waitlist/security";
import { normalizeEmail } from "../lib/waitlist/validation";

const SUBSCRIBER_ID = "269a7c9e-cbc4-4db3-8a68-629138c58fd2";
const UNSUBSCRIBE_SECRET = "a-development-only-secret-with-more-than-32-bytes";
const TOKEN_ONE = Buffer.alloc(32, 1).toString("base64url");
const TOKEN_TWO = Buffer.alloc(32, 2).toString("base64url");
const TOKEN_THREE = Buffer.alloc(32, 3).toString("base64url");
const TOKEN_FOUR = Buffer.alloc(32, 4).toString("base64url");
const START = new Date("2026-09-05T10:00:00.000Z");

type StoredSubscriber = {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  confirmationTokenHash: string | null;
  confirmationTokenExpiresAt: Date | null;
  confirmationSentAt: Date | null;
  confirmationLastAttemptedAt: Date | null;
  confirmationSendCount: number;
  confirmationSendWindowStartedAt: Date | null;
  unsubscribeTokenVersion: number;
  consentVersion: string;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

class InMemoryWaitlistStore implements WaitlistStore {
  subscriber: StoredSubscriber | null = null;

  async prepareSignup(input: PrepareSignupInput): Promise<SignupPreparation> {
    const subscriber = this.subscriber;

    if (!subscriber) {
      this.subscriber = {
        id: SUBSCRIBER_ID,
        email: input.email,
        status: "pending",
        confirmationTokenHash: input.confirmationTokenHash,
        confirmationTokenExpiresAt: input.confirmationTokenExpiresAt,
        confirmationSentAt: null,
        confirmationLastAttemptedAt: input.attemptedAt,
        confirmationSendCount: 1,
        confirmationSendWindowStartedAt: input.attemptedAt,
        unsubscribeTokenVersion: 0,
        consentVersion: input.consentVersion,
        confirmedAt: null,
        unsubscribedAt: null,
      };
      return { shouldSend: true };
    }

    if (subscriber.email !== input.email || subscriber.status === "confirmed") {
      return { shouldSend: false };
    }

    const cooldownPassed =
      !subscriber.confirmationLastAttemptedAt ||
      subscriber.confirmationLastAttemptedAt <= input.cooldownCutoff;
    const sendWindowExpired =
      !subscriber.confirmationSendWindowStartedAt ||
      subscriber.confirmationSendWindowStartedAt <= input.sendWindowCutoff;
    const sendAvailable = sendWindowExpired || subscriber.confirmationSendCount < input.maximumSendsPerWindow;

    if (!cooldownPassed || !sendAvailable) {
      return { shouldSend: false };
    }

    subscriber.status = "pending";
    subscriber.confirmationTokenHash = input.confirmationTokenHash;
    subscriber.confirmationTokenExpiresAt = input.confirmationTokenExpiresAt;
    subscriber.confirmationSentAt = null;
    subscriber.confirmationLastAttemptedAt = input.attemptedAt;
    subscriber.confirmationSendCount = sendWindowExpired ? 1 : subscriber.confirmationSendCount + 1;
    subscriber.confirmationSendWindowStartedAt = sendWindowExpired
      ? input.attemptedAt
      : subscriber.confirmationSendWindowStartedAt;
    subscriber.consentVersion = input.consentVersion;
    return { shouldSend: true };
  }

  async markConfirmationSent(confirmationTokenHash: string, sentAt: Date): Promise<void> {
    if (
      this.subscriber?.status === "pending" &&
      this.subscriber.confirmationTokenHash === confirmationTokenHash
    ) {
      this.subscriber.confirmationSentAt = sentAt;
    }
  }

  async releaseFailedConfirmation(confirmationTokenHash: string): Promise<void> {
    if (
      this.subscriber?.status === "pending" &&
      this.subscriber.confirmationTokenHash === confirmationTokenHash
    ) {
      this.subscriber.confirmationTokenHash = null;
      this.subscriber.confirmationTokenExpiresAt = null;
      this.subscriber.confirmationSentAt = null;
      this.subscriber.confirmationLastAttemptedAt = null;
    }
  }

  async confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult> {
    const subscriber = this.subscriber;

    if (!subscriber || subscriber.confirmationTokenHash !== confirmationTokenHash) {
      return "invalid";
    }

    if (subscriber.status === "confirmed") {
      return "confirmed";
    }

    if (subscriber.status !== "pending" || !subscriber.confirmationTokenExpiresAt) {
      return "invalid";
    }

    if (subscriber.confirmationTokenExpiresAt <= confirmedAt) {
      return "expired";
    }

    subscriber.status = "confirmed";
    subscriber.confirmedAt = confirmedAt;
    subscriber.unsubscribeTokenVersion += 1;
    return "confirmed";
  }

  async unsubscribe(
    subscriberId: string,
    tokenVersion: number,
    unsubscribedAt: Date,
  ): Promise<boolean> {
    const subscriber = this.subscriber;

    if (
      !subscriber ||
      subscriber.id !== subscriberId ||
      subscriber.unsubscribeTokenVersion !== tokenVersion ||
      !["confirmed", "unsubscribed"].includes(subscriber.status)
    ) {
      return false;
    }

    if (subscriber.status === "confirmed") {
      subscriber.status = "unsubscribed";
      subscriber.unsubscribedAt = unsubscribedAt;
    }

    return true;
  }
}

class FakeEmailSender implements ConfirmationEmailSender {
  sent: SendConfirmationInput[] = [];
  error: Error | null = null;

  async sendConfirmation(input: SendConfirmationInput): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    this.sent.push(input);
  }
}

let store: InMemoryWaitlistStore;
let emailSender: FakeEmailSender;
let now: Date;
let tokens: string[];

function dependencies() {
  return {
    store,
    emailSender,
    consentVersion: "road-to-mainnet-v1",
    now: () => now,
    createToken: () => tokens.shift() ?? TOKEN_FOUR,
  };
}

async function signup(email = "person@example.com") {
  await requestWaitlistSignup(dependencies(), email);
}

async function confirmLatest(): Promise<ConfirmationResult> {
  const token = emailSender.sent.at(-1)?.token;
  if (!token) throw new Error("Expected a confirmation email");
  return confirmWaitlistSubscription(store, token, now);
}

beforeEach(() => {
  store = new InMemoryWaitlistStore();
  emailSender = new FakeEmailSender();
  now = new Date(START);
  tokens = [TOKEN_ONE, TOKEN_TWO, TOKEN_THREE, TOKEN_FOUR];
});

describe("email validation", () => {
  test("normalizes a valid address", () => {
    expect(normalizeEmail("  Person.Name+Mainnet@Example.COM ")).toBe(
      "person.name+mainnet@example.com",
    );
  });

  test.each(["person", "@example.com", "person@", "person..name@example.com", "person@example"])(
    "rejects malformed address %s",
    (email) => {
      expect(normalizeEmail(email)).toBeNull();
    },
  );

  test("rejects an excessive address length", () => {
    expect(normalizeEmail(`${"a".repeat(245)}@example.com`)).toBeNull();
  });
});

describe("signup", () => {
  test("creates a pending subscriber and sends one confirmation", async () => {
    await signup(" Person@Example.COM ");

    expect(store.subscriber?.email).toBe("person@example.com");
    expect(store.subscriber?.status).toBe("pending");
    expect(store.subscriber?.confirmationTokenHash).toBe(hashConfirmationToken(TOKEN_ONE));
    expect(store.subscriber?.confirmationTokenHash).not.toContain(TOKEN_ONE);
    expect(store.subscriber?.confirmationTokenExpiresAt).toEqual(
      new Date(START.getTime() + 24 * 60 * 60 * 1_000),
    );
    expect(emailSender.sent).toHaveLength(1);
  });

  test("handles concurrent duplicate signup with one send", async () => {
    await Promise.all([signup(), signup()]);

    expect(emailSender.sent).toHaveLength(1);
    expect(store.subscriber?.confirmationSendCount).toBe(1);
  });

  test("does not resend during the cooldown", async () => {
    await signup();
    now = new Date(START.getTime() + 14 * 60 * 1_000);
    await signup();

    expect(emailSender.sent).toHaveLength(1);
  });

  test("resends with a rotated token after the cooldown", async () => {
    await signup();
    now = new Date(START.getTime() + 16 * 60 * 1_000);
    await signup();

    expect(emailSender.sent).toHaveLength(2);
    expect(emailSender.sent[1]?.token).toBe(TOKEN_TWO);
    expect(store.subscriber?.confirmationSendCount).toBe(2);
  });

  test("limits confirmation sends to three in a 24-hour window", async () => {
    await signup();
    now = new Date(START.getTime() + 16 * 60 * 1_000);
    await signup();
    now = new Date(START.getTime() + 32 * 60 * 1_000);
    await signup();
    now = new Date(START.getTime() + 48 * 60 * 1_000);
    await signup();

    expect(emailSender.sent).toHaveLength(3);
  });

  test("accepts an already-confirmed signup without another send", async () => {
    await signup();
    expect(await confirmLatest()).toBe("confirmed");
    now = new Date(START.getTime() + 16 * 60 * 1_000);
    await signup();

    expect(emailSender.sent).toHaveLength(1);
  });

  test("returns an unsubscribed subscriber to pending with a fresh confirmation", async () => {
    await signup();
    expect(await confirmLatest()).toBe("confirmed");
    const version = store.subscriber?.unsubscribeTokenVersion ?? 0;
    const token = createUnsubscribeToken(SUBSCRIBER_ID, version, UNSUBSCRIBE_SECRET);
    expect(await unsubscribeWaitlistSubscriber(store, token, UNSUBSCRIBE_SECRET, now)).toBe(true);

    now = new Date(START.getTime() + 16 * 60 * 1_000);
    await signup();

    expect(store.subscriber?.status).toBe("pending");
    expect(emailSender.sent).toHaveLength(2);
  });

  test("releases a definite provider failure for a safe retry", async () => {
    emailSender.error = new ConfirmationEmailError("definite");

    await expect(signup()).rejects.toBeInstanceOf(WaitlistUnavailableError);
    expect(store.subscriber?.confirmationTokenHash).toBeNull();

    emailSender.error = null;
    await signup();
    expect(emailSender.sent).toHaveLength(1);
  });

  test("does not duplicate an ambiguous provider send during cooldown", async () => {
    emailSender.error = new ConfirmationEmailError("ambiguous-or-retryable");

    await expect(signup()).rejects.toBeInstanceOf(WaitlistUnavailableError);
    expect(store.subscriber?.confirmationTokenHash).toBe(hashConfirmationToken(TOKEN_ONE));

    emailSender.error = null;
    await signup();
    expect(emailSender.sent).toHaveLength(0);
  });

  test("rejects malformed input before database or email work", async () => {
    await expect(requestWaitlistSignup(dependencies(), "not-an-email")).rejects.toBeInstanceOf(
      InvalidWaitlistEmailError,
    );
    expect(store.subscriber).toBeNull();
    expect(emailSender.sent).toHaveLength(0);
  });
});

describe("confirmation", () => {
  test("confirms a valid token and treats replay as success", async () => {
    await signup();

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(1);
  });

  test("rejects an expired token", async () => {
    await signup();
    now = new Date(START.getTime() + 24 * 60 * 60 * 1_000 + 1);

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("expired");
    expect(store.subscriber?.status).toBe("pending");
  });

  test("rejects malformed and unknown tokens", async () => {
    expect(await confirmWaitlistSubscription(store, "bad-token", now)).toBe("invalid");
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("invalid");
  });

  test("does not let an old confirmation token reactivate an unsubscribe", async () => {
    await signup();
    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("confirmed");
    const unsubscribeToken = createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);
    expect(
      await unsubscribeWaitlistSubscriber(store, unsubscribeToken, UNSUBSCRIBE_SECRET, now),
    ).toBe(true);

    expect(await confirmWaitlistSubscription(store, TOKEN_ONE, now)).toBe("invalid");
    expect(store.subscriber?.status).toBe("unsubscribed");
  });
});

describe("unsubscribe", () => {
  async function confirmedSubscriber() {
    await signup();
    expect(await confirmLatest()).toBe("confirmed");
    return createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);
  }

  test("accepts a valid signature and repeated unsubscribe", async () => {
    const token = await confirmedSubscriber();

    expect(await unsubscribeWaitlistSubscriber(store, token, UNSUBSCRIBE_SECRET, now)).toBe(true);
    const firstUnsubscribedAt = store.subscriber?.unsubscribedAt;
    now = new Date(START.getTime() + 1_000);
    expect(await unsubscribeWaitlistSubscriber(store, token, UNSUBSCRIBE_SECRET, now)).toBe(true);
    expect(store.subscriber?.unsubscribedAt).toEqual(firstUnsubscribedAt);
  });

  test("accepts canonical unsubscribe version 1", () => {
    const token = createUnsubscribeToken(SUBSCRIBER_ID, 1, UNSUBSCRIBE_SECRET);

    expect(verifyUnsubscribeToken(token, UNSUBSCRIBE_SECRET)).toEqual({
      subscriberId: SUBSCRIBER_ID,
      tokenVersion: 1,
    });
  });

  test("rejects an invalid signature", async () => {
    const token = await confirmedSubscriber();
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(await unsubscribeWaitlistSubscriber(store, tampered, UNSUBSCRIBE_SECRET, now)).toBe(
      false,
    );
  });

  test("rejects a changed token version", async () => {
    await confirmedSubscriber();
    const wrongVersion = createUnsubscribeToken(SUBSCRIBER_ID, 2, UNSUBSCRIBE_SECRET);

    expect(
      await unsubscribeWaitlistSubscriber(store, wrongVersion, UNSUBSCRIBE_SECRET, now),
    ).toBe(false);
  });

  test.each(["0", "01", "+1", "1e0", "1.0", "-1", " 1", "1 ", "2147483648"])(
    "rejects non-canonical unsubscribe version %s",
    async (version) => {
      const token = await confirmedSubscriber();
      const [prefix, subscriberId, , signature] = token.split(".");
      const nonCanonical = `${prefix}.${subscriberId}.${version}.${signature}`;

      expect(
        await unsubscribeWaitlistSubscriber(store, nonCanonical, UNSUBSCRIBE_SECRET, now),
      ).toBe(false);
    },
  );

  test.each([0, -1, 1.5, 2_147_483_648])(
    "rejects creation with unsubscribe version %d",
    (version) => {
      expect(() => createUnsubscribeToken(SUBSCRIBER_ID, version, UNSUBSCRIBE_SECRET)).toThrow(
        RangeError,
      );
    },
  );

  test("reconfirmation invalidates the previous consent-period token", async () => {
    const oldToken = await confirmedSubscriber();
    expect(await unsubscribeWaitlistSubscriber(store, oldToken, UNSUBSCRIBE_SECRET, now)).toBe(true);

    now = new Date(START.getTime() + 16 * 60 * 1_000);
    await signup();
    expect(await confirmLatest()).toBe("confirmed");
    expect(store.subscriber?.unsubscribeTokenVersion).toBe(2);

    expect(await unsubscribeWaitlistSubscriber(store, oldToken, UNSUBSCRIBE_SECRET, now)).toBe(
      false,
    );
    expect(store.subscriber?.status).toBe("confirmed");
  });
});
