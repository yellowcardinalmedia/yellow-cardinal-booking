import { NextResponse } from "next/server";
import { getBookingEvent, cancelBookingEvent, sendAlertEmail } from "@/lib/google";
import { BUSINESS } from "@/lib/config";

function formatWhen(dateTime) {
  return new Date(dateTime).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS.timezone,
  });
}

// The client is the one attendee who isn't us — notifyEmails are Jeff/Kato.
function findClient(event) {
  const ours = BUSINESS.notifyEmails.map((e) => e.toLowerCase());
  const client = (event.attendees || []).find((a) => a.email && !ours.includes(a.email.toLowerCase()));
  return {
    email: client?.email || "unknown",
    name: client?.displayName || "Client",
  };
}

export async function GET(request, { params }) {
  try {
    const event = await getBookingEvent(params.eventId);
    if (event.status === "cancelled") {
      return NextResponse.json({ cancelled: true });
    }
    return NextResponse.json({
      summary: event.summary,
      when: formatWhen(event.start.dateTime),
    });
  } catch (err) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
}

export async function POST(request, { params }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {}; // no body sent — treat as a plain cancel
  }
  const action = body.action === "reschedule" ? "reschedule" : "cancel";
  const note = (body.note || "").trim();

  try {
    // Read the event BEFORE cancelling — once it's deleted we can't look up
    // who booked it or when it was for.
    const event = await getBookingEvent(params.eventId);
    const client = findClient(event);
    const when = formatWhen(event.start.dateTime);
    const where = event.location || "address not recorded";
    const alertTo = BUSINESS.notifyEmails.join(", ");

    if (action === "reschedule") {
      // Deliberately does NOT delete the event — the original slot stays held
      // until you've actually agreed a new time with the client.
      await sendAlertEmail({
        to: alertTo,
        subject: `RESCHEDULE REQUEST: ${client.name} — ${when}`,
        body: [
          `${client.name} wants to reschedule a shoot.`,
          "",
          `Currently booked: ${when}`,
          `Property: ${where}`,
          `Client email: ${client.email}`,
          note ? `\nWhat they said:\n${note}` : "\n(No note left.)",
          "",
          "The original slot is still on the calendar — it has NOT been cancelled.",
          "Contact them to agree a new time, then cancel and rebook.",
        ].join("\n"),
      });
      return NextResponse.json({ success: true, action: "reschedule" });
    }

    await cancelBookingEvent(params.eventId);

    // Alert is best-effort: the cancellation already succeeded and Google has
    // notified everyone, so don't fail the request over our own heads-up email.
    try {
      await sendAlertEmail({
        to: alertTo,
        subject: `CANCELLED: ${client.name} — ${when}`,
        body: [
          `${client.name} cancelled a shoot.`,
          "",
          `Was booked: ${when}`,
          `Property: ${where}`,
          `Client email: ${client.email}`,
          note ? `\nReason given:\n${note}` : "\n(No reason given.)",
          "",
          "That slot is now open again on the calendar.",
        ].join("\n"),
      });
    } catch (alertErr) {
      console.error("Cancellation alert email failed:", alertErr.message);
    }

    return NextResponse.json({ success: true, action: "cancel" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
