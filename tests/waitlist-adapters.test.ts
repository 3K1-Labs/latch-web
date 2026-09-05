import { describe, expect, mock, test } from "bun:test";
import {
  ConfirmationEmailError,
  type ConfirmationEmailFailureKind,
  type ConfirmationEmailSender,
  type ConfirmationResult,
  type SignupPreparation,
  type WaitlistStore,
} from "../lib/waitlist/service";

mock.module("server-only", () => ({}));

const { ResendConfirmationEmailSender } = await import("../lib/waitlist/resend");
const { handleWaitlistSignupRequest } = await import("../lib/waitlist/signup-route");

const EMAIL_INPUT = {
  email: "person@example.com",
  token: Buffer.alloc(32, 1).toString("base64url"),
  tokenHash: "a".repeat(64),
};

const RESEND_CONFIGURATION = {
  apiKey: "re_test",
  publicOrigin: "https://uselatch.app",
  fromEmail: "Latch <updates@uselatch.app>",
};

function responseFetch(status: number, name?: string): typeof fetch {
  return (async () =>
    new Response(name ? JSON.stringify({ name }) : null, {
      status,
      headers: name ? { "Content-Type": "application/json" } : undefined,
    })) as unknown as typeof fetch;
}

async function expectFailureKind(
  status: number,
  expected: ConfirmationEmailFailureKind,
  name?: string,
): Promise<void> {
  const sender = new ResendConfirmationEmailSender(
    RESEND_CONFIGURATION,
    responseFetch(status, name),
  );

  try {
    await sender.sendConfirmation(EMAIL_INPUT);
    throw new Error("Expected the Resend adapter to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ConfirmationEmailError);
    expect((error as ConfirmationEmailError).failureKind).toBe(expected);
  }
}

describe("Resend response classification", () => {
  test.each([400, 401, 403, 404, 422])("classifies HTTP %d as definite", async (status) => {
    await expectFailureKind(status, "definite");
  });

  test("classifies a conflicting payload as definite", async () => {
    await expectFailureKind(409, "definite", "invalid_idempotent_request");
  });

  test("preserves a concurrent idempotent request", async () => {
    await expectFailureKind(409, "ambiguous-or-retryable", "concurrent_idempotent_requests");
  });

  test("preserves an unrecognized 409 response", async () => {
    await expectFailureKind(409, "ambiguous-or-retryable");
  });

  test.each([408, 425, 429, 500, 502, 503])(
    "classifies HTTP %d as ambiguous or retryable",
    async (status) => {
      await expectFailureKind(status, "ambiguous-or-retryable");
    },
  );

  test.each([
    new Error("network failure"),
    new DOMException("The operation timed out", "TimeoutError"),
  ])("classifies a network exception as ambiguous", async (networkError) => {
    const sender = new ResendConfirmationEmailSender(
      RESEND_CONFIGURATION,
      (async () => {
        throw networkError;
      }) as unknown as typeof fetch,
    );

    try {
      await sender.sendConfirmation(EMAIL_INPUT);
      throw new Error("Expected the Resend adapter to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfirmationEmailError);
      expect((error as ConfirmationEmailError).failureKind).toBe("ambiguous-or-retryable");
    }
  });

  test("accepts a successful response and sends a stable idempotency key", async () => {
    let request: RequestInit | undefined;
    const sender = new ResendConfirmationEmailSender(
      RESEND_CONFIGURATION,
      (async (input, init) => {
        void input;
        request = init;
        return new Response(null, { status: 200 });
      }) as typeof fetch,
    );

    await expect(sender.sendConfirmation(EMAIL_INPUT)).resolves.toBeUndefined();
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      `waitlist-confirmation/${EMAIL_INPUT.tokenHash}`,
    );
  });
});

type SubscriberState = "new" | "pending" | "confirmed" | "unsubscribed";

class RouteStore implements WaitlistStore {
  constructor(private readonly state: SubscriberState) {}

  async prepareSignup(): Promise<SignupPreparation> {
    return { shouldSend: this.state !== "confirmed" };
  }

  async markConfirmationSent(): Promise<void> {}
  async releaseFailedConfirmation(): Promise<void> {}
  async confirm(): Promise<ConfirmationResult> {
    return "invalid";
  }
  async unsubscribe(): Promise<boolean> {
    return false;
  }
}

class FailingRouteStore extends RouteStore {
  override async prepareSignup(): Promise<SignupPreparation> {
    throw new Error("database unavailable");
  }
}

const failingEmailSender: ConfirmationEmailSender = {
  async sendConfirmation() {
    throw new ConfirmationEmailError("ambiguous-or-retryable");
  },
};

function signupRequest(): Request {
  return new Request("https://uselatch.app/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com" }),
  });
}

describe("signup public response", () => {
  test.each(["new", "pending", "confirmed", "unsubscribed"] as const)(
    "returns the same accepted response for subscriber state %s during provider failure",
    async (state) => {
      const reported: string[] = [];
      const response = await handleWaitlistSignupRequest(signupRequest(), {
        getStore: () => new RouteStore(state),
        getEmailSender: () => failingEmailSender,
        getConsentVersion: () => "road-to-mainnet-v1",
        reportFailure: (kind) => reported.push(kind),
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({
        ok: true,
        message: "Check your email to confirm your subscription.",
      });
      expect(reported).toEqual(state === "confirmed" ? [] : ["confirmation-email"]);
    },
  );

  test("reports a database failure without changing the accepted response", async () => {
    const reported: string[] = [];
    const response = await handleWaitlistSignupRequest(signupRequest(), {
      getStore: () => new FailingRouteStore("new"),
      getEmailSender: () => failingEmailSender,
      getConsentVersion: () => "road-to-mainnet-v1",
      reportFailure: (kind) => reported.push(kind),
    });

    expect(response.status).toBe(202);
    expect(reported).toEqual(["database-or-configuration"]);
  });
});
