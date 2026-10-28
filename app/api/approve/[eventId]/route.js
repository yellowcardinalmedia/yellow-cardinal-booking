import { NextResponse } from "next/server";
import {
  getBookingEvent,
  confirmBookingEvent,
  cancelBookingEvent,
  sendAlertEmail,
  updateBookingStatus,
  isHoldExpired,
} from "@/lib/google";
import { BUSINESS } from "@/lib/config";
import { formatWhen, siteUrl } from "@/lib/booking";

// Pulls the client's email back out of the event description, which is where
// buildDetailLines put it. Keeps the pending event self-contained — no
// database needed to remember who asked.
function readClientEmail(description = "") {
  const m = description.match(/^Client email:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function readClientName(description = "") {
  const m = description.match(/^Client:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

export async function GET(request, { params }) {
  try {
    const event = await getBookingEvent(params.eventId);
    if (event.status === "cancelled") {
      return NextResponse.json({ state: "declined" });
    }
    if (isHoldExpired(event)) {
      return NextResponse.json({ state: "expired" });
    }
    const state = event.status === "tentative" ? "pending" : "accepted";
    return NextResponse.json({
      state,
      summary: (event.summary || "").replace(/^PENDING — /, ""),
      when: formatWhen(event.start.dateTime),
      details: (event.description || "")
        .split("\n")
        .filter((l) => l && !l.startsWith("NOT YET CONFIRMED") && !l.startsWith("Accept or decline")),
    });
  } catch (err) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
}

export async function POST(request, { params }) {
  const { decision } = await request.json();
  if (decision !== "accept" && decision !== "decline") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  try {
    const event = await getBookingEvent(params.eventId);
    if (event.status !== "tentative") {
      // Already decided — tell the page rather than acting twice.
      return NextResponse.json({ error: "This request has already been handled." }, { status: 409 });
    }
    if (isHoldExpired(event)) {
      // Accepting now could double-book a slot that was already reopened.
      return NextResponse.json(
        {
          error: `This request sat unanswered for over ${BUSINESS.pendingHoldExpiryHours} hours and has expired. The client has been asked to pick a new time.`,
        },
        { status: 410 }
      );
    }

    const clientEmail = readClientEmail(event.description);
    const clientName = readClientName(event.description) || "Client";
    const when = formatWhen(event.start.dateTime);
    const cleanSummary = (event.summary || "").replace(/^PENDING — /, "");

    if (decision === "accept") {
      const confirmedDescription = (event.description || "")
        .replace(/^NOT YET CONFIRMED — awaiting approval\.\n\n/, "")
        .replace(/\n\nAccept or decline: .*$/, "")
        .concat(`\n\nNeed to cancel? ${siteUrl()}/cancel/${params.eventId}`);

      // This is the moment the client finally gets a real calendar invite.
      await confirmBookingEvent({
        eventId: params.eventId,
        summary: cleanSummary,
        description: confirmedDescription,
        attendeeEmail: clientEmail,
        attendeeName: clientName,
        extraAttendeeEmails: BUSINESS.notifyEmails,
      });

      try {
        await updateBookingStatus(params.eventId, "CONFIRMED");
      } catch (e) {
        console.error("Sheet status update failed:", e.message);
      }

      try {
        await sendAlertEmail({
          to: BUSINESS.ownerEmail,
          subject: `Accepted — ${cleanSummary} (${when})`,
          body: [`This shoot request was accepted and is now confirmed.`, "", `When: ${when}`, cleanSummary].join("\n"),
        });
      } catch (e) {
        console.error("Owner email failed:", e.message);
      }

      return NextResponse.json({ success: true, state: "accepted" });
    }

    // Decline: remove the hold so the slot opens back up immediately.
    await cancelBookingEvent(params.eventId);

    try {
      await updateBookingStatus(params.eventId, "DECLINED");
    } catch (e) {
      console.error("Sheet status update failed:", e.message);
    }

    if (clientEmail) {
      try {
        await sendAlertEmail({
          to: clientEmail,
          subject: `Unable to confirm — ${when}`,
          body: [
            `Hi ${clientName},`,
            "",
            `Unfortunately we aren't able to cover your requested time on ${when}.`,
            "",
            `You can pick another time here: ${siteUrl()}`,
            "",
            "Sorry for the inconvenience — we'd still love to shoot this listing.",
            "",
            BUSINESS.name,
          ].join("\n"),
        });
      } catch (e) {
        console.error("Client decline email failed:", e.message);
      }
    }

    try {
      await sendAlertEmail({
        to: BUSINESS.ownerEmail,
        subject: `Declined — ${cleanSummary} (${when})`,
        body: [`This shoot request was declined. The time slot is open again.`, "", `When: ${when}`, cleanSummary].join("\n"),
      });
    } catch (e) {
      console.error("Owner email failed:", e.message);
    }

    return NextResponse.json({ success: true, state: "declined" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
