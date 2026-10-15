import "server-only";
import { createHmac } from "node:crypto";

/**
 * The vote token links nothing to a person on its own: HMAC(secret, profile|ballot).
 * The same person always gets the same token for a ballot, so a vote can be
 * changed until closing time, but only the server holding the secret could
 * recompute it. The secret never enters the database.
 */
export function voterToken(profileId: string, ballotId: string): Buffer {
  const secret = process.env.BALLOT_SECRET;
  if (!secret || secret.length < 32) throw new Error("BALLOT_SECRET must be set (at least 32 characters)");
  return createHmac("sha256", secret).update(`${profileId}|${ballotId}`).digest();
}
