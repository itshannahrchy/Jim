import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { locked, serverError, timezoneFor } from "@/lib/guard";
import { chatWithMorris } from "@/lib/morris";
import { todaySummary } from "@/lib/data";
import { db, must } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Turns an Anthropic API failure into a plain-language reason (never includes the key).
function explainAiError(e: unknown): string {
  const saved = " Your message is saved; send it again once this is fixed.";
  const detail =
    (e as { error?: { error?: { message?: string } } })?.error?.error?.message ?? (e as Error)?.message ?? "";
  if (!process.env.ANTHROPIC_API_KEY) {
    return "Morris has no API key: ANTHROPIC_API_KEY is missing in Vercel's environment variables (then redeploy)." + saved;
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel (no extra spaces), then redeploy." + saved;
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return `The Anthropic key isn't allowed to do this (${detail}).` + saved;
  }
  if (e instanceof Anthropic.NotFoundError) {
    return `The AI model wasn't found for this account (${detail}).` + saved;
  }
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit|billing|balance/i.test(detail)) {
      return "The Anthropic account has no credit. Add credit in the Anthropic Console under Billing." + saved;
    }
    return `The AI service refused the request: ${detail}` + saved;
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Morris is being asked too much at once (rate limit). Wait a minute and try again." + saved;
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Try again in a moment." + saved;
  }
  if (e instanceof Anthropic.APIError) {
    return `The AI service had a problem (${e.status ?? "unknown"}: ${detail}). Try again in a moment.` + saved;
  }
  return `Something went wrong while Morris was thinking (${detail || "unknown error"}).` + saved;
}

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
      return NextResponse.json({ error: explainAiError(e), userMessage: userRow }, { status: 502 });
    }

    const assistantRow = must(
      await db().from("chat_messages").insert({ role: "assistant", content: reply }).select("id, role, content, created_at").single(),
    );
    return NextResponse.json({ userMessage: userRow, reply: assistantRow, today: await todaySummary(tz) });
  } catch (e) {
    return serverError(e);
  }
}
