import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { hashAuthToken, newAuthToken, validAuthToken } from "../auth/security";
import { createSession, recentSession } from "./auth";
import { query, queryOne } from "./db";

type Purpose = "registration" | "authentication";
type Challenge = { challenge: string; user_id: string | null; session_hash: string | null };
type Passkey = {
  credential_id: string; user_id: string; public_key: Buffer; counter: string;
  transports: string[]; name: string; created_at: string; last_used_at: string | null;
};

function challengeCookie(purpose: Purpose): string {
  return `bf_passkey_${purpose}`;
}

async function saveChallenge(purpose: Purpose, challenge: string, userId?: string, sessionHash?: string) {
  const store = await cookies();
  const previous = store.get(challengeCookie(purpose))?.value;
  if (previous && validAuthToken(previous)) {
    await query("delete from auth_challenges where token_hash = $1", [hashAuthToken(previous)]);
  }
  await query("delete from auth_challenges where expires_at <= now()");
  const token = newAuthToken();
  await query(
    `insert into auth_challenges(token_hash, challenge, purpose, user_id, session_hash, expires_at)
     values ($1,$2,$3,$4,$5,now() + interval '5 minutes')`,
    [hashAuthToken(token), challenge, purpose, userId ?? null, sessionHash ?? null],
  );
  store.set(challengeCookie(purpose), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 300,
  });
}

async function consumeChallenge(purpose: Purpose): Promise<Challenge> {
  const store = await cookies();
  const token = store.get(challengeCookie(purpose))?.value;
  store.delete(challengeCookie(purpose));
  if (!validAuthToken(token)) throw new Error("The passkey request expired. Please try again.");
  const challenge = await queryOne<Challenge>(
    `delete from auth_challenges where token_hash = $1 and purpose = $2 and expires_at > now()
     returning challenge, user_id, session_hash`,
    [hashAuthToken(token), purpose],
  );
  if (!challenge) throw new Error("The passkey request expired or was already used. Please try again.");
  return challenge;
}

export async function registrationOptions(origin: string) {
  const session = await recentSession();
  if (!session) throw new Error("Sign in again before adding a passkey (within 10 minutes).");
  const existing = await query<{ credential_id: string; transports: string[] }>(
    "select credential_id, transports from passkeys where user_id = $1", [session.user.id],
  );
  if (existing.length >= 20) throw new Error("You have reached the 20-passkey limit. Remove an unused passkey first.");
  const options = await generateRegistrationOptions({
    rpName: "BurnFire", rpID: new URL(origin).hostname,
    userName: session.user.email, userID: new TextEncoder().encode(session.user.id),
    attestationType: "none",
    preferredAuthenticatorType: "localDevice",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials: existing.map((key) => ({ id: key.credential_id, transports: key.transports })),
  });
  await saveChallenge("registration", options.challenge, session.user.id, session.sessionHash);
  return options;
}

export async function registerPasskey(origin: string, response: RegistrationResponseJSON, rawName: unknown) {
  const challenge = await consumeChallenge("registration");
  const session = await recentSession();
  if (!session || challenge.user_id !== session.user.id || challenge.session_hash !== session.sessionHash) {
    throw new Error("Sign in again before adding a passkey.");
  }
  const result = await verifyRegistrationResponse({
    response, expectedChallenge: challenge.challenge, expectedOrigin: origin,
    expectedRPID: new URL(origin).hostname, requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo) throw new Error("The passkey could not be verified.");
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
  const added = await queryOne<{ credential_id: string }>(
    `insert into passkeys(credential_id,user_id,public_key,counter,transports,device_type,backed_up,name)
     values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(credential_id) do nothing returning credential_id`,
    [credential.id, session.user.id, Buffer.from(credential.publicKey), credential.counter,
      credential.transports ?? [], credentialDeviceType, credentialBackedUp, name || "My passkey"],
  );
  if (!added) throw new Error("This passkey is already registered. Use another passkey.");
}

export async function authenticationOptions(origin: string) {
  const options = await generateAuthenticationOptions({
    rpID: new URL(origin).hostname, userVerification: "required",
  });
  options.hints = ["client-device"];
  await saveChallenge("authentication", options.challenge);
  return options;
}

export async function authenticatePasskey(origin: string, response: AuthenticationResponseJSON) {
  const challenge = await consumeChallenge("authentication");
  if (!response || typeof response.id !== "string" || response.id.length > 2048) {
    throw new Error("The passkey response was invalid.");
  }
  const key = await queryOne<Passkey>("select * from passkeys where credential_id = $1", [response.id]);
  if (!key) throw new Error("This passkey is not registered. Sign in with email instead.");
  const result = await verifyAuthenticationResponse({
    response, expectedChallenge: challenge.challenge, expectedOrigin: origin,
    expectedRPID: new URL(origin).hostname, requireUserVerification: true,
    credential: {
      id: key.credential_id, publicKey: new Uint8Array(key.public_key),
      counter: Number(key.counter), transports: key.transports,
    },
  });
  if (!result.verified) throw new Error("The passkey could not be verified.");
  if (response.response.userHandle &&
      response.response.userHandle !== Buffer.from(key.user_id).toString("base64url")) {
    throw new Error("The passkey account did not match.");
  }
  const updated = await queryOne<{ user_id: string }>(
    `update passkeys set counter = $2, last_used_at = now(), backed_up = $3
     where credential_id = $1 and counter = $4 returning user_id`,
    [key.credential_id, result.authenticationInfo.newCounter,
      result.authenticationInfo.credentialBackedUp, key.counter],
  );
  if (!updated) throw new Error("This passkey was used by another request. Try again.");
  await createSession(key.user_id);
}
