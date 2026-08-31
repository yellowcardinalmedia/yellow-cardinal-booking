import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createBookingEvent, appendBookingRow, sendAlertEmail } from "@/lib/google";
import { driveDistanceMiles } from "@/lib/maps";
import { getProduct, getAddon, computeDuration, computePrice, BUSINESS } from "@/lib/config";

const ACCESS_LABELS = {
  lockbox: "Lockbox",
  meet: "Meeting someone on-site",
  code: "Door code / smart lock",
  agent: "Agent will unlock remotely",
  vacant: "Vacant, unlocked",
  other: "Other",
};

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

  // Custom event ID, generated before the event exists, so the cancel link
  // can be embedded in the event description itself (Calendar allows a
  // caller-supplied ID: lowercase letters/digits/hyphens only).
  const eventId = `booking-${randomUUID().replace(/-/g, "")}`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://yellow-cardinal-booking.vercel.app";
  const cancelUrl = `${siteUrl}/cancel/${eventId}`;

  const summary = `${clientName} — Photo Shoot (${propertyAddress})`;
  const detailLines = [
    `Packages: ${productNames.join(", ")}`,
    addonNames.length ? `Add-ons: ${addonNames.join(", ")}` : null,
    tripCharge ? `Trip charge: $${tripCharge} (${distanceMiles.toFixed(1)} mi from base)` : null,
    `Estimated total: $${price}`,
    `Property: ${propertyAddress}`,
    `Access: ${accessLine}`,
    `Client phone: ${clientPhone || "n/a"}`,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean);
  const description = [...detailLines, "", `Need to cancel? ${cancelUrl}`].join("\n");

  try {
    const event = await createBookingEvent({
      id: eventId,
      summary,
      description,
      startISO,
      endISO,
      attendeeEmail: clientEmail,
      attendeeName: clientName,
      location: propertyAddress,
      extraAttendeeEmails: BUSINESS.notifyEmails,
    });

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
      ]);
    } catch (sheetErr) {
      // Don't fail the booking if the sheet log fails — the calendar event is the source of truth.
      console.error("Sheet logging failed:", sheetErr.message);
    }

    try {
      const when = new Date(startISO).toLocaleString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: BUSINESS.timezone,
      });
      await sendAlertEmail({
        to: "jeff@yellowcardinalmedia.com",
        subject: `New booking: ${clientName} — ${when}`,
        body: [`${clientName} just booked a shoot.`, "", `When: ${when}`, `Client email: ${clientEmail}`, ...detailLines].join(
          "\n"
        ),
      });
    } catch (alertErr) {
      // Don't fail the booking if the alert email fails — the calendar event is the source of truth.
      console.error("Alert email failed:", alertErr.message);
    }

    return NextResponse.json({ success: true, eventId: event.id, htmlLink: event.htmlLink, price, tripCharge, cancelUrl });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
