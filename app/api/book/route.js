import { NextResponse } from "next/server";
import { createBookingEvent, appendBookingRow } from "@/lib/google";
import { getProduct, getAddon, computeDuration, computePrice, BUSINESS } from "@/lib/config";

export async function POST(request) {
  const body = await request.json();
  const { productId, addonIds = [], start, propertyAddress, clientName, clientEmail, clientPhone, notes } = body;

  if (!productId || !start || !clientEmail || !clientName || !clientPhone || !propertyAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const product = getProduct(productId);
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }

  const duration = computeDuration(productId, addonIds);
  const price = computePrice(productId, addonIds);
  const startISO = new Date(start).toISOString();
  const endISO = new Date(new Date(start).getTime() + duration * 60000).toISOString();

  const addonNames = addonIds.map((id) => getAddon(id)?.name).filter(Boolean);

  const summary = `Photo Shoot: ${propertyAddress} (${clientName})`;
  const description = [
    `Package: ${product.name}`,
    addonNames.length ? `Add-ons: ${addonNames.join(", ")}` : null,
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
        product.name,
        addonNames.join(", "),
        price,
        startISO,
      ]);
    } catch (sheetErr) {
      // Don't fail the booking if the sheet log fails — the calendar event is the source of truth.
      console.error("Sheet logging failed:", sheetErr.message);
    }

    return NextResponse.json({ success: true, eventId: event.id, htmlLink: event.htmlLink, price });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
