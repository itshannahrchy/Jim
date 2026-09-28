"use client";

import type { ReactNode } from "react";

export type WorkoutEntry = {
  id: number;
  logged_at: string;
  category: string;
  activity_name: string;
  description: string | null;
  duration_min: number | null;
  estimated_calories: number | null;
};
export type FoodEntry = {
  id: number;
  logged_at: string;
  description: string;
  meal_type: string | null;
  estimated_calories: number | null;
  estimated_protein_g: number | null;
};
export type Today = {
  date: string;
  weekday: string;
  workouts: WorkoutEntry[];
  food: FoodEntry[];
  goal: { id: number; title: string; target_date: string | null } | null;
  microGoal: { id: number; title: string; current: number; target: number; mode: "value" | "ladder"; unit: string | null } | null;
  microGoals?: {
    id: number;
    title: string;
    status: "not_started" | "in_progress" | "achieved";
    current: number | null;
    target: number | null;
    unit: string | null;
    isCurrent: boolean;
  }[];
  calories: { eaten: number; burned: number; target: number | null };
};

export const kcal = (n: number | null | undefined) => (n ? `~${Math.round(n).toLocaleString("en-IN")} kcal` : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function TodayCard({
  today,
  collapsed,
  onToggle,
  onOpen,
  peek,
}: {
  today: Today;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (t: "workout" | "food") => void;
  peek?: ReactNode;
}) {
  const w = today.workouts[today.workouts.length - 1];
  const f = today.food[today.food.length - 1];
  const mg = today.microGoal;
  const pct = mg && mg.target ? Math.max(0, Math.min(100, (mg.current / mg.target) * 100)) : 0;
  const { eaten, burned, target } = today.calories;

  return (
    <section className={`today${collapsed ? " collapsed" : ""}`}>
      {peek}
      <button className="today-head" onClick={onToggle} aria-expanded={!collapsed}>
        <h2>Today</h2>
        <span className="chevron" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M5 15l7-7 7 7" stroke="#1F1B16" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="sr-only">{collapsed ? "Show" : "Hide"} today&apos;s summary</span>
      </button>

      {!collapsed && (
        <div className="today-body">
          <div className="tiles">
            <button className="tile workout" onClick={() => onOpen("workout")} aria-label="Today's workouts">
              <span className="tile-label">Workouts</span>
              {w ? (
                <>
                  <span className="tile-title">{w.activity_name}</span>
                  <span className="tile-sub">
                    {[w.duration_min ? `${w.duration_min} min` : null, kcal(w.estimated_calories)].filter(Boolean).join(" · ") || cap(w.category)}
                  </span>
                  <span className="tile-foot">
                    {today.workouts.length > 1 ? `${today.workouts.length} today` : "1 today"}
                    {burned ? ` · ${kcal(burned)}` : ""}
                  </span>
                </>
              ) : (
                <span className="tile-empty">Nothing logged yet today</span>
              )}
            </button>

            <button className="tile food" onClick={() => onOpen("food")} aria-label="Today's food">
              <span className="tile-label">Food</span>
              {f ? (
                <>
                  <span className="tile-title">{f.meal_type ? cap(f.meal_type) : f.description}</span>
                  <span className="tile-sub">{f.meal_type ? cap(f.description) : kcal(f.estimated_calories)}</span>
                  <span className="tile-foot">
                    {kcal(eaten) ?? "~0 kcal"}
                    {target ? ` of ${target.toLocaleString("en-IN")}` : ""}
                  </span>
                </>
              ) : (
                <span className="tile-empty">Nothing logged yet today</span>
              )}
            </button>
          </div>

          <MicroGoals today={today} pct={pct} />
        </div>
      )}
    </section>
  );
}

function StatusIcon({ status }: { status: "not_started" | "in_progress" | "achieved" }) {
  if (status === "achieved") {
    return (
      <svg className="mg-icon" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9.5" fill="#8B6CF0" stroke="#1F1B16" strokeWidth="1.5" />
        <path d="M6.5 11.3l3 3 6-6.3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg className="mg-icon" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="9.5" fill="#fff" stroke="#8B6CF0" strokeWidth="2.5" />
        <circle cx="11" cy="11" r="4" fill="#8B6CF0" />
      </svg>
    );
  }
  return (
    <svg className="mg-icon" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="9.5" fill="#fff" stroke="#1F1B16" strokeWidth="1.5" />
    </svg>
  );
}

function MicroGoals({ today, pct }: { today: Today; pct: number }) {
  const list = today.microGoals ?? [];
  const mg = today.microGoal;
  const done = list.filter((m) => m.status === "achieved").length;
  const by = today.goal?.target_date
    ? new Date(`${today.goal.target_date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : null;

  if (!today.goal && !list.length) {
    return (
      <div className="micro">
        <p className="mg-empty">Micro-goals: Morris will suggest some once you tell him your big goal.</p>
      </div>
    );
  }

  return (
    <div className="micro">
      {today.goal && (
        <div className="mg-goal">
          <span className="mg-goal-label">Goal</span>
          <span className="mg-goal-title">{today.goal.title}</span>
          {by && <span className="mg-goal-by">by {by}</span>}
        </div>
      )}
      {list.length > 0 ? (
        <>
          <div className="mg-head">
            <span>Micro-goals</span>
            <span>
              {done} of {list.length} done
            </span>
          </div>
          <ol className="mg-list">
            {list.map((m) => (
              <li key={m.id} className={`mg-item ${m.status}${m.isCurrent ? " current" : ""}`}>
                <StatusIcon status={m.isCurrent && m.status === "not_started" ? "in_progress" : m.status} />
                <div className="mg-body">
                  <div className="mg-row">
                    <span className="mg-title">{m.title}</span>
                    {m.isCurrent && mg?.mode === "value" && (
                      <span className="mg-count">
                        {mg.current} of {mg.target}
                      </span>
                    )}
                  </div>
                  {m.isCurrent && mg?.mode === "value" && (
                    <div
                      className="bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(pct)}
                      aria-label={`Progress on ${m.title}`}
                    >
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="mg-empty">No micro-goals yet. Ask Morris to suggest some.</p>
      )}
    </div>
  );
}
