import { sendAlertEmail, updateBookingStatus } from "./google";
import { BUSINESS } from "./config";
import { formatWhen, siteUrl } from "./booking";

// Pulls the client's details back out of a pending hold's description —
// same trick the approve route uses, so no database is needed to remember
// who asked for a slot that later expired.
function readField(description = "", label) {
  const m = description.match(new RegExp(`^${label}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : null;
}

// Tells the client and the owner about holds that aged out. Every step is
// best-effort: a failed email must never break an availability lookup.
export async function expireHoldNotifications(releasedEvents) {
  for (const event of releasedEvents) {
    const clientEmail = readField(event.description, "Client email");
    const clientName = readField(event.description, "Client") || "there";
    const when = event.start?.dateTime ? formatWhen(event.start.dateTime) : "your requested time";

    try {
      await updateBookingStatus(event.id, "EXPIRED");
    } catch (e) {
      console.error("Sheet status update failed:", e.message);
    }

    if (clientEmail) {
      try {
        await sendAlertEmail({
          to: clientEmail,
          subject: `Request expired — ${when}`,
          body: [
            `Hi ${clientName},`,
            "",
            `We weren't able to confirm your shoot request for ${when} in time, so that hold has been released.`,
            "",
            `Please pick a new time here: ${siteUrl()}`,
            "",
            "Sorry for the back and forth — we'd still like to shoot this listing.",
            "",
            BUSINESS.name,
          ].join("\n"),
        });
      } catch (e) {
        console.error("Client expiry email failed:", e.message);
      }
    }

    try {
      await sendAlertEmail({
        to: BUSINESS.ownerEmail,
        subject: `Request expired unanswered — ${when}`,
        body: [
          `A shoot request went ${BUSINESS.pendingHoldExpiryHours} hours without a decision, so the hold was released and the slot is open again.`,
          "",
          `When: ${when}`,
          (event.summary || "").replace(/^PENDING — /, ""),
          "",
          "The client has been asked to pick a new time.",
        ].join("\n"),
      });
    } catch (e) {
      console.error("Owner expiry email failed:", e.message);
    }
  }
}
