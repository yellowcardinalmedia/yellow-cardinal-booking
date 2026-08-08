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
    .filter((e) => e.status !== "cancelled" && e.start?.dateTime) // skip all-day events, they aren't shoot conflicts
    .map((e) => ({
      start: e.start.dateTime,
      end: e.end.dateTime,
      location: e.location || null,
    }));
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
    if (cal?.errors?.length) {
      console.error(`Couldn't read free/busy for ${id}:`, cal.errors[0].reason);
      continue; // that person hasn't shared their calendar yet — skip rather than fail the whole request
    }
    for (const b of cal?.busy || []) {
      blocks.push({ start: b.start, end: b.end, location: null });
    }
  }
  return blocks;
}

export async function sendAlertEmail({ to, subject, body }) {
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: client });

  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join("\n");

  const encoded = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}

export async function appendBookingRow(row) {
  // row: [timestamp, propertyAddress, clientName, clientEmail, clientPhone, package, addons, price, shootTime, access]
  const spreadsheetId = process.env.SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return; // logging is optional — skip quietly if not configured
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const sheets = google.sheets({ version: "v4", auth: client });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Bookings!A:J",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function createBookingEvent({
  id,
  summary,
  description,
  startISO,
  endISO,
  attendeeEmail,
  attendeeName,
  location,
  extraAttendeeEmails = [],
}) {
  const calendar = getCalendarClient();
  const attendees = [
    { email: attendeeEmail, displayName: attendeeName },
    ...extraAttendeeEmails.map((email) => ({ email })),
  ];
  const res = await calendar.events.insert({
    calendarId: BUSINESS.calendarId,
    sendUpdates: "all", // this is what triggers the Gmail invite email to the attendee
    requestBody: {
      id, // custom ID, set by the caller, so a cancel link can be built before the event even exists
      summary,
      description,
      location, // the property address — read back later for drive-time buffering
      start: { dateTime: startISO, timeZone: BUSINESS.timezone },
      end: { dateTime: endISO, timeZone: BUSINESS.timezone },
      attendees,
      reminders: { useDefault: true },
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
    sendUpdates: "all", // notifies the client, Jeff, and Kato that it's cancelled — and frees everyone's calendar automatically
  });
}
