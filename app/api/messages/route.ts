import { NextResponse, type NextRequest } from "next/server";
import { locked, serverError, timezoneFor } from "@/lib/guard";
import { OPENING_MESSAGE } from "@/lib/morris";
import { todaySummary } from "@/lib/data";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the recent conversation plus today's summary. On the very first
// visit it adds Morris's opening message, which starts onboarding.
export async function GET(req: NextRequest) {
  const deny = await locked(req);
  if (deny) return deny;
  try {
    const tz = await timezoneFor(req);
    let rows = must(
      await db()
        .from("chat_messages")
        .select("id, role, content, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(60),
    ) as { id: number; role: string; content: string; created_at: string }[];

    if (!rows.length) {
      const { count } = await db().from("chat_messages").select("id", { count: "exact", head: true });
      if (!count) {
        const opening = must(
          await db()
            .from("chat_messages")
            .insert({ role: "assistant", content: OPENING_MESSAGE })
            .select("id, role, content, created_at")
            .single(),
        ) as (typeof rows)[number];
        rows = [opening];
      }
    }
    return NextResponse.json({ messages: rows.reverse(), today: await todaySummary(tz) });
  } catch (e) {
    return serverError(e);
  }
}
