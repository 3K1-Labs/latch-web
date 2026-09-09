import "server-only";

export class WaitlistConfigurationError extends Error {
  constructor(name: string) {
    super(`Missing or invalid server configuration: ${name}`);
    this.name = "WaitlistConfigurationError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WaitlistConfigurationError(name);
  }

  return value;
}

export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export function getWaitlistConsentVersion(): string {
  const version = required("WAITLIST_CONSENT_VERSION");

  if (version.length > 100) {
    throw new WaitlistConfigurationError("WAITLIST_CONSENT_VERSION");
  }

  return version;
}

export function getUnsubscribeSecret(): string {
  const secret = required("WAITLIST_UNSUBSCRIBE_SECRET");

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new WaitlistConfigurationError("WAITLIST_UNSUBSCRIBE_SECRET");
  }

  return secret;
}

export type ResendConfiguration = {
  apiKey: string;
  publicOrigin: string;
  fromEmail: string;
  replyTo?: string;
};

export function getResendConfiguration(): ResendConfiguration {
  const originValue = required("WAITLIST_PUBLIC_ORIGIN");
  let origin: URL;

  try {
    origin = new URL(originValue);
  } catch {
    throw new WaitlistConfigurationError("WAITLIST_PUBLIC_ORIGIN");
  }

  const localhost = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  const allowedProtocol = origin.protocol === "https:" || (localhost && origin.protocol === "http:");

  if (
    !allowedProtocol ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  ) {
    throw new WaitlistConfigurationError("WAITLIST_PUBLIC_ORIGIN");
  }

  return {
    apiKey: required("RESEND_API_KEY"),
    publicOrigin: origin.origin,
    fromEmail: required("WAITLIST_FROM_EMAIL"),
    replyTo: process.env.WAITLIST_REPLY_TO?.trim() || undefined,
  };
}
