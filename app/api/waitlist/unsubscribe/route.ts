import { getUnsubscribeSecret } from "@/lib/waitlist/config";
import {
  InvalidJsonBodyError,
  readJsonObject,
  RequestBodyTooLargeError,
  UnsupportedContentTypeError,
  waitlistJson,
} from "@/lib/waitlist/request";
import { isUnsubscribeToken } from "@/lib/waitlist/security";
import {
  unsubscribeWaitlistSubscriber,
  WAITLIST_UNSUBSCRIBED_MESSAGE,
} from "@/lib/waitlist/service";
import { getWaitlistStore } from "@/lib/waitlist/store";

const INVALID_TOKEN_MESSAGE = "This unsubscribe link is invalid.";
const UNAVAILABLE_MESSAGE = "We could not unsubscribe you right now. Please try again.";

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

  if (!isUnsubscribeToken(body.token)) {
    return waitlistJson({ ok: false, message: INVALID_TOKEN_MESSAGE }, 400);
  }

  try {
    const unsubscribed = await unsubscribeWaitlistSubscriber(
      getWaitlistStore(),
      body.token,
      getUnsubscribeSecret(),
    );

    if (!unsubscribed) {
      return waitlistJson({ ok: false, message: INVALID_TOKEN_MESSAGE }, 400);
    }

    return waitlistJson({ ok: true, message: WAITLIST_UNSUBSCRIBED_MESSAGE }, 200);
  } catch {
    return waitlistJson({ ok: false, message: UNAVAILABLE_MESSAGE }, 503);
  }
}
