import { getWaitlistConsentVersion } from "@/lib/waitlist/config";
import { getConfirmationEmailSender } from "@/lib/waitlist/resend";
import { handleWaitlistSignupRequest } from "@/lib/waitlist/signup-route";
import { getWaitlistStore } from "@/lib/waitlist/store";

export async function POST(request: Request): Promise<Response> {
  return handleWaitlistSignupRequest(request, {
    getStore: getWaitlistStore,
    getEmailSender: getConfirmationEmailSender,
    getConsentVersion: getWaitlistConsentVersion,
    reportFailure(kind) {
      console.error(`[waitlist] signup processing failed: ${kind}`);
    },
  });
}
