"use client";

import { useEffect, useState } from "react";

export default function ApprovePage({ params }) {
  const { eventId } = params;
  const [req, setReq] = useState(null);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(null); // "accept" | "decline"
  const [state, setState] = useState(null); // "accepted" | "declined"

  useEffect(() => {
    fetch(`/api/approve/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else if (data.state === "pending") setReq(data);
        else setState(data.state);
      })
      .catch(() => setError("Couldn't load this request."));
  }, [eventId]);

  async function decide(decision) {
    setWorking(decision);
    setError(null);
    try {
      const res = await fetch(`/api/approve/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setState(data.state);
    } catch (err) {
      setError(String(err));
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-paper">
      <div className="max-w-md w-full">
        <p className="font-mono text-xs tracking-widest text-brass uppercase mb-4 text-center">Yellow Cardinal Media</p>

        {error && <p className="text-rust text-sm text-center">{error}</p>}

        {!error && state === "accepted" && (
          <div className="text-center">
            <h1 className="font-display text-3xl mb-3 text-ink">Shoot accepted</h1>
            <p className="text-slate text-sm">
              It's confirmed on the calendar and the client has been sent their invite.
            </p>
          </div>
        )}

        {!error && state === "expired" && (
          <div className="text-center">
            <h1 className="font-display text-3xl mb-3 text-ink">Request expired</h1>
            <p className="text-slate text-sm">
              This request went unanswered too long, so the hold was released and the time is open again. The client has
              been asked to pick a new slot.
            </p>
          </div>
        )}

        {!error && state === "declined" && (
          <div className="text-center">
            <h1 className="font-display text-3xl mb-3 text-ink">Request declined</h1>
            <p className="text-slate text-sm">
              The hold has been removed, that time is open again, and the client has been told to pick another slot.
            </p>
          </div>
        )}

        {!error && !state && !req && <p className="text-slate text-sm text-center">Loading…</p>}

        {!error && !state && req && (
          <>
            <h1 className="font-display text-3xl mb-1 text-ink text-center">Shoot request</h1>
            <p className="font-mono text-sm text-ink/60 mb-5 text-center">{req.when}</p>

            <div className="border border-ink/15 rounded-lg p-4 bg-white/50 mb-6">
              {req.details.map((line, i) => (
                <p key={i} className="text-sm text-slate leading-relaxed">
                  {line}
                </p>
              ))}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => decide("decline")}
                disabled={!!working}
                className="focus-ring border border-ink/25 text-ink px-6 py-3 rounded-full disabled:opacity-40 text-sm"
              >
                {working === "decline" ? "Declining…" : "Decline"}
              </button>
              <button
                onClick={() => decide("accept")}
                disabled={!!working}
                className="focus-ring bg-rust text-paper px-6 py-3 rounded-full disabled:opacity-40 text-sm"
              >
                {working === "accept" ? "Accepting…" : "Accept shoot"}
              </button>
            </div>

            <p className="text-xs text-ink/40 mt-5 text-center">
              The client is only sent a calendar invite once you accept.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
