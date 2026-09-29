import { NextResponse, type NextRequest } from "next/server";
import { locked, serverError, timezoneFor } from "@/lib/guard";
import { OPENING_MESSAGE } from "@/lib/morris";
import { getProfile, todaySummary } from "@/lib/data";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: number; role: string; content: string; created_at: string };

// Called each time the app opens. After onboarding the screen starts empty:
// every message stays saved and Morris still uses recent ones as memory, they
// just aren't shown. During onboarding the conversation is shown so it can be
// picked up where it left off. On the very first visit it adds Morris's
// opening message.
export async function GET(req: NextRequest) {
  const deny = await locked(req);
  if (deny) return deny;
  try {
    const tz = await timezoneFor(req);
    const profile = await getProfile();
    let rows: Row[] = [];

    if (!profile.onboarding_completed_at) {
      rows = must(
        await db()
          .from("chat_messages")
          .select("id, role, content, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(60),
      ) as Row[];
      rows.reverse();

      if (!rows.length) {
        const opening = must(
          await db()
            .from("chat_messages")
            .insert({ role: "assistant", content: OPENING_MESSAGE })
            .select("id, role, content, created_at")
            .single(),
        ) as Row;
        rows = [opening];
      }
    }
    return NextResponse.json({ messages: rows, today: await todaySummary(tz) });
  } catch (e) {
    return serverError(e);
  }
}
