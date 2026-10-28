import { NextResponse } from "next/server";
import { getBookingEvent, cancelBookingEvent, updateBookingStatus } from "@/lib/google";
import { formatWhen } from "@/lib/booking";

export async function GET(request, { params }) {
  try {
    const event = await getBookingEvent(params.eventId);
    if (event.status === "cancelled") {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({
      summary: (event.summary || "").replace(/^PENDING — /, ""),
      when: formatWhen(event.start.dateTime),
      // A still-pending request is "withdrawn" rather than "cancelled" —
      // the wording on the page follows this.
      pending: event.status === "tentative",
    });
  } catch (err) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
}

export async function POST(request, { params }) {
  try {
    await cancelBookingEvent(params.eventId);
    try {
      await updateBookingStatus(params.eventId, "CANCELLED");
    } catch (e) {
      console.error("Sheet status update failed:", e.message);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
