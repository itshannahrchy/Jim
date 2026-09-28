import { db, must } from "./supabase";
import { SAFE_MIN_KCAL, maintenanceKcal } from "./calories";
import {
  FALLBACK_TZ,
  addDays,
  dayRangeUtc,
  isValidTz,
  localDate,
  shortStamp,
  weekStart,
} from "./time";

export type Profile = {
  id: number;
  age_bracket: string | null;
  limitations: string | null;
  timezone: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  activity_level: string | null;
  estimated_maintenance_kcal: number | null;
  baseline_daily_calorie_target: number | null;
  notes: string | null;
  onboarding_completed_at: string | null;
};

export type WorkoutLog = {
  id: number;
  logged_at: string;
  category: string;
  activity_name: string;
  description: string | null;
  duration_min: number | null;
  intensity: string | null;
  met_value: number | null;
  estimated_calories: number | null;
};

export type FoodLog = {
  id: number;
  logged_at: string;
  description: string;
  meal_type: string | null;
  quality: string | null;
  estimated_calories: number | null;
  estimated_protein_g: number | null;
};

export type Measurement = {
  id: number;
  measured_at: string;
  name: string;
  value: number;
  unit: string;
};

export type Goal = {
  id: number;
  title: string;
  description: string | null;
  target_date: string | null;
  original_target_date: string | null;
  status: string;
  created_at: string;
};

export type MicroGoal = {
  id: number;
  goal_id: number;
  position: number;
  title: string;
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
  status: string;
  achieved_at: string | null;
};

const WORKOUT_COLS =
  "id, logged_at, category, activity_name, description, duration_min, intensity, met_value, estimated_calories";
const FOOD_COLS =
  "id, logged_at, description, meal_type, quality, estimated_calories, estimated_protein_g";

// Supabase returns numeric columns as strings; normalise.
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

function normProfile(p: Record<string, unknown>): Profile {
  return {
    ...(p as unknown as Profile),
    weight_kg: num(p.weight_kg),
    height_cm: num(p.height_cm),
    estimated_maintenance_kcal: num(p.estimated_maintenance_kcal),
    baseline_daily_calorie_target: num(p.baseline_daily_calorie_target),
  };
}
function normWorkout(w: Record<string, unknown>): WorkoutLog {
  return {
    ...(w as unknown as WorkoutLog),
    duration_min: num(w.duration_min),
    met_value: num(w.met_value),
    estimated_calories: num(w.estimated_calories),
  };
}
function normFood(f: Record<string, unknown>): FoodLog {
  return {
    ...(f as unknown as FoodLog),
    estimated_calories: num(f.estimated_calories),
    estimated_protein_g: num(f.estimated_protein_g),
  };
}
function normMicro(m: Record<string, unknown>): MicroGoal {
  return {
    ...(m as unknown as MicroGoal),
    target_value: num(m.target_value),
    current_value: num(m.current_value),
  };
}

// ───────────────────────── profile ─────────────────────────

export async function getProfile(): Promise<Profile> {
  const row = must(await db().from("profile").select("*").eq("id", 1).maybeSingle());
  if (row) return normProfile(row);
  const created = must(await db().from("profile").upsert({ id: 1 }).select("*").single());
  return normProfile(created);
}

/** Saves profile fields and keeps the maintenance estimate / target in step. */
export async function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  const current = await getProfile();
  const merged = { ...current, ...patch };
  const maintenance = maintenanceKcal(merged);
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (maintenance !== null) update.estimated_maintenance_kcal = maintenance;
  // First time we can compute maintenance and no target exists yet: use it.
  if (
    maintenance !== null &&
    patch.baseline_daily_calorie_target === undefined &&
    !current.baseline_daily_calorie_target
  ) {
    update.baseline_daily_calorie_target = Math.max(SAFE_MIN_KCAL, maintenance);
  }
  delete update.id;
  const row = must(await db().from("profile").update(update).eq("id", 1).select("*").single());
  return normProfile(row);
}

/** Uses the browser's zone (sent with every request) and remembers it. */
export async function resolveTimezone(headerTz: string | null, profile?: Profile): Promise<string> {
  const p = profile ?? (await getProfile());
  if (isValidTz(headerTz)) {
    if (p.timezone !== headerTz) await saveProfile({ timezone: headerTz });
    return headerTz;
  }
  return isValidTz(p.timezone) ? p.timezone : FALLBACK_TZ;
}

// ───────────────────────── goals ─────────────────────────

export async function getActiveGoal(): Promise<{ goal: Goal | null; micro: MicroGoal[] }> {
  const goal = must(
    await db()
      .from("goals")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as Goal | null;
  if (!goal) return { goal: null, micro: [] };
  const micro = must(
    await db().from("micro_goals").select("*").eq("goal_id", goal.id).order("position"),
  ) as Record<string, unknown>[];
  return { goal, micro: micro.map(normMicro) };
}

export function currentMicro(micro: MicroGoal[]): MicroGoal | null {
  return (
    micro.find((m) => m.status === "in_progress") ??
    micro.find((m) => m.status === "not_started") ??
    null
  );
}

// ───────────────────────── logs ─────────────────────────

export async function logsBetween(start: Date, end: Date) {
  const [w, f, m] = await Promise.all([
    db()
      .from("workout_logs")
      .select(WORKOUT_COLS)
      .gte("logged_at", start.toISOString())
      .lt("logged_at", end.toISOString())
      .order("logged_at"),
    db()
      .from("food_logs")
      .select(FOOD_COLS)
      .gte("logged_at", start.toISOString())
      .lt("logged_at", end.toISOString())
      .order("logged_at"),
    db()
      .from("measurements")
      .select("id, measured_at, name, value, unit")
      .gte("measured_at", start.toISOString())
      .lt("measured_at", end.toISOString())
      .order("measured_at"),
  ]);
  return {
    workouts: (must(w) as Record<string, unknown>[]).map(normWorkout),
    food: (must(f) as Record<string, unknown>[]).map(normFood),
    measurements: (must(m) as Record<string, unknown>[]).map((x) => ({
      ...(x as unknown as Measurement),
      value: Number(x.value),
    })),
  };
}

export async function latestMeasurements(): Promise<Measurement[]> {
  const rows = must(
    await db()
      .from("measurements")
      .select("id, measured_at, name, value, unit")
      .order("measured_at", { ascending: false })
      .limit(30),
  ) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: Measurement[] = [];
  for (const r of rows) {
    const name = String(r.name);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ ...(r as unknown as Measurement), value: Number(r.value) });
  }
  return out;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** Today's estimated intake vs target, factoring in workouts, plus the week so far. */
export async function calorieStatus(tz: string, dateStr?: string) {
  const profile = await getProfile();
  const day = dateStr ?? localDate(new Date(), tz);
  const monday = weekStart(day);
  const { start } = dayRangeUtc(monday, tz);
  const { end } = dayRangeUtc(day, tz);
  const logs = await logsBetween(start, end);
  const target = profile.baseline_daily_calorie_target;

  const byDay: { date: string; eaten: number; burned: number }[] = [];
  for (let d = monday; d <= day; d = addDays(d, 1)) {
    const inDay = <T,>(xs: T[], key: (x: T) => string) => xs.filter((x) => localDate(new Date(key(x)), tz) === d);
    byDay.push({
      date: d,
      eaten: sum(inDay(logs.food, (x) => x.logged_at).map((x) => x.estimated_calories)),
      burned: sum(inDay(logs.workouts, (x) => x.logged_at).map((x) => x.estimated_calories)),
    });
  }
  const todayRow = byDay[byDay.length - 1];
  const daysSoFar = byDay.length;
  const weekEaten = sum(byDay.map((d) => d.eaten));
  return {
    date: day,
    target_kcal: target,
    safe_minimum_kcal: SAFE_MIN_KCAL,
    estimated_eaten_kcal: todayRow.eaten,
    estimated_burned_kcal: todayRow.burned,
    remaining_vs_target_kcal: target ? target - todayRow.eaten : null,
    food_entries_today: logs.food.filter((x) => localDate(new Date(x.logged_at), tz) === day).length,
    week_so_far: {
      from: monday,
      days: byDay,
      eaten_kcal: weekEaten,
      target_kcal: target ? target * daysSoFar : null,
      balance_kcal: target ? weekEaten - target * daysSoFar : null,
    },
    note:
      "All figures are estimates. Workout calories are context, not food to 'earn back'. Never suggest a day below the safe minimum.",
  };
}

// ───────────────────────── Today card ─────────────────────────

export async function todaySummary(tz: string) {
  const today = localDate(new Date(), tz);
  const { start, end } = dayRangeUtc(today, tz);
  const [logs, { goal, micro }, profile] = await Promise.all([
    logsBetween(start, end),
    getActiveGoal(),
    getProfile(),
  ]);
  const cur = currentMicro(micro);
  let microGoal = null;
  if (cur) {
    const achieved = micro.filter((m) => m.status === "achieved").length;
    const hasNumbers = cur.target_value !== null && cur.target_value > 0;
    microGoal = {
      id: cur.id,
      title: cur.title,
      current: hasNumbers ? cur.current_value ?? 0 : achieved,
      target: hasNumbers ? cur.target_value : micro.length,
      mode: hasNumbers ? "value" : "ladder",
      unit: cur.unit,
    };
  }
  return {
    date: today,
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(new Date()),
    workouts: logs.workouts,
    food: logs.food,
    goal: goal ? { id: goal.id, title: goal.title, target_date: goal.target_date } : null,
    microGoal,
    microGoals: micro.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status as "not_started" | "in_progress" | "achieved",
      current: m.current_value,
      target: m.target_value,
      unit: m.unit,
      isCurrent: m.id === cur?.id,
    })),
    calories: {
      eaten: sum(logs.food.map((f) => f.estimated_calories)),
      burned: sum(logs.workouts.map((w) => w.estimated_calories)),
      target: profile.baseline_daily_calorie_target,
    },
  };
}

export type TodaySummary = Awaited<ReturnType<typeof todaySummary>>;

// ───────────────────────── compact text for Morris ─────────────────────────

export function workoutLine(w: WorkoutLog, tz: string) {
  const bits = [
    `[workout #${w.id}] ${shortStamp(w.logged_at, tz)}`,
    w.category,
    w.activity_name,
    w.duration_min ? `${w.duration_min} min` : null,
    w.intensity,
    w.estimated_calories ? `~${w.estimated_calories} kcal` : null,
    w.description ? `"${w.description}"` : null,
  ];
  return bits.filter(Boolean).join(" · ");
}

export function foodLine(f: FoodLog, tz: string) {
  const bits = [
    `[food #${f.id}] ${shortStamp(f.logged_at, tz)}`,
    f.meal_type,
    `"${f.description}"`,
    f.estimated_calories ? `~${f.estimated_calories} kcal` : null,
    f.estimated_protein_g ? `~${f.estimated_protein_g} g protein` : null,
    f.quality,
  ];
  return bits.filter(Boolean).join(" · ");
}

export function measurementLine(m: Measurement, tz: string) {
  return `[measurement #${m.id}] ${shortStamp(m.measured_at, tz)} · ${m.name} ${m.value} ${m.unit}`;
}

export async function recentHistoryText(tz: string, days: number) {
  const today = localDate(new Date(), tz);
  const from = addDays(today, -(days - 1));
  const { start } = dayRangeUtc(from, tz);
  const { end } = dayRangeUtc(today, tz);
  const logs = await logsBetween(start, end);
  const lines = [
    ...logs.workouts.map((w) => ({ t: w.logged_at, s: workoutLine(w, tz) })),
    ...logs.food.map((f) => ({ t: f.logged_at, s: foodLine(f, tz) })),
    ...logs.measurements.map((m) => ({ t: m.measured_at, s: measurementLine(m, tz) })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  // Per-day workout counts so gaps (skipped days) are obvious.
  const perDay: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const ws = logs.workouts.filter((w) => localDate(new Date(w.logged_at), tz) === d);
    const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
    perDay.push(`${label} ${d}: ${ws.length ? ws.map((w) => w.category).join(", ") : "no workout logged"}`);
  }
  return {
    from,
    to: today,
    summary_by_day: perDay,
    entries: lines.length ? lines.map((l) => l.s) : ["(nothing logged in this period)"],
  };
}
