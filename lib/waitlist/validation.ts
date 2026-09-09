const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const LOCAL_PART_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const email = input.trim().toLowerCase();

  if (!email || email.length > MAX_EMAIL_LENGTH || !/^[\x20-\x7e]+$/.test(email)) {
    return null;
  }

  const atIndex = email.indexOf("@");

  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) {
    return null;
  }

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (
    localPart.length > MAX_LOCAL_PART_LENGTH ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return null;
  }

  const labels = domain.split(".");

  if (
    labels.length < 2 ||
    domain.length > 253 ||
    labels.some((label) => label.length === 0 || label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    return null;
  }

  return email;
}
