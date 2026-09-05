import {
  InvalidJsonBodyError,
  readJsonObject,
  RequestBodyTooLargeError,
  UnsupportedContentTypeError,
  waitlistJson,
} from "@/lib/waitlist/request";
import { isConfirmationToken } from "@/lib/waitlist/security";
import { confirmWaitlistSubscription, WAITLIST_CONFIRMED_MESSAGE } from "@/lib/waitlist/service";
import { getWaitlistStore } from "@/lib/waitlist/store";

const INVALID_TOKEN_MESSAGE = "This confirmation link is invalid or expired.";
const UNAVAILABLE_MESSAGE = "We could not confirm your subscription right now. Please try again.";

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    if (error instanceof UnsupportedContentTypeError) {
      return waitlistJson({ ok: false, message: "Content-Type must be application/json." }, 415);
    }

    if (error instanceof RequestBodyTooLargeError) {
      return waitlistJson({ ok: false, message: "Request body is too large." }, 413);
    }

    if (error instanceof InvalidJsonBodyError) {
      return waitlistJson({ ok: false, message: INVALID_TOKEN_MESSAGE }, 400);
    }

    return waitlistJson({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
  }

  if (!isConfirmationToken(body.token)) {
    return waitlistJson({ ok: false, message: INVALID_TOKEN_MESSAGE }, 400);
  }

  try {
    const result = await confirmWaitlistSubscription(getWaitlistStore(), body.token);

    if (result !== "confirmed") {
      return waitlistJson({ ok: false, message: INVALID_TOKEN_MESSAGE }, 400);
    }

    return waitlistJson({ ok: true, message: WAITLIST_CONFIRMED_MESSAGE }, 200);
  } catch {
    return waitlistJson({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
  }
}
