import { NextResponse } from "next/server";
import { listBusyEvents, listExternalBusyBlocks } from "@/lib/google";
import { generateSlotsForDay } from "@/lib/slots";
import { driveDistanceMiles } from "@/lib/maps";
import { computeDuration, BUSINESS } from "@/lib/config";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  const productIds = (searchParams.get("products") || "").split(",").filter(Boolean);
  const addonIds = (searchParams.get("addons") || "").split(",").filter(Boolean);
  const address = searchParams.get("address"); // required for drive-time-aware buffering

  if (!date || !productIds.length || !address) {
    return NextResponse.json({ error: "Missing date, package, or address" }, { status: 400 });
  }

  const duration = computeDuration(productIds, addonIds);
  if (!duration) {
    return NextResponse.json({ error: "Unknown package" }, { status: 400 });
  }

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  try {
    const [ownEvents, externalBlocks, distanceMiles] = await Promise.all([
      listBusyEvents(timeMin, timeMax),
      listExternalBusyBlocks(BUSINESS.requiredFreeCalendars, timeMin, timeMax),
      driveDistanceMiles(BUSINESS.originAddress, address),
    ]);
    const busyEvents = [...ownEvents, ...externalBlocks];
    const strictClose = distanceMiles !== null && distanceMiles > BUSINESS.strictCloseDistanceMiles;
    const tripCharge = distanceMiles !== null && distanceMiles > BUSINESS.tripChargeDistanceMiles ? BUSINESS.tripChargeAmount : 0;

    const slots = await generateSlotsForDay(date, duration, busyEvents, address, strictClose);
    return NextResponse.json({
      date,
      durationMinutes: duration,
      timezone: BUSINESS.timezone,
      slots,
      distanceMiles,
      strictClose,
      tripCharge,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
