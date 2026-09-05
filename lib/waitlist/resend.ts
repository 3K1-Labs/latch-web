import "server-only";

import { getResendConfiguration, type ResendConfiguration } from "./config";
import { ConfirmationEmailError, type ConfirmationEmailSender } from "./service";

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;

type ResendResponseClassification = "success" | "definite" | "ambiguous-or-retryable";

async function readResendErrorName(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();

    if (body && typeof body === "object" && "name" in body && typeof body.name === "string") {
      return body.name;
    }
  } catch {
    // An unparseable provider response cannot establish that delivery definitely failed.
  }

  return null;
}

async function classifyResendResponse(response: Response): Promise<ResendResponseClassification> {
  if (response.ok) {
    return "success";
  }

  if (response.status === 409) {
    const errorName = await readResendErrorName(response);
    return errorName === "invalid_idempotent_request" ? "definite" : "ambiguous-or-retryable";
  }

  if (
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500 ||
    response.status < 400
  ) {
    return "ambiguous-or-retryable";
  }

  return "definite";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export class ResendConfirmationEmailSender implements ConfirmationEmailSender {
  constructor(
    private readonly configuration: ResendConfiguration,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async sendConfirmation({ email, token, tokenHash }: Parameters<ConfirmationEmailSender["sendConfirmation"]>[0]) {
    const confirmationUrl = new URL("/waitlist/confirm", this.configuration.publicOrigin);
    confirmationUrl.searchParams.set("token", token);
    const safeUrl = escapeHtml(confirmationUrl.toString());

    const body: Record<string, unknown> = {
      from: this.configuration.fromEmail,
      to: [email],
      subject: "Confirm your place on Latch's Road to Mainnet",
      text: [
        "Confirm your place on Latch's Road to Mainnet waitlist.",
        "",
        `Confirm your email: ${confirmationUrl.toString()}`,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>Confirm your place on Latch&rsquo;s Road to Mainnet waitlist.</p>",
        `<p><a href="${safeUrl}">Confirm your email</a></p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    };

    if (this.configuration.replyTo) {
      body.reply_to = this.configuration.replyTo;
    }

    let response: Response;

    try {
      response = await this.fetchImplementation(RESEND_EMAILS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.configuration.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `waitlist-confirmation/${tokenHash}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
    } catch {
      throw new ConfirmationEmailError("ambiguous-or-retryable");
    }

    const classification = await classifyResendResponse(response);

    if (classification !== "success") {
      throw new ConfirmationEmailError(classification);
    }
  }
}

export function getConfirmationEmailSender(): ConfirmationEmailSender {
  return new ResendConfirmationEmailSender(getResendConfiguration());
}
