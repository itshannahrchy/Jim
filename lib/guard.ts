import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { resolveTimezone } from "./data";

/** Second line of defence behind middleware: returns a 401 response if locked. */
export async function locked(req: NextRequest): Promise<NextResponse | null> {
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return ok ? null : NextResponse.json({ error: "locked" }, { status: 401 });
}

export function timezoneFor(req: NextRequest) {
  return resolveTimezone(req.headers.get("x-jim-tz"));
}

export function serverError(e: unknown) {
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}
