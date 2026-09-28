import type Anthropic from "@anthropic-ai/sdk";
import { db, must } from "./supabase";
import { ASSUMED_WEIGHT_KG, SAFE_MIN_KCAL, metCalories } from "./calories";
import {
  calorieStatus,
  getActiveGoal,
  getProfile,
  recentHistoryText,
  saveProfile,
  type Profile,
} from "./data";
import { localToUtc } from "./time";

const WORKOUT_CATEGORIES = ["aerial", "calisthenics", "stretching", "cardio", "sport", "other"];
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "drink"];
const QUALITIES = ["on_plan", "mixed", "off_plan"];
const LOCAL_TIME_HINT =
  "Local date-time in the user's time zone, 'YYYY-MM-DDTHH:mm'. Resolve words like 'this morning' or 'yesterday' yourself. Omit for 'now'.";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_workout",
    description:
      "Save one workout/activity. Call once per distinct activity (e.g. 'stretched 15 min and did 20 min hoop' = two calls). Any activity is allowed. Give a MET value for the activity and intensity; the server computes calories as MET × the user's logged weight × hours and returns the result.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: WORKOUT_CATEGORIES },
        activity_name: {
          type: "string",
          description: "Short free-text name, e.g. 'hammock', 'flying pole', 'pull-ups', 'pickleball', 'hiking'.",
        },
        description: { type: "string", description: "Details worth keeping: skills worked, sets/reps, how it felt." },
        duration_min: { type: "number", description: "Minutes. Omit if unknown." },
        intensity: { type: "string", enum: ["light", "moderate", "vigorous"] },
        met_value: { type: "number", description: "Compendium-style MET for this activity and intensity." },
        estimated_calories: {
          type: "number",
          description: "Only if MET-based maths is impossible (e.g. no duration). Otherwise leave out.",
        },
        logged_at: { type: "string", description: LOCAL_TIME_HINT },
      },
      required: ["category", "activity_name"],
    },
  },
  {
    name: "log_food",
    description:
      "Save one meal/snack/drink. A message with food at two different times = two calls. Estimate calories and protein from typical values and realistic portions (Indian portions where relevant).",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "What was eaten, in plain words, e.g. '2 eggs, toast and a protein shake'." },
        meal_type: { type: "string", enum: MEAL_TYPES },
        quality: { type: "string", enum: QUALITIES, description: "Rough fit with her goal." },
        estimated_calories: { type: "number" },
        estimated_protein_g: { type: "number" },
        logged_at: { type: "string", description: LOCAL_TIME_HINT },
      },
      required: ["description", "quality", "estimated_calories"],
    },
  },
  {
    name: "log_measurement",
    description:
      "Save a body measurement (weight, waist, hips, etc). Always store metric; if she said lb or inches, pass the original number and unit and the server converts. Weight also updates her profile.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lower-case, e.g. 'weight', 'waist', 'hips', 'chest', 'thigh'." },
        value: { type: "number" },
        unit: { type: "string", enum: ["kg", "cm", "lb", "in"] },
        measured_at: { type: "string", description: LOCAL_TIME_HINT },
      },
      required: ["name", "value", "unit"],
    },
  },
  {
    name: "get_daily_calorie_status",
    description:
      "Today's (or a given day's) estimated calories eaten vs target, calories burned in workouts, and the running week balance.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "Local 'YYYY-MM-DD'. Omit for today." } },
    },
  },
  {
    name: "edit_log",
    description:
      "Correct an existing entry by its id (ids are shown in the context as #123). Only include fields that change. Changing a workout's duration or MET recalculates its calories unless you pass estimated_calories.",
    input_schema: {
      type: "object",
      properties: {
        log_type: { type: "string", enum: ["workout", "food", "measurement"] },
        id: { type: "integer" },
        changes: {
          type: "object",
          description:
            "Fields to change. Workout: category, activity_name, description, duration_min, intensity, met_value, estimated_calories, logged_at. Food: description, meal_type, quality, estimated_calories, estimated_protein_g, logged_at. Measurement: name, value, unit, measured_at.",
        },
      },
      required: ["log_type", "id", "changes"],
    },
  },
  {
    name: "delete_log",
    description: "Delete an entry by id.",
    input_schema: {
      type: "object",
      properties: {
        log_type: { type: "string", enum: ["workout", "food", "measurement"] },
        id: { type: "integer" },
      },
      required: ["log_type", "id"],
    },
  },
  {
    name: "get_recent_history",
    description:
      "Logs for the last N days with a per-day workout summary. The last 7 days are already in your context; use this for older periods or multi-week adherence checks.",
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", minimum: 1, maximum: 60 } },
      required: ["days"],
    },
  },
  {
    name: "create_goal",
    description:
      "Create the big goal. Only one goal is active at a time: any previous active goal is marked dropped. Returns the new goal id.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, e.g. '5 strict pull-ups'." },
        description: { type: "string" },
        target_date: { type: "string", description: "YYYY-MM-DD, worked out from the timeframe she gave." },
      },
      required: ["title"],
    },
  },
  {
    name: "update_goal",
    description:
      "Change the big goal (title, description, target date, status). Changing the target date is tier 3 of the adaptation logic: only after she has explicitly agreed. Give a reason; it is recorded.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        description: { type: "string" },
        target_date: { type: "string", description: "YYYY-MM-DD" },
        status: { type: "string", enum: ["active", "achieved", "dropped"] },
        reason: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "set_micro_goals",
    description:
      "Save micro-goals for a goal, only AFTER she has approved them. mode 'replace' swaps out every not-yet-achieved micro-goal (achieved ones are kept); mode 'append' adds to the end of the ladder. The first unachieved one becomes in progress.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        mode: { type: "string", enum: ["replace", "append"] },
        micro_goals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "e.g. '5 slow pull-up negatives'" },
              target_value: { type: "number", description: "Countable target, e.g. 5. Omit if not countable." },
              current_value: { type: "number" },
              unit: { type: "string", description: "e.g. 'reps', 'seconds', 'sessions'" },
            },
            required: ["title"],
          },
        },
      },
      required: ["goal_id", "mode", "micro_goals"],
    },
  },
  {
    name: "update_micro_goal",
    description:
      "Update progress or details of a micro-goal. Setting status 'achieved' automatically starts the next one in the ladder.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        title: { type: "string" },
        current_value: { type: "number" },
        target_value: { type: "number" },
        unit: { type: "string" },
        status: { type: "string", enum: ["not_started", "in_progress", "achieved"] },
      },
      required: ["id"],
    },
  },
  {
    name: "update_profile",
    description:
      "Save profile details. Weight/height/age/activity changes recompute her estimated maintenance calories. baseline_daily_calorie_target can never be below 1200. Set onboarding_complete true when onboarding is finished or she wants to skip the rest.",
    input_schema: {
      type: "object",
      properties: {
        age_bracket: { type: "string", description: "e.g. '30s', '35-44', 'early 40s'" },
        height_cm: { type: "number" },
        weight_kg: { type: "number", description: "Prefer log_measurement for weight; use this only to fix the profile." },
        activity_level: { type: "string", enum: ["sedentary", "light", "moderate", "active", "very_active"] },
        limitations: { type: "string", description: "Full current list of injuries/limitations (replaces the old text). 'none' if none." },
        baseline_daily_calorie_target: { type: "integer" },
        notes: { type: "string", description: "Other lasting preferences worth remembering (e.g. vegetarian). Replaces old notes." },
        onboarding_complete: { type: "boolean" },
      },
    },
  },
];

type Ctx = { tz: string; rawMessage: string };
type Json = Record<string, unknown>;

function when(input: unknown, tz: string): string {
  if (typeof input === "string" && input.trim()) {
    const d = localToUtc(input, tz);
    if (d) {
      // A time a few minutes in the future is fine (clock drift); far future is a mistake.
      return (d.getTime() > Date.now() + 6 * 3600_000 ? new Date() : d).toISOString();
    }
  }
  return new Date().toISOString();
}

function pick(obj: Json, keys: string[]): Json {
  const out: Json = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

async function currentWeight(profile?: Profile) {
  const p = profile ?? (await getProfile());
  return p.weight_kg;
}

async function workoutCalories(w: Json) {
  const weight = await currentWeight();
  const met = typeof w.met_value === "number" ? w.met_value : null;
  const dur = typeof w.duration_min === "number" ? w.duration_min : null;
  if (met && dur) {
    const kg = weight ?? ASSUMED_WEIGHT_KG;
    return {
      estimated_calories: metCalories(met, kg, dur),
      calc: `${met} MET × ${kg} kg × ${round1(dur / 60)} h`,
      assumed_weight_kg: weight ? undefined : ASSUMED_WEIGHT_KG,
    };
  }
  return {
    estimated_calories: typeof w.estimated_calories === "number" ? Math.round(w.estimated_calories) : null,
    calc: "model estimate (no MET/duration)",
    assumed_weight_kg: undefined,
  };
}

const TABLES: Record<string, { table: string; fields: string[]; time: string }> = {
  workout: {
    table: "workout_logs",
    time: "logged_at",
    fields: ["category", "activity_name", "description", "duration_min", "intensity", "met_value", "estimated_calories", "logged_at"],
  },
  food: {
    table: "food_logs",
    time: "logged_at",
    fields: ["description", "meal_type", "quality", "estimated_calories", "estimated_protein_g", "logged_at"],
  },
  measurement: { table: "measurements", time: "measured_at", fields: ["name", "value", "unit", "measured_at"] },
};

function toMetric(value: number, unit: string) {
  if (unit === "lb") return { value: round1(value * 0.45359237), unit: "kg", converted_from: `${value} lb` };
  if (unit === "in") return { value: round1(value * 2.54), unit: "cm", converted_from: `${value} in` };
  return { value, unit, converted_from: undefined };
}

async function advanceLadder(goalId: number) {
  const { micro } = await getActiveGoal();
  const ladder = micro.filter((m) => m.goal_id === goalId);
  if (ladder.some((m) => m.status === "in_progress")) return null;
  const next = ladder.find((m) => m.status === "not_started");
  if (!next) return null;
  await db().from("micro_goals").update({ status: "in_progress" }).eq("id", next.id);
  return next;
}

async function run(name: string, input: Json, ctx: Ctx): Promise<Json> {
  const { tz } = ctx;
  switch (name) {
    case "log_workout": {
      if (!WORKOUT_CATEGORIES.includes(String(input.category))) input.category = "other";
      const cal = await workoutCalories(input);
      const row = must(
        await db()
          .from("workout_logs")
          .insert({
            ...pick(input, ["category", "activity_name", "description", "duration_min", "intensity", "met_value"]),
            estimated_calories: cal.estimated_calories,
            logged_at: when(input.logged_at, tz),
            raw_message: ctx.rawMessage,
          })
          .select("id, logged_at, estimated_calories")
          .single(),
      );
      return { saved: true, ...row, calculation: cal.calc, assumed_weight_kg: cal.assumed_weight_kg };
    }

    case "log_food": {
      const row = must(
        await db()
          .from("food_logs")
          .insert({
            description: input.description,
            meal_type: MEAL_TYPES.includes(String(input.meal_type)) ? input.meal_type : null,
            quality: QUALITIES.includes(String(input.quality)) ? input.quality : "mixed",
            estimated_calories: typeof input.estimated_calories === "number" ? Math.round(input.estimated_calories) : null,
            estimated_protein_g: typeof input.estimated_protein_g === "number" ? round1(input.estimated_protein_g) : null,
            logged_at: when(input.logged_at, tz),
            raw_message: ctx.rawMessage,
          })
          .select("id, logged_at")
          .single(),
      );
      return { saved: true, ...row };
    }

    case "log_measurement": {
      const name = String(input.name ?? "").toLowerCase().trim();
      const m = toMetric(Number(input.value), String(input.unit));
      if (!name || !isFinite(m.value)) return { error: "name and a numeric value are required" };
      const row = must(
        await db()
          .from("measurements")
          .insert({ name, value: m.value, unit: m.unit, measured_at: when(input.measured_at, tz), raw_message: ctx.rawMessage })
          .select("id, measured_at, name, value, unit")
          .single(),
      );
      let profile: Profile | undefined;
      if (name === "weight" && m.unit === "kg") profile = await saveProfile({ weight_kg: m.value });
      return {
        saved: true,
        ...row,
        converted_from: m.converted_from,
        estimated_maintenance_kcal: profile?.estimated_maintenance_kcal,
        baseline_daily_calorie_target: profile?.baseline_daily_calorie_target,
      };
    }

    case "get_daily_calorie_status":
      return await calorieStatus(tz, typeof input.date === "string" ? input.date : undefined);

    case "edit_log": {
      const spec = TABLES[String(input.log_type)];
      if (!spec) return { error: "unknown log_type" };
      const changes = pick((input.changes as Json) ?? {}, spec.fields);
      if (changes[spec.time] !== undefined) changes[spec.time] = when(changes[spec.time], tz);
      if (spec.table === "measurements" && changes.value !== undefined && changes.unit !== undefined) {
        const m = toMetric(Number(changes.value), String(changes.unit));
        changes.value = m.value;
        changes.unit = m.unit;
      }
      if (spec.table === "workout_logs" && changes.estimated_calories === undefined &&
          (changes.duration_min !== undefined || changes.met_value !== undefined)) {
        const existing = must(
          await db().from("workout_logs").select("duration_min, met_value").eq("id", input.id).maybeSingle(),
        ) as Json | null;
        if (!existing) return { error: `no workout #${input.id}` };
        const cal = await workoutCalories({
          duration_min: Number(changes.duration_min ?? existing.duration_min),
          met_value: Number(changes.met_value ?? existing.met_value) || undefined,
        });
        if (cal.estimated_calories !== null) changes.estimated_calories = cal.estimated_calories;
      }
      if (!Object.keys(changes).length) return { error: "nothing to change" };
      const rows = must(await db().from(spec.table).update(changes).eq("id", input.id).select("*")) as Json[];
      if (!rows.length) return { error: `no ${input.log_type} #${input.id}` };
      const { raw_message: _omit, ...updated } = rows[0];
      return { updated: true, entry: updated };
    }

    case "delete_log": {
      const spec = TABLES[String(input.log_type)];
      if (!spec) return { error: "unknown log_type" };
      const rows = must(await db().from(spec.table).delete().eq("id", input.id).select("id")) as Json[];
      return rows.length ? { deleted: true, id: input.id } : { error: `no ${input.log_type} #${input.id}` };
    }

    case "get_recent_history":
      return await recentHistoryText(tz, Math.min(60, Math.max(1, Number(input.days) || 7)));

    case "create_goal": {
      await db().from("goals").update({ status: "dropped", updated_at: new Date().toISOString() }).eq("status", "active");
      const row = must(
        await db()
          .from("goals")
          .insert({
            title: input.title,
            description: input.description ?? null,
            target_date: input.target_date ?? null,
            original_target_date: input.target_date ?? null,
          })
          .select("id, title, target_date")
          .single(),
      );
      return { created: true, goal: row };
    }

    case "update_goal": {
      const before = must(await db().from("goals").select("*").eq("id", input.id).maybeSingle()) as Json | null;
      if (!before) return { error: `no goal #${input.id}` };
      const changes = pick(input, ["title", "description", "target_date", "status"]);
      if (!Object.keys(changes).length) return { error: "nothing to change" };
      const row = must(
        await db()
          .from("goals")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .select("*")
          .single(),
      );
      const dateChanged = changes.target_date !== undefined && changes.target_date !== before.target_date;
      await db().from("adaptation_events").insert({
        goal_id: input.id,
        tier: dateChanged ? 3 : null,
        kind: dateChanged ? "goal_date_extended" : "goal_updated",
        reason: input.reason ?? null,
        details: { before: pick(before, Object.keys(changes)), after: changes },
      });
      return { updated: true, goal: row };
    }

    case "set_micro_goals": {
      const goalId = Number(input.goal_id);
      const items = Array.isArray(input.micro_goals) ? (input.micro_goals as Json[]) : [];
      if (!items.length) return { error: "no micro_goals given" };
      const goal = must(await db().from("goals").select("id").eq("id", goalId).maybeSingle());
      if (!goal) return { error: `no goal #${goalId}` };
      if (input.mode !== "append") {
        await db().from("micro_goals").delete().eq("goal_id", goalId).neq("status", "achieved");
      }
      const existing = must(
        await db().from("micro_goals").select("position").eq("goal_id", goalId).order("position", { ascending: false }).limit(1),
      ) as { position: number }[];
      const startPos = existing.length ? existing[0].position + 1 : 0;
      must(
        await db()
          .from("micro_goals")
          .insert(
            items.map((m, i) => ({
              goal_id: goalId,
              position: startPos + i,
              title: m.title,
              target_value: m.target_value ?? null,
              current_value: m.current_value ?? null,
              unit: m.unit ?? null,
            })),
          ),
      );
      await advanceLadder(goalId);
      const { micro } = await getActiveGoal();
      return {
        saved: true,
        ladder: micro.map((m) => ({ id: m.id, title: m.title, status: m.status, target_value: m.target_value, current_value: m.current_value })),
      };
    }

    case "update_micro_goal": {
      const changes = pick(input, ["title", "current_value", "target_value", "unit", "status"]);
      if (changes.status === "achieved") changes.achieved_at = new Date().toISOString();
      const rows = must(await db().from("micro_goals").update(changes).eq("id", input.id).select("*")) as Json[];
      if (!rows.length) return { error: `no micro-goal #${input.id}` };
      let next = null;
      if (changes.status === "achieved" || changes.status === "not_started") next = await advanceLadder(Number(rows[0].goal_id));
      return {
        updated: true,
        micro_goal: rows[0],
        next_in_progress: next ? { id: next.id, title: next.title } : undefined,
        ladder_finished: changes.status === "achieved" && !next ? "no more micro-goals: propose the next one(s) for approval" : undefined,
      };
    }

    case "update_profile": {
      const patch = pick(input, ["age_bracket", "height_cm", "weight_kg", "activity_level", "limitations", "notes", "baseline_daily_calorie_target"]) as Partial<Profile>;
      let refused: string | undefined;
      if (typeof patch.baseline_daily_calorie_target === "number" && patch.baseline_daily_calorie_target < SAFE_MIN_KCAL) {
        refused = `Refused: ${patch.baseline_daily_calorie_target} kcal is below the ${SAFE_MIN_KCAL} kcal safe minimum. Target not changed.`;
        delete patch.baseline_daily_calorie_target;
      }
      if (input.onboarding_complete === true) {
        (patch as Json).onboarding_completed_at = new Date().toISOString();
      }
      const p = Object.keys(patch).length ? await saveProfile(patch) : await getProfile();
      return {
        saved: Object.keys(patch).length > 0,
        refused,
        profile: {
          age_bracket: p.age_bracket,
          height_cm: p.height_cm,
          weight_kg: p.weight_kg,
          activity_level: p.activity_level,
          limitations: p.limitations,
          estimated_maintenance_kcal: p.estimated_maintenance_kcal,
          baseline_daily_calorie_target: p.baseline_daily_calorie_target,
          onboarding_complete: Boolean(p.onboarding_completed_at),
        },
      };
    }
  }
  return { error: `unknown tool ${name}` };
}

export const WRITE_TOOLS = new Set([
  "log_workout", "log_food", "log_measurement", "edit_log", "delete_log",
  "create_goal", "update_goal", "set_micro_goals", "update_micro_goal", "update_profile",
]);

export async function runTool(name: string, input: unknown, ctx: Ctx): Promise<{ content: string; isError: boolean }> {
  try {
    const result = await run(name, { ...((input as Json) ?? {}) }, ctx);
    return { content: JSON.stringify(result), isError: "error" in result };
  } catch (e) {
    return { content: JSON.stringify({ error: (e as Error).message }), isError: true };
  }
}
