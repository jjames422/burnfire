// Shared by the database/API tests. API tests must run with the same
// EMAIL_ENCRYPTION_KEY as the development server they call.
import { emailIndex, encryptEmail } from "../lib/server/email-privacy.ts";

export { emailIndex };

/** [email_hash, email_encrypted] for inserting a test account or invitation. */
export function storedEmail(email) {
  return [emailIndex(email), encryptEmail(email)];
}
