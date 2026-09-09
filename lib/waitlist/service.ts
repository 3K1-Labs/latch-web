import {
  createConfirmationToken,
  hashConfirmationToken,
  isConfirmationToken,
  verifyUnsubscribeToken,
} from "./security";
import { normalizeEmail } from "./validation";

const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1_000;
const CONFIRMATION_COOLDOWN_MS = 15 * 60 * 1_000;
const CONFIRMATION_SEND_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_CONFIRMATION_SENDS_PER_WINDOW = 3;

export const WAITLIST_ACCEPTED_MESSAGE = "Check your email to confirm your subscription.";
export const WAITLIST_CONFIRMED_MESSAGE = "Your email is confirmed.";
export const WAITLIST_UNSUBSCRIBED_MESSAGE = "You have been unsubscribed.";

export type SignupPreparation = {
  shouldSend: boolean;
};

export type PrepareSignupInput = {
  email: string;
  confirmationTokenHash: string;
  confirmationTokenExpiresAt: Date;
  attemptedAt: Date;
  cooldownCutoff: Date;
  sendWindowCutoff: Date;
  maximumSendsPerWindow: number;
  consentVersion: string;
};

export type ConfirmationResult = "confirmed" | "expired" | "invalid";

export interface WaitlistStore {
  prepareSignup(input: PrepareSignupInput): Promise<SignupPreparation>;
  markConfirmationSent(confirmationTokenHash: string, sentAt: Date): Promise<void>;
  releaseFailedConfirmation(confirmationTokenHash: string, releasedAt: Date): Promise<void>;
  confirm(confirmationTokenHash: string, confirmedAt: Date): Promise<ConfirmationResult>;
  unsubscribe(subscriberId: string, tokenVersion: number, unsubscribedAt: Date): Promise<boolean>;
}

export type SendConfirmationInput = {
  email: string;
  token: string;
  tokenHash: string;
};

export interface ConfirmationEmailSender {
  sendConfirmation(input: SendConfirmationInput): Promise<void>;
}

export type ConfirmationEmailFailureKind = "definite" | "ambiguous-or-retryable";

export class ConfirmationEmailError extends Error {
  constructor(public readonly failureKind: ConfirmationEmailFailureKind) {
    super("Confirmation email could not be delivered");
    this.name = "ConfirmationEmailError";
  }
}

export class InvalidWaitlistEmailError extends Error {
  constructor() {
    super("Invalid waitlist email");
    this.name = "InvalidWaitlistEmailError";
  }
}

export class WaitlistUnavailableError extends Error {
  constructor() {
    super("Waitlist service unavailable");
    this.name = "WaitlistUnavailableError";
  }
}

type SignupDependencies = {
  store: WaitlistStore;
  emailSender: ConfirmationEmailSender;
  consentVersion: string;
  now?: () => Date;
  createToken?: () => string;
};

export async function requestWaitlistSignup(
  dependencies: SignupDependencies,
  emailInput: unknown,
): Promise<void> {
  const email = normalizeEmail(emailInput);

  if (!email) {
    throw new InvalidWaitlistEmailError();
  }

  const now = dependencies.now?.() ?? new Date();
  const token = dependencies.createToken?.() ?? createConfirmationToken();
  const tokenHash = hashConfirmationToken(token);
  const preparation = await dependencies.store.prepareSignup({
    email,
    confirmationTokenHash: tokenHash,
    confirmationTokenExpiresAt: new Date(now.getTime() + CONFIRMATION_TTL_MS),
    attemptedAt: now,
    cooldownCutoff: new Date(now.getTime() - CONFIRMATION_COOLDOWN_MS),
    sendWindowCutoff: new Date(now.getTime() - CONFIRMATION_SEND_WINDOW_MS),
    maximumSendsPerWindow: MAX_CONFIRMATION_SENDS_PER_WINDOW,
    consentVersion: dependencies.consentVersion,
  });

  if (!preparation.shouldSend) {
    return;
  }

  try {
    await dependencies.emailSender.sendConfirmation({ email, token, tokenHash });
  } catch (error) {
    if (error instanceof ConfirmationEmailError && error.failureKind === "definite") {
      try {
        await dependencies.store.releaseFailedConfirmation(tokenHash, now);
      } catch {
        // The public response remains generic; a later attempt is still bounded by database state.
      }
    }

    throw new WaitlistUnavailableError();
  }

  try {
    await dependencies.store.markConfirmationSent(tokenHash, now);
  } catch {
    // The token was stored before sending and remains usable. Failing the request here would
    // encourage a retry even though the email has already been accepted by the provider.
  }
}

export async function confirmWaitlistSubscription(
  store: WaitlistStore,
  token: unknown,
  now: Date = new Date(),
): Promise<ConfirmationResult> {
  if (!isConfirmationToken(token)) {
    return "invalid";
  }

  return store.confirm(hashConfirmationToken(token), now);
}

export async function unsubscribeWaitlistSubscriber(
  store: WaitlistStore,
  token: unknown,
  secret: string,
  now: Date = new Date(),
): Promise<boolean> {
  const verified = verifyUnsubscribeToken(token, secret);

  if (!verified) {
    return false;
  }

  return store.unsubscribe(verified.subscriberId, verified.tokenVersion, now);
}
