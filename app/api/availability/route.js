import { NextResponse } from "next/server";
import { listBusyEvents } from "@/lib/google";
import { generateSlotsForDay } from "@/lib/slots";
import { computeDuration, BUSINESS } from "@/lib/config";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  const productId = searchParams.get("product");
  const addonIds = (searchParams.get("addons") || "").split(",").filter(Boolean);
  const address = searchParams.get("address"); // required for drive-time-aware buffering

  if (!date || !productId || !address) {
    return NextResponse.json({ error: "Missing date, product, or address" }, { status: 400 });
  }

  const duration = computeDuration(productId, addonIds);
  if (!duration) {
    return NextResponse.json({ error: "Unknown product" }, { status: 400 });
  }

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  try {
    const busyEvents = await listBusyEvents(timeMin, timeMax);
    const slots = await generateSlotsForDay(date, duration, busyEvents, address);
    return NextResponse.json({ date, durationMinutes: duration, timezone: BUSINESS.timezone, slots });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
