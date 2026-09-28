"use client";

import { useEffect, useState } from "react";
import { kcal, type Today } from "./TodayCard";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function DaySheet({
  type,
  today,
  onClose,
  onDelete,
}: {
  type: "workout" | "food";
  today: Today;
  onClose: () => void;
  onDelete: (type: "workout" | "food", id: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function remove(id: number) {
    if (confirming !== id) {
      setConfirming(id);
      return;
    }
    setBusy(id);
    setError("");
    try {
      await onDelete(type, id);
      setConfirming(null);
    } catch {
      setError("Couldn't delete that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const items =
    type === "workout"
      ? today.workouts.map((w) => ({
          id: w.id,
          title: w.activity_name,
          sub: [time(w.logged_at), w.duration_min ? `${w.duration_min} min` : null, kcal(w.estimated_calories), w.description]
            .filter(Boolean)
            .join(" · "),
        }))
      : today.food.map((f) => ({
          id: f.id,
          title: f.meal_type ? cap(f.meal_type) : cap(f.description),
          sub: [
            time(f.logged_at),
            f.meal_type ? f.description : null,
            kcal(f.estimated_calories),
            f.estimated_protein_g ? `~${f.estimated_protein_g} g protein` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }));

  const { eaten, burned, target } = today.calories;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={type === "workout" ? "Today's workouts" : "Today's food"} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{type === "workout" ? "Today's workouts" : "Today's food"}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="#1F1B16" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <p className="sheet-empty">Nothing logged yet today. Just tell Morris!</p>
        ) : (
          <ul className="entry-list">
            {items.map((it) => (
              <li key={it.id} className={`entry ${type}`}>
                <div className="entry-main">
                  <div className="entry-title">{it.title}</div>
                  <div className="entry-sub">{it.sub}</div>
                </div>
                <button
                  className={`delete-button${confirming === it.id ? " confirm" : ""}`}
                  onClick={() => remove(it.id)}
                  disabled={busy === it.id}
                  aria-label={confirming === it.id ? `Confirm delete ${it.title}` : `Delete ${it.title}`}
                >
                  {busy === it.id ? "…" : confirming === it.id ? "Delete?" : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="#1F1B16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="form-error">{error}</p>}
        <p className="sheet-total">
          {type === "workout"
            ? `Estimated burned today: ${kcal(burned) ?? "~0 kcal"}`
            : `Estimated eaten today: ${kcal(eaten) ?? "~0 kcal"}${target ? ` of ${target.toLocaleString("en-IN")} kcal target` : ""}`}
          . These are estimates, not exact figures.
        </p>
      </div>
    </div>
  );
}
