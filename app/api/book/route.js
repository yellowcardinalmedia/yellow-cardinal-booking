import { NextResponse } from "next/server";
import { createBookingEvent, appendBookingRow } from "@/lib/google";
import { driveDistanceMiles } from "@/lib/maps";
import { getProduct, getAddon, computeDuration, computePrice, BUSINESS } from "@/lib/config";

export async function POST(request) {
  const body = await request.json();
  const { productIds = [], addonIds = [], start, propertyAddress, clientName, clientEmail, clientPhone, notes } = body;

  if (!productIds.length || !start || !clientEmail || !clientName || !clientPhone || !propertyAddress) {
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

  const summary = `Photo Shoot: ${propertyAddress} (${clientName})`;
  const description = [
    `Packages: ${productNames.join(", ")}`,
    addonNames.length ? `Add-ons: ${addonNames.join(", ")}` : null,
    tripCharge ? `Trip charge: $${tripCharge} (${distanceMiles.toFixed(1)} mi from base)` : null,
    `Estimated total: $${price}`,
    `Property: ${propertyAddress}`,
    `Client phone: ${clientPhone || "n/a"}`,
    notes ? `Notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const event = await createBookingEvent({
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
      ]);
    } catch (sheetErr) {
      // Don't fail the booking if the sheet log fails — the calendar event is the source of truth.
      console.error("Sheet logging failed:", sheetErr.message);
    }

    return NextResponse.json({ success: true, eventId: event.id, htmlLink: event.htmlLink, price, tripCharge });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
