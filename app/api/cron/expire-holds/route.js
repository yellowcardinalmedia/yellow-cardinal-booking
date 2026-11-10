import { NextResponse } from "next/server";
import { releaseExpiredHolds } from "@/lib/google";
import { expireHoldNotifications } from "@/lib/expiry";

export const dynamic = "force-dynamic";

// Sweeps every unanswered request older than the hold window off the calendar,
// so expired holds don't sit there until someone happens to load the booking
// site. Safe to call as often as you like: it only deletes holds that are
// already expired, and does nothing otherwise. Vercel runs it daily (see
// vercel.json); an external pinger can hit this URL more often.
export async function GET() {
  try {
    const now = Date.now();
    const timeMin = new Date(now - 3 * 24 * 3600 * 1000).toISOString();
    const timeMax = new Date(now + 180 * 24 * 3600 * 1000).toISOString();
    const released = await releaseExpiredHolds(timeMin, timeMax);
    if (released.length) await expireHoldNotifications(released);
    return NextResponse.json({ released: released.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
