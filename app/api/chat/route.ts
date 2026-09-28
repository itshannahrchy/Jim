import { NextResponse, type NextRequest } from "next/server";
import { locked, serverError, timezoneFor } from "@/lib/guard";
import { chatWithMorris } from "@/lib/morris";
import { todaySummary } from "@/lib/data";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const deny = await locked(req);
  if (deny) return deny;

  let message = "";
  try {
    message = String((await req.json()).message ?? "").trim().slice(0, 4000);
  } catch {
    /* ignore */
  }
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  try {
    const tz = await timezoneFor(req);
    const userRow = must(
      await db().from("chat_messages").insert({ role: "user", content: message }).select("id, role, content, created_at").single(),
    );

    let reply: string;
    try {
      reply = (await chatWithMorris(message, tz)).reply;
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: "Morris couldn't think just now (the AI service didn't answer). Your message is saved; try sending it again.", userMessage: userRow },
        { status: 502 },
      );
    }

    const assistantRow = must(
      await db().from("chat_messages").insert({ role: "assistant", content: reply }).select("id, role, content, created_at").single(),
    );
    return NextResponse.json({ userMessage: userRow, reply: assistantRow, today: await todaySummary(tz) });
  } catch (e) {
    return serverError(e);
  }
}
