import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createPendingEvent, appendBookingRow, sendAlertEmail } from "@/lib/google";
import { driveDistanceMiles } from "@/lib/maps";
import { getProduct, getAddon, computeDuration, computePrice, BUSINESS } from "@/lib/config";
import { ACCESS_LABELS, formatWhen, siteUrl, buildDetailLines } from "@/lib/booking";

export async function POST(request) {
  const body = await request.json();
  const {
    productIds = [],
    addonIds = [],
    start,
    propertyAddress,
    clientName,
    clientEmail,
    clientPhone,
    accessMethod,
    accessDetails,
    notes,
  } = body;

  if (
    !productIds.length ||
    !start ||
    !clientEmail ||
    !clientName ||
    !clientPhone ||
    !propertyAddress ||
    !accessMethod ||
    (accessMethod !== "vacant" && !accessDetails)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const products = productIds.map(getProduct).filter(Boolean);
  if (!products.length) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }

  const duration = computeDuration(productIds, addonIds);
  const basePrice = computePrice(productIds, addonIds);
  const startISO = new Date(start).toISOString();
  const endISO = new Date(new Date(start).getTime() + duration * 60000).toISOString();

  const distanceMiles = await driveDistanceMiles(BUSINESS.originAddress, propertyAddress);
  const tripCharge = distanceMiles !== null && distanceMiles > BUSINESS.tripChargeDistanceMiles ? BUSINESS.tripChargeAmount : 0;
  const price = basePrice + tripCharge;

  const addonNames = addonIds.map((id) => getAddon(id)?.name).filter(Boolean);
  const productNames = products.map((p) => p.name);
  const accessLabel = ACCESS_LABELS[accessMethod] || accessMethod;
  const accessLine = accessDetails ? `${accessLabel} — ${accessDetails}` : accessLabel;

  // Custom event ID, generated before the event exists, so the approve and
  // cancel links can be embedded in the event and emails up front.
  // IMPORTANT: Google Calendar only accepts base32hex characters in a
  // caller-supplied ID — digits 0-9 and lowercase a-v, nothing else.
  // No hyphens, no uppercase. A hyphen here caused "Invalid resource id
  // value" and failed every booking, so don't reintroduce one.
  const eventId = `booking${randomUUID().replace(/-/g, "")}`;
  const base = siteUrl();
  const approveUrl = `${base}/approve/${eventId}`;
  const cancelUrl = `${base}/cancel/${eventId}`;

  const detailLines = buildDetailLines({
    productNames,
    addonNames,
    tripCharge,
    distanceMiles,
    price,
    propertyAddress,
    accessLine,
    clientName,
    clientEmail,
    clientPhone,
    notes,
  });
  const when = formatWhen(startISO);

  // The hold carries "PENDING" in its title so an unapproved request is
  // obvious at a glance on the calendar.
  const summary = `PENDING — ${clientName} — Photo Shoot (${propertyAddress})`;
  const description = [
    "NOT YET CONFIRMED — awaiting approval.",
    "",
    ...detailLines,
    "",
    `Accept or decline: ${approveUrl}`,
  ].join("\n");

  try {
    const event = await createPendingEvent({
      id: eventId,
      summary,
      description,
      startISO,
      endISO,
      location: propertyAddress,
    });

    // Log it as PENDING; the approve/decline step rewrites this status in place.
    try {
      await appendBookingRow([
        new Date().toISOString(),
        propertyAddress,
        clientName,
        clientEmail,
        clientPhone || "",
        productNames.join(", "),
        addonNames.join(", ") + (tripCharge ? ` + $${tripCharge} trip charge` : ""),
        price,
        startISO,
        accessLine,
        "PENDING",
        eventId,
      ]);
    } catch (sheetErr) {
      // Don't fail the request if the sheet log fails — the calendar event is the source of truth.
      console.error("Sheet logging failed:", sheetErr.message);
    }

    // Approvers get the decision link.
    try {
      await sendAlertEmail({
        to: BUSINESS.approverEmails,
        subject: `ACTION NEEDED — shoot request: ${clientName}, ${when}`,
        body: [
          `${clientName} requested a shoot. It is NOT confirmed until someone accepts it.`,
          "",
          `When: ${when}`,
          ...detailLines,
          "",
          `Accept or decline here: ${approveUrl}`,
          "",
          `The time is held on the calendar until then, so nobody else can take it. If nobody decides within ${BUSINESS.pendingHoldExpiryHours} hours the hold is released automatically and the slot reopens.`,
        ].join("\n"),
      });
    } catch (alertErr) {
      console.error("Approver email failed:", alertErr.message);
    }

    // The client is told it's a request, not a confirmation.
    try {
      await sendAlertEmail({
        to: clientEmail,
        subject: `Request received — ${when}`,
        body: [
          `Hi ${clientName},`,
          "",
          `We've received your shoot request for ${propertyAddress} on ${when}.`,
          "",
          "This is not confirmed yet — we'll check our photographer's availability and send you a calendar invite once it's accepted. You'll usually hear back the same day.",
          "",
          ...detailLines,
          "",
          `Need to withdraw this request? ${cancelUrl}`,
          "",
          BUSINESS.name,
        ].join("\n"),
      });
    } catch (alertErr) {
      console.error("Client email failed:", alertErr.message);
    }

    return NextResponse.json({ success: true, pending: true, eventId: event.id, price, tripCharge, cancelUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
