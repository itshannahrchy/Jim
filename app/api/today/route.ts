import { NextResponse, type NextRequest } from "next/server";
import { locked, serverError, timezoneFor } from "@/lib/guard";
import { todaySummary } from "@/lib/data";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const deny = await locked(req);
  if (deny) return deny;
  try {
    return NextResponse.json(await todaySummary(await timezoneFor(req)));
  } catch (e) {
    return serverError(e);
  }
}

// Delete one of today's entries from the day list.
export async function DELETE(req: NextRequest) {
  const deny = await locked(req);
  if (deny) return deny;
  try {
    const { type, id } = await req.json();
    const table = type === "workout" ? "workout_logs" : type === "food" ? "food_logs" : null;
    if (!table || !Number.isInteger(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const { error } = await db().from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json(await todaySummary(await timezoneFor(req)));
  } catch (e) {
    return serverError(e);
  }
}
