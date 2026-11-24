import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/lib/i18n/locales";
import { query, queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";
import { sourceHash, TranslationUnavailable, translateChatMessage } from "@/lib/server/message-translation";

// New translations one member can request per hour; cached ones are free.
const HOURLY_LIMIT = 60;

/** Translates a chat message the member can read into their language. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: messageId } = await params;

  const body = await request.json().catch(() => null);
  const locale = body?.locale;
  if (!isLocale(locale)) return jsonError("Unsupported language preference.");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return jsonError("Message not found", 404);

  const message = await queryOne<{ body: string }>(
    `select m.body from messages m
     where m.id = $2 and m.deleted_at is null
       and can_access_channel($1, m.channel_id)
       and not is_blocked_pair($1, m.author_id)`,
    [user.id, messageId],
  );
  if (!message) return jsonError("Message not found", 404);

  const hash = sourceHash(message.body);
  const cached = await queryOne<{ body: string }>(
    `select body from message_translations where message_id = $1 and locale = $2 and source_hash = $3`,
    [messageId, locale, hash],
  );
  if (cached) return NextResponse.json({ translation: cached.body });

  const recent = await queryOne<{ total: number }>(
    `select count(*)::int total from message_translations
     where requested_by = $1 and created_at > now() - interval '1 hour'`,
    [user.id],
  );
  if ((recent?.total ?? 0) >= HOURLY_LIMIT) return jsonError("Translation limit reached. Try again later.", 429);

  let translation: string;
  try {
    translation = await translateChatMessage(message.body, locale);
  } catch (error) {
    if (error instanceof TranslationUnavailable) return jsonError(error.message, 503);
    throw error;
  }

  await query(
    `insert into message_translations (message_id, locale, source_hash, body, requested_by)
     values ($1, $2, $3, $4, $5)
     on conflict (message_id, locale) do update
       set source_hash = excluded.source_hash, body = excluded.body,
           requested_by = excluded.requested_by, created_at = now()`,
    [messageId, locale, hash, translation, user.id],
  );
  return NextResponse.json({ translation });
}
