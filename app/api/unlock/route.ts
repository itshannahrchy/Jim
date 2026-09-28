import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, createSessionToken } from "@/lib/session";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

function passcodeMatches(given: string) {
  const expected = process.env.APP_PASSCODE ?? "";
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(given.normalize("NFKC").trim()).digest();
  const b = createHash("sha256").update(expected.normalize("NFKC").trim()).digest();
  return expected.length > 0 && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.APP_PASSCODE) {
    return NextResponse.json({ error: "The app passcode hasn't been set up yet (APP_PASSCODE)." }, { status: 500 });
  }
  let passcode = "";
  try {
    passcode = String((await req.json()).passcode ?? "").slice(0, 500);
  } catch {
    /* empty body */
  }

  const ip = clientIp(req);
  const now = new Date();
  const { data: row, error } = await db().from("login_attempts").select("*").eq("ip", ip).maybeSingle();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: "Couldn't reach the database. Try again in a moment." }, { status: 500 });
  }

  if (row?.locked_until && new Date(row.locked_until) > now) {
    const mins = Math.ceil((new Date(row.locked_until).getTime() - now.getTime()) / 60000);
    return NextResponse.json(
      { error: `Too many tries. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.` },
      { status: 429 },
    );
  }

  if (!passcodeMatches(passcode)) {
    const failures = (row?.locked_until ? 0 : row?.failures ?? 0) + 1;
    const lock = failures >= MAX_TRIES;
    await db()
      .from("login_attempts")
      .upsert({
        ip,
        failures: lock ? 0 : failures,
        locked_until: lock ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null,
        updated_at: now.toISOString(),
      });
    const left = MAX_TRIES - failures;
    return NextResponse.json(
      {
        error: lock
          ? `Too many tries. Please wait ${LOCK_MINUTES} minutes and try again.`
          : `That's not it. ${left} ${left === 1 ? "try" : "tries"} left.`,
      },
      { status: lock ? 429 : 401 },
    );
  }

  if (row) await db().from("login_attempts").delete().eq("ip", ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
