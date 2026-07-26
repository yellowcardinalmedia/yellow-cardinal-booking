"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PRODUCTS, ADDONS } from "@/lib/config";

const STEPS = ["Package", "Add-ons", "Property & contact", "Time"];

function money(n) {
  return `$${n.toLocaleString("en-US")}`;
}

function fmtTime(iso, tz) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

function nextNDates(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const dt = new Date(d.getTime() + i * 86400000);
    out.push(dt.toISOString().slice(0, 10));
  }
  return out;
}

export default function Page() {
  const [step, setStep] = useState(0);
  const [productIds, setProductIds] = useState([]);
  const [addonIds, setAddonIds] = useState([]);
  const [date, setDate] = useState(nextNDates(14)[1]);
  const [slots, setSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [form, setForm] = useState({
    propertyAddress: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const sessionTokenRef = useRef(null);
  const placesLibRef = useRef(null);

  // Address autocomplete using Google's current Places API (AutocompleteSuggestion).
  // Note: the older google.maps.places.Autocomplete widget is blocked for any
  // API key created after March 2025, so this uses the current replacement
  // and renders our own dropdown to keep the existing input styling.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || step !== 2) return;

    async function loadPlacesLib() {
      if (placesLibRef.current) return placesLibRef.current;
      if (!window.google?.maps?.importLibrary) {
        await new Promise((resolve) => {
          if (document.getElementById("gmaps-script")) {
            document.getElementById("gmaps-script").addEventListener("load", resolve);
            return;
          }
          const script = document.createElement("script");
          script.id = "gmaps-script";
          script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&v=weekly`;
          script.async = true;
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }
      const lib = await window.google.maps.importLibrary("places");
      placesLibRef.current = lib;
      return lib;
    }
    loadPlacesLib();
  }, [step]);

  async function handleAddressInput(value) {
    setForm((f) => ({ ...f, propertyAddress: value }));
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !value || value.length < 4) {
      setAddressSuggestions([]);
      return;
    }
    const lib = placesLibRef.current || (await window.google?.maps?.importLibrary?.("places"));
    if (!lib) return;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    }
    try {
      const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
        includedRegionCodes: ["us"],
      });
      setAddressSuggestions(suggestions || []);
    } catch {
      setAddressSuggestions([]); // Places not configured yet — field still works as plain text
    }
  }

  async function selectAddressSuggestion(suggestion) {
    const place = suggestion.placePrediction.toPlace();
    await place.fetchFields({ fields: ["formattedAddress"] });
    setForm((f) => ({ ...f, propertyAddress: place.formattedAddress || f.propertyAddress }));
    setAddressSuggestions([]);
    sessionTokenRef.current = null; // start a fresh session for the next search
  }

  const dateOptions = useMemo(() => nextNDates(21), []);

  const price = useMemo(() => {
    const productTotal = productIds.reduce((s, id) => s + (PRODUCTS.find((p) => p.id === id)?.price || 0), 0);
    return productTotal + addonIds.reduce((s, id) => s + (ADDONS.find((a) => a.id === id)?.price || 0), 0);
  }, [productIds, addonIds]);

  useEffect(() => {
    if (step !== 3 || !productIds.length || !form.propertyAddress) return;
    setLoadingSlots(true);
    setSlotError(null);
    setSelectedSlot(null);
    const params = new URLSearchParams({
      date,
      products: productIds.join(","),
      addons: addonIds.join(","),
      address: form.propertyAddress,
    });
    fetch(`/api/availability?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setSlotError(data.error);
        else setSlots(data);
      })
      .catch((e) => setSlotError(String(e)))
      .finally(() => setLoadingSlots(false));
  }, [step, date, productIds, addonIds, form.propertyAddress]);

  function toggleProduct(id) {
    setProductIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function toggleAddon(id) {
    setAddonIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productIds,
          addonIds,
          start: selectedSlot.start,
          ...form,
        }),
      });
      const data = await res.json();
      if (data.error) setSubmitError(data.error);
      else setResult(data);
    } catch (err) {
      setSubmitError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-xs tracking-widest text-brass uppercase mb-4">Frame 01 / Confirmed</p>
          <h1 className="font-display text-4xl mb-4 text-ink">You're on the calendar.</h1>
          <p className="text-slate mb-6">
            A calendar invite is on its way to your inbox. Estimated total: <span className="font-mono">{money(result.price)}</span>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-ink/10 px-6 py-6">
        <p className="font-mono text-xs tracking-widest text-brass uppercase">Yellow Cardinal Media</p>
        <h1 className="font-display text-2xl text-ink">Book a Shoot</h1>
      </header>

      <nav className="px-6 py-5 flex items-center gap-3 flex-wrap">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`font-mono text-xs w-7 h-7 rounded-full flex items-center justify-center border ${
                i === step
                  ? "bg-ink text-paper border-ink"
                  : i < step
                  ? "bg-brass/20 border-brass text-ink"
                  : "border-ink/20 text-ink/40"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={`text-sm ${i === step ? "text-ink" : "text-ink/40"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-ink/15 ml-1" />}
          </div>
        ))}
      </nav>

      <section className="px-6 pb-24 max-w-3xl mx-auto">
        {step === 0 && (
          <div className="grid gap-4">
            <p className="text-slate text-sm -mb-2">Select one or more — packages can be combined, e.g. photos and video together.</p>
            {PRODUCTS.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleProduct(p.id)}
                className={`focus-ring text-left border rounded-lg p-5 transition ${
                  productIds.includes(p.id) ? "border-rust bg-rust/5" : "border-ink/15 hover:border-ink/30"
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-xl text-ink">{p.name}</h3>
                  <span className="font-mono text-sm text-brass">{money(p.price)}</span>
                </div>
                <p className="text-slate text-sm mt-1">{p.description}</p>
                <p className="font-mono text-xs text-ink/40 mt-2">{p.durationMinutes} min on site</p>
              </button>
            ))}
            <div className="flex justify-between mt-2 items-center">
              <span className="font-mono text-sm text-ink/60">{productIds.length ? `Total: ${money(price)}` : ""}</span>
              <button
                disabled={!productIds.length}
                onClick={() => setStep(1)}
                className="focus-ring bg-ink text-paper px-6 py-3 rounded-full disabled:opacity-30 text-sm"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            {ADDONS.map((a) => (
              <button
                key={a.id}
                onClick={() => toggleAddon(a.id)}
                className={`focus-ring text-left border rounded-lg p-5 transition ${
                  addonIds.includes(a.id) ? "border-brass bg-brass/5" : "border-ink/15 hover:border-ink/30"
                }`}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-lg text-ink">{a.name}</h3>
                  <span className="font-mono text-sm text-brass">+{money(a.price)}</span>
                </div>
                <p className="text-slate text-sm mt-1">{a.description}</p>
              </button>
            ))}
            <div className="flex justify-between mt-2 items-center">
              <button onClick={() => setStep(0)} className="focus-ring text-sm text-slate underline">
                Back
              </button>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-ink/60">Total: {money(price)}</span>
                <button
                  onClick={() => setStep(2)}
                  className="focus-ring bg-ink text-paper px-6 py-3 rounded-full text-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <p className="text-slate text-sm -mb-2">
              We need the property address before showing times, so shoots can be scheduled with realistic drive time between them.
            </p>
            <label className="block relative">
              <span className="text-sm text-slate">Property address</span>
              <input
                required
                type="text"
                autoComplete="off"
                value={form.propertyAddress}
                onChange={(e) => handleAddressInput(e.target.value)}
                className="focus-ring mt-1 w-full border border-ink/20 rounded-lg px-4 py-3 bg-white/60"
                placeholder="Start typing an address…"
              />
              {addressSuggestions.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-ink/15 rounded-lg shadow-sm overflow-hidden">
                  {addressSuggestions.map((s) => (
                    <li key={s.placePrediction.placeId}>
                      <button
                        type="button"
                        onClick={() => selectAddressSuggestion(s)}
                        className="focus-ring w-full text-left px-4 py-2 text-sm hover:bg-haze/50"
                      >
                        {s.placePrediction.text.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            {[
              ["clientName", "Your name", "text"],
              ["clientEmail", "Email (invite sent here)", "email"],
              ["clientPhone", "Phone", "tel"],
            ].map(([key, label, type]) => (
              <label key={key} className="block">
                <span className="text-sm text-slate">{label}</span>
                <input
                  required
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="focus-ring mt-1 w-full border border-ink/20 rounded-lg px-4 py-3 bg-white/60"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-sm text-slate">Notes (gate code, showing instructions, etc.)</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="focus-ring mt-1 w-full border border-ink/20 rounded-lg px-4 py-3 bg-white/60"
                rows={3}
              />
            </label>
            <div className="flex justify-between mt-2 items-center">
              <button onClick={() => setStep(1)} className="focus-ring text-sm text-slate underline">
                Back
              </button>
              <button
                disabled={!form.propertyAddress || !form.clientName || !form.clientEmail || !form.clientPhone}
                onClick={() => setStep(3)}
                className="focus-ring bg-ink text-paper px-6 py-3 rounded-full disabled:opacity-30 text-sm"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1">
              {dateOptions.map((d) => {
                const dt = new Date(`${d}T12:00:00`);
                return (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`focus-ring shrink-0 border rounded-lg px-4 py-3 text-center ${
                      date === d ? "border-rust bg-rust/5" : "border-ink/15"
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase text-ink/50">
                      {dt.toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                    <div className="font-display text-lg text-ink">{dt.getDate()}</div>
                  </button>
                );
              })}
            </div>

            {loadingSlots && <p className="text-slate text-sm">Checking the calendar and drive times…</p>}
            {slotError && (
              <p className="text-rust text-sm">
                Couldn't load availability: {slotError}. Check the Google Calendar connection (see README).
              </p>
            )}
            {slots && !loadingSlots && slots.slots.length === 0 && (
              <p className="text-slate text-sm">No openings this day — try another date.</p>
            )}
            {slots && slots.slots.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.slots.map((s) => (
                  <button
                    key={s.start}
                    onClick={() => setSelectedSlot(s)}
                    className={`focus-ring border rounded-lg py-2 font-mono text-sm ${
                      selectedSlot?.start === s.start ? "border-rust bg-rust/5" : "border-ink/15 hover:border-ink/30"
                    }`}
                  >
                    {fmtTime(s.start, slots.timezone)}
                  </button>
                ))}
              </div>
            )}

            {submitError && <p className="text-rust text-sm mt-4">{submitError}</p>}

            {slots?.tripCharge > 0 && (
              <p className="text-slate text-sm mt-4 border border-brass/30 bg-brass/5 rounded-lg p-3">
                This property is outside our standard service area — a ${slots.tripCharge} trip charge applies.
              </p>
            )}

            <div className="flex justify-between mt-6 items-center">
              <button onClick={() => setStep(2)} className="focus-ring text-sm text-slate underline">
                Back
              </button>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-ink/60">Total: {money(price + (slots?.tripCharge || 0))}</span>
                <button
                  disabled={!selectedSlot || submitting}
                  onClick={submitBooking}
                  className="focus-ring bg-rust text-paper px-6 py-3 rounded-full disabled:opacity-30 text-sm"
                >
                  {submitting ? "Booking…" : "Confirm booking"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
