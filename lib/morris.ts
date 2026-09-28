import Anthropic from "@anthropic-ai/sdk";
import { MORRIS_SYSTEM } from "./morris-prompt";
import { TOOLS, WRITE_TOOLS, runTool } from "./tools";
import { db, must } from "./supabase";
import {
  calorieStatus,
  getActiveGoal,
  getProfile,
  latestMeasurements,
  recentHistoryText,
} from "./data";
import { formatLocal, localDate } from "./time";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ROUNDS = 8;

let anthropic: Anthropic | null = null;
function client() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return anthropic;
}

export const OPENING_MESSAGE =
  "Hi, I'm Morris! I'll be your coach. You tell me what you did and what you ate, any time of day, and I'll keep track and help you reach your goals.\n\nFirst, a few quick questions so I can get to know you (skip anything you like). Roughly how old are you? An age bracket like \"30s\" is perfect.";

async function buildContext(tz: string): Promise<string> {
  const now = new Date();
  const [profile, { goal, micro }, measurements, calories, history] = await Promise.all([
    getProfile(),
    getActiveGoal(),
    latestMeasurements(),
    calorieStatus(tz),
    recentHistoryText(tz, 7),
  ]);

  const nowText = formatLocal(now, tz, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const microLines = micro.length
    ? micro.map((m) => {
        const progress =
          m.target_value !== null ? ` (${m.current_value ?? 0}/${m.target_value}${m.unit ? " " + m.unit : ""})` : "";
        return `  #${m.id} [${m.status}] ${m.title}${progress}`;
      })
    : ["  (none yet)"];

  return [
    `Now: ${nowText} (${tz}). Today's local date: ${localDate(now, tz)}.`,
    `Onboarding: ${profile.onboarding_completed_at ? "complete" : "NOT complete (continue onboarding)"}.`,
    "",
    "Profile:",
    `  age bracket: ${profile.age_bracket ?? "unknown"}; height: ${profile.height_cm ? profile.height_cm + " cm" : "unknown"}; weight: ${profile.weight_kg ? profile.weight_kg + " kg" : "unknown"}; activity level: ${profile.activity_level ?? "unknown"}`,
    `  limitations: ${profile.limitations ?? "not asked yet"}`,
    `  notes: ${profile.notes ?? "none"}`,
    `  estimated maintenance: ${profile.estimated_maintenance_kcal ? "~" + profile.estimated_maintenance_kcal + " kcal" : "unknown"}; baseline daily target: ${profile.baseline_daily_calorie_target ? profile.baseline_daily_calorie_target + " kcal" : "not set"}`,
    `  latest measurements: ${measurements.length ? measurements.map((m) => `${m.name} ${m.value} ${m.unit} (${formatLocal(m.measured_at, tz, { day: "numeric", month: "short" })})`).join(", ") : "none"}`,
    "",
    goal
      ? `Big goal: #${goal.id} "${goal.title}"${goal.description ? ` — ${goal.description}` : ""}; target date ${goal.target_date ?? "none"}${goal.original_target_date && goal.original_target_date !== goal.target_date ? ` (originally ${goal.original_target_date})` : ""}; set on ${goal.created_at.slice(0, 10)}`
      : "Big goal: none yet",
    "Micro-goals:",
    ...microLines,
    "",
    `Today's calories (estimates): eaten ~${calories.estimated_eaten_kcal} kcal, burned in workouts ~${calories.estimated_burned_kcal} kcal, target ${calories.target_kcal ?? "not set"}. Week so far (from Monday ${calories.week_so_far.from}): eaten ~${calories.week_so_far.eaten_kcal} vs target ${calories.week_so_far.target_kcal ?? "n/a"}.`,
    "",
    `Last 7 days (${history.from} to ${history.to}), workouts per day:`,
    ...history.summary_by_day.map((l) => "  " + l),
    "Entries:",
    ...history.entries.map((l) => "  " + l),
  ].join("\n");
}

/** Last N chat messages as a valid alternating user/assistant list. */
async function history(): Promise<Anthropic.MessageParam[]> {
  const rows = must(
    await db()
      .from("chat_messages")
      .select("role, content")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(HISTORY_LIMIT),
  ) as { role: "user" | "assistant"; content: string }[];
  rows.reverse();

  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.role === r.role) last.content += "\n\n" + r.content;
    else out.push({ ...r });
  }
  if (out.length && out[0].role === "assistant") out.unshift({ role: "user", content: "(opened the app)" });
  return out;
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Plain logs ("ate 2 eggs") get a quick, light pass; questions and coaching
// requests get deeper thinking so the advice is genuinely expert.
const COACHING_HINTS =
  /\?|\b(should|how|why|what|which|can't|cannot|can i|stuck|struggl|plateau|plan|advice|help|tips?|improv\w*|progress\w*|aren.t|isn.t|won.t|not getting|still|suggest|recommend|sore|pain|hurt|injur|tired|motivat|behind|missed|skipped|rest of the week|next week|tomorrow|drill|technique|what to eat|ideas?)\b/i;

function effortFor(message: string): "low" | "high" {
  return COACHING_HINTS.test(message) ? "high" : "low";
}

export async function chatWithMorris(userMessage: string, tz: string) {
  const effort = effortFor(userMessage);
  const messages = await history();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: MORRIS_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: await buildContext(tz) },
  ];

  let changed = false;
  let reply = "";
  let lastText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: effort === "high" ? 12000 : 4096,
      system,
      tools: TOOLS,
      messages,
      output_config: { effort },
    });

    const text = textOf(res.content);
    if (text) lastText = text;

    if (res.stop_reason === "refusal") {
      reply = "Hmm, I can't help with that one. Want to tell me about your training or food instead?";
      break;
    }

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      reply = text || lastText;
      break;
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const r = await runTool(t.name, t.input, { tz, rawMessage: userMessage });
      if (WRITE_TOOLS.has(t.name) && !r.isError) changed = true;
      results.push({ type: "tool_result", tool_use_id: t.id, content: r.content, is_error: r.isError || undefined });
    }
    messages.push({ role: "user", content: results });
  }

  if (!reply) reply = lastText || (changed ? "Saved!" : "Sorry, I got a bit tangled there. Could you say that again?");
  return { reply, changed };
}
