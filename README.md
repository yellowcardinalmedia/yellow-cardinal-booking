# Yellow Cardinal Media — Booking

Client-facing scheduling app. A client picks package(s), add-ons and a time;
that becomes a **request**, not a confirmed booking. Nothing is confirmed to
the client until Kato or Jeff accepts it.

No database. Your Google Calendar is the source of truth. Edit
`lib/config.js` to change packages, add-ons, prices, hours and approvers.

## The approval flow (important)

1. Client submits a request.
2. A **tentative** event is created on the business calendar, titled
   `PENDING — <client> — Photo Shoot (<address>)`. It has **no attendees**,
   so Google emails nobody. It still blocks the slot, so nobody else can
   request that time.
3. Everyone in `BUSINESS.approverEmails` gets an email with an
   accept/decline link (`/approve/<id>`). Either one of them deciding is
   enough — it is not a both-must-agree gate.
4. The client gets a plain "request received, not confirmed yet" email.
5. **Accept** → the event flips to confirmed, the `PENDING` prefix is
   dropped, the client and `notifyEmails` are added as attendees, and
   Google sends the real calendar invite. This is the first confirmation
   the client ever sees.
6. **Decline** → the hold is deleted (slot reopens immediately) and the
   client is emailed to pick another time.

7. **Nobody decides** → after `BUSINESS.pendingHoldExpiryHours` (default 8)
   the hold is released automatically, the slot reopens for anyone else, and
   the client is emailed to pick a new time.

The expiry sweep runs opportunistically, on availability lookups, rather
than on a cron — so there's no scheduler to keep alive, and an expired hold
can never block a slot someone is actually trying to book. The practical
consequence: a stale `PENDING` event may linger visibly on the calendar for
a while after the 8 hours if nobody loads the booking site, but it stops
counting as busy the moment anyone does. Accepting an expired request is
blocked outright, so a late click can't double-book a reopened slot.

The approve link's only access control is its unguessable random ID — same
approach as the cancel link. Fine for this use, not a real auth system.

## 1. Run locally

```bash
npm install
npm run dev
```

## 2. Google OAuth credentials

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select your project.
2. **APIs & Services → Library** → enable **Google Calendar API**, **Google Sheets API**, **Gmail API**.
3. **OAuth consent screen** (newer layouts: "Google Auth Platform" → Audience/Clients): External, add your own Gmail as a test user.
4. **Credentials → Create Credentials → OAuth client ID** → Web application → add redirect URIs for local and production.
5. Copy the **Client ID** and **Client Secret**.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in. Leave `GOOGLE_REFRESH_TOKEN` blank at first.

## 4. Connect your calendar

Visit **`/api/auth/google`**, sign in, approve, copy the refresh token into
`GOOGLE_REFRESH_TOKEN`. If you ever add a new scope to the code, redo this —
an old token does not pick up new permissions.

## 5. Customize

`lib/config.js`:
- `PRODUCTS`, `ADDONS` — packages, durations, prices
- `BUSINESS.hours`, `BUSINESS.timezone`
- `BUSINESS.approverEmails` — who can accept/decline requests
- `BUSINESS.pendingHoldExpiryHours` — how long an unanswered request holds its slot
- `BUSINESS.notifyEmails` — who is copied on confirmed invites
- `BUSINESS.ownerEmail` — who gets accepted/declined status emails
- `BUSINESS.requiredFreeCalendars` — who must also be free for a slot to show
- `BUSINESS.originAddress` and the distance rules

## 6. Deploy

```bash
npm install -g vercel
vercel
```

Add every env var in Vercel → Settings → Environment Variables, then redeploy.

## 7. Booking log sheet

1. Enable **Google Sheets API**.
2. Create a Sheet, name the first tab `Bookings`, header row:
   `Timestamp | Property | Client | Email | Phone | Package | Add-ons | Price | Shoot Time | Access | Status | Event ID`
3. Put the spreadsheet ID (from its URL) in `SHEETS_SPREADSHEET_ID`.

Status starts as `PENDING` and is rewritten in place to `CONFIRMED`,
`DECLINED`, `CANCELLED` or `EXPIRED`. The Event ID column is what the app matches on to
find the row — don't delete or reorder that column.

Don't rely on Google Sheets' own "Notification rules" — unreliable in
practice. The app emails you directly instead.

## 8. Embed on Squarespace

**Full-page:**
```html
<iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:900px;border:0;" title="Book a shoot"></iframe>
```

**Modal** — Settings → Advanced → Code Injection → Footer:
```html
<div id="ss-booking-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
  <div style="position:relative;width:95%;max-width:480px;height:85vh;background:#fff;border-radius:12px;overflow:hidden;">
    <button onclick="document.getElementById('ss-booking-overlay').style.display='none'" style="position:absolute;top:10px;right:10px;z-index:2;background:#fff;border:1px solid #ddd;border-radius:50%;width:32px;height:32px;">×</button>
    <iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:100%;border:0;" title="Book a shoot"></iframe>
  </div>
</div>
<script>
  document.addEventListener('click', function(e) {
    if (e.target.closest('.open-booking-modal')) {
      document.getElementById('ss-booking-overlay').style.display = 'flex';
    }
  });
</script>
```
Give any button/link the CSS class `open-booking-modal`.

## How availability works

Your whole business-hours window is bookable by default; anything on your
calendar blocks it — including pending holds. To block time yourself, just
add a normal calendar event.

Closing time is the last allowed **start** time, not a finish deadline,
unless `strictCloseDistanceMiles` applies.

## Address autocomplete

1. Enable **Places API**.
2. Create a **second, separate** browser-facing API key.
3. **Application restrictions → Websites** → your domain **including `https://`**, e.g. `https://booking.yellowcardinalmedia.com/*`. A missing scheme causes silent 403s.
4. **API restrictions** → Places API only.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, redeploy.

Uses Google's current Autocomplete Suggestion API via the official dynamic
library bootstrap loader — a plain `<script src="...">` tag alone does not
define `google.maps.importLibrary`.

## Check Kato's calendar too

Kato: Google Calendar → Settings → his calendar → "Share with specific
people" → add your connected Gmail → "See only free/busy". If not shared,
the app just checks your own calendar rather than erroring.

## Distance rules

All need `GOOGLE_MAPS_API_KEY`; unenforced without it.

- **`strictCloseDistanceMiles`** (45, from `originAddress`): no run-past-closing exception for far properties.
- **`tripChargeDistanceMiles`** (50, from `originAddress`): flat `tripChargeAmount` ($30) added automatically.
- **`maxSameDayDistanceMiles`** (40, between the new property and any other shoot already booked that day): excludes the whole day.

## Cancelling

Every request and booking carries a cancel link. Before acceptance it reads
as "withdraw request"; after, "cancel booking". Either way the event is
deleted, everyone invited is notified, and the slot reopens.

## Not built yet

- Payments (Stripe)
- SMS reminders
- Reschedule (currently cancel + rebook)
- Multiple photographers with per-photographer calendars
