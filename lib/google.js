import { google } from "googleapis";
import { BUSINESS } from "./config";

// One business, one connected Gmail account: we store a single refresh token
// as an env var (GOOGLE_REFRESH_TOKEN) after the one-time /connect flow.
// No per-customer OAuth — customers never touch Google at all.

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

export function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token to be returned every time
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
}

export function getCalendarClient() {
  const client = getOAuthClient();
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "GOOGLE_REFRESH_TOKEN is not set. Visit /api/auth/google to connect your calendar first."
    );
  }
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.calendar({ version: "v3", auth: client });
}

export async function listBusyEvents(timeMinISO, timeMaxISO) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: BUSINESS.calendarId,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: "startTime",
  });
  return (res.data.items || [])
    // Pending holds are status "tentative" and are deliberately INCLUDED here —
    // that is what keeps an unapproved request from being double-booked.
    // Only genuinely cancelled events are ignored.
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime) // skip all-day events, they aren't shoot conflicts
    .map((e) => ({
      start: e.start.dateTime,
      end: e.end.dateTime,
      location: e.location || null,
    }));
}

// True once a tentative hold has sat unanswered past the expiry window.
export function isHoldExpired(event) {
  if (event.status !== "tentative") return false;
  if (!event.created) return false;
  const ageMs = Date.now() - new Date(event.created).getTime();
  return ageMs > BUSINESS.pendingHoldExpiryHours * 60 * 60 * 1000;
}

// Finds pending holds that have aged out and removes them, so their slots
// open back up. Returns the events it released, so the caller can notify.
// Runs opportunistically (on availability lookups) rather than on a cron, so
// there is no separate scheduler to keep alive.
export async function releaseExpiredHolds(timeMinISO, timeMaxISO) {
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: BUSINESS.calendarId,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
  });
  const released = [];
  for (const e of res.data.items || []) {
    if (e.status === "cancelled" || !e.start?.dateTime) continue;
    if (!isHoldExpired(e)) continue;
    try {
      await calendar.events.delete({
        calendarId: BUSINESS.calendarId,
        eventId: e.id,
        sendUpdates: "none", // no attendees on a pending hold anyway
      });
      released.push(e);
    } catch (err) {
      console.error(`Couldn't release expired hold ${e.id}:`, err.message);
    }
  }
  return released;
}

// Free/busy blocks from other people's calendars (e.g. Kato), so a slot only
// opens up if everyone required is actually free. This uses the free/busy API,
// which only needs the other person to share "See only free/busy" — not full
// event details — so no location comes back, just a flat time block.
export async function listExternalBusyBlocks(calendarIds, timeMinISO, timeMaxISO) {
  if (!calendarIds || !calendarIds.length) return [];
  const calendar = getCalendarClient();
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      timeZone: BUSINESS.timezone,
      items: calendarIds.map((id) => ({ id })),
    },
  });
  const blocks = [];
  for (const id of calendarIds) {
    const cal = res.data.calendars?.[id];
    if (!cal || cal.errors?.length) {
      const reason = cal?.errors?.[0]?.reason || "no data returned";
      console.error(`Couldn't read free/busy for ${id}:`, reason);
      // FAIL CLOSED: if a required person's calendar can't be read, we must not
      // pretend they're free — that is how double bookings happen.
      throw new Error(`Couldn't verify ${id}'s calendar (${reason}). Not offering times until that's fixed.`);
    }
    for (const b of cal?.busy || []) {
      blocks.push({ start: b.start, end: b.end, location: null });
    }
  }
  return blocks;
}

// Last-line-of-defense conflict check used at booking time (the slot list the
// client saw may be stale, or two people may pick the same slot at once).
// Returns a reason string if the window is taken, otherwise null.
export async function findBookingConflict(startISO, endISO, propertyAddress) {
  const dayStart = new Date(new Date(startISO).getTime() - 12 * 3600000).toISOString();
  const dayEnd = new Date(new Date(endISO).getTime() + 12 * 3600000).toISOString();
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  const overlaps = (b) => new Date(b.start).getTime() < e && new Date(b.end).getTime() > s;

  const own = await listBusyEvents(dayStart, dayEnd);
  if (own.some(overlaps)) return "That time was just taken.";

  const external = await listExternalBusyBlocks(BUSINESS.requiredFreeCalendars, dayStart, dayEnd);
  if (external.some(overlaps)) return "That time is no longer available.";

  // Same property already requested or booked? Almost always a client
  // re-booking instead of rescheduling — make them withdraw the first one.
  const calendar = getCalendarClient();
  const res = await calendar.events.list({
    calendarId: BUSINESS.calendarId,
    timeMin: new Date().toISOString(),
    q: propertyAddress,
    singleEvents: true,
    maxResults: 20,
  });
  const dupe = (res.data.items || []).find(
    (ev) => ev.status !== "cancelled" && (ev.location || "").toLowerCase() === propertyAddress.toLowerCase()
  );
  if (dupe) {
    return "This property already has a shoot requested or booked. Please use the withdraw link in your earlier email first, or reply to it to reschedule.";
  }
  return null;
}

export async function sendAlertEmail({ to, subject, body }) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: client });

  const recipients = Array.isArray(to) ? to.join(", ") : to;
  // Headers must be ASCII. Our subjects contain an em dash, and a raw UTF-8
  // Subject header is malformed — Gmail can mangle or silently spam-file it.
  // Encode the subject (RFC 2047) and base64 the body so it's a well-formed message.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  const message = [
    `To: ${recipients}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");

  const encoded = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

function getSheetsClient() {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.sheets({ version: "v4", auth: client });
}

export async function appendBookingRow(row) {
  // row: [timestamp, property, client, email, phone, package, addons, price,
  //       shootTime, access, status, eventId]
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return; // logging is optional — skip quietly if not configured
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Bookings!A:L",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

// Finds the row whose eventId (column L) matches and rewrites its Status
// (column K). Used when a pending request is accepted or declined.
export async function updateBookingStatus(eventId, status) {
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return;
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Bookings!L:L",
  });
  const rows = res.data.values || [];
  // rows[0] is the header row, so the sheet row number is index + 1
  const idx = rows.findIndex((r) => r[0] === eventId);
  if (idx === -1) return; // nothing logged for this booking — nothing to update
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Bookings!K${idx + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[status]] },
  });
}

// Creates the PENDING hold. Deliberately has NO attendees: adding the client
// here would make Google email them a confirmed-looking invite before anyone
// has accepted. The event still sits on the business calendar, which is what
// holds the slot against other bookings.
export async function createPendingEvent({
  id,
  summary,
  description,
  startISO,
  endISO,
  location,
  approverEmails = [],
}) {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: BUSINESS.calendarId,
    // Only the approvers (never the client) are invited, so Google itself
    // notifies them and the hold shows on their calendars — a second channel
    // in case the Gmail alert doesn't land.
    sendUpdates: approverEmails.length ? "all" : "none",
    requestBody: {
      id, // custom ID, set by the caller, so approve/cancel links can be built up front
      status: "tentative",
      attendees: approverEmails.map((email) => ({ email })),
      summary,
      description,
      location, // the property address — read back later for drive-time buffering
      start: { dateTime: startISO, timeZone: BUSINESS.timezone },
      end: { dateTime: endISO, timeZone: BUSINESS.timezone },
      reminders: { useDefault: true },
    },
  });
  return res.data;
}

// Promotes an accepted hold into a real booking: flips tentative -> confirmed,
// drops the "PENDING" prefix, and adds the attendees. sendUpdates "all" is what
// finally emails the client their calendar invite.
export async function confirmBookingEvent({
  eventId,
  summary,
  description,
  attendeeEmail,
  attendeeName,
  extraAttendeeEmails = [],
}) {
  const calendar = getCalendarClient();
  const attendees = [
    { email: attendeeEmail, displayName: attendeeName },
    ...extraAttendeeEmails.map((email) => ({ email })),
  ];
  const res = await calendar.events.patch({
    calendarId: BUSINESS.calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: {
      status: "confirmed",
      summary,
      description,
      attendees,
    },
  });
  return res.data;
}

export async function getBookingEvent(eventId) {
  const calendar = getCalendarClient();
  const res = await calendar.events.get({
    calendarId: BUSINESS.calendarId,
    eventId,
  });
  return res.data;
}

export async function cancelBookingEvent(eventId) {
  const calendar = getCalendarClient();
  await calendar.events.delete({
    calendarId: BUSINESS.calendarId,
    eventId,
    sendUpdates: "all", // notifies anyone already invited and frees every calendar involved
  });
}
