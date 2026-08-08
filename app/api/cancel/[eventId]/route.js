import { NextResponse } from "next/server";
import { getBookingEvent, cancelBookingEvent } from "@/lib/google";
import { BUSINESS } from "@/lib/config";

export async function GET(request, { params }) {
  try {
    const event = await getBookingEvent(params.eventId);
    if (event.status === "cancelled") {
      return NextResponse.json({ cancelled: true });
    }
    const when = new Date(event.start.dateTime).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: BUSINESS.timezone,
    });
    return NextResponse.json({ summary: event.summary, when });
  } catch (err) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
}

export async function POST(request, { params }) {
  try {
    await cancelBookingEvent(params.eventId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
