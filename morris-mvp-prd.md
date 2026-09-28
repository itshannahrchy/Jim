# Jim: MVP Product Requirements Document

**Product:** Jim, a personal AI fitness and nutrition coach app (single-user PWA). The character inside it, whom I chat with, is called Morris.
**Version:** MVP (Phase 1)
**Owner:** Me (sole user)
**Status:** Draft for build

---

## 1. Summary

Jim is a chat-first personal wellness app, and Morris is the character I talk to. I tell Morris, by voice or text and at any time of day, what workout I did and what I ate. He logs it, tracks my progress against a big goal and smaller micro-goals, and gives me coaching advice that takes my real behavior into account.

The MVP proves the core loop: **talk to Morris, have it logged correctly, see today's progress, get useful guidance.** Everything else (weekly rebalancing, dashboards, measurements, injury tracking, cycle-aware coaching, skill tracker) comes in later phases.

## 2. Problem

Most fitness apps make logging tedious (forms, dropdowns, food databases) and give generic advice that ignores what I actually did. I do aerial as my main sport, calisthenics as cross-training, occasional stretching, and rare cardio. Generic apps don't understand this mix, or how a week of strength work and two cheat days should change what I do next.

## 3. User

One person: a woman who does aerial arts (she mixes apparatus: hammock one day, flying pole another, hoop, silks and others), cross-trains with calisthenics, and wants to lose weight / tone up / drop her waist size / progress aerial skills (e.g. inversions) / achieve pull-ups. She is not a developer, uses her phone as the main device, and wants something cheap to run.

## 4. Goals and non-goals

### MVP goals
1. Logging a workout or meal takes **under 15 seconds** by voice or text.
2. Morris correctly turns free-form messages into structured logs.
3. I can set one big goal with a timeframe and approve a ladder of micro-goals, and see progress on them.
4. Morris answers as a coach using my goals, profile, limitations, and the last 7 days of logs.
5. Everything happens through chat: no accounts, no sign-up, and no forms, dropdowns, or settings screens.
6. The app is installable on my phone home screen and costs **roughly $5 a month or less** to run (excluding the one-off Claude Code build month).

### Non-goals for the MVP
- Reminders or notifications of any kind (all logging is self-initiated)
- Photo logging or image analysis
- Precise calorie or macro tracking (rough food quality only, unless I ask)
- Measurement charts and trends, injury tracker screen, cycle tracking, aerial skill tracker (later phases; I can already tell Morris my measurements in chat and they are stored)
- Accounts, sign-up, email or phone verification, dropdowns, form fields, or settings screens (the passcode field is the only exception)
- Imperial units (metric only)
- Dedicated weekly recap or "reset the week" screen (Phase 2; in the MVP I can simply ask Morris in chat)
- Wearable integrations, social features, multiple users, native iOS/Android apps

## 5. Success metrics

| Metric | Target |
|---|---|
| Logging speed (open app to confirmed log) | Under 15 seconds |
| Correct parsing on review of the first 50 logs | 90% or more correct without editing |
| Days per week I log something (weeks 2 to 4) | 5 or more |
| Morris reply time | Under 6 seconds typical |
| Running cost (Anthropic API, hosting free tiers) | About $5 a month or less |
| Overall | I still use it after 4 weeks |

## 6. Scope: what is in the MVP

1. Welcome screen (first launch)
2. Passcode gate (no account)
3. Conversational onboarding: profile, big goal, micro-goals (all through chat)
4. Chat with Morris (text and voice) with automatic logging
5. "Today" summary card (today's workouts, today's food, current micro-goal progress)
6. Basic contextual coaching in chat
7. Installable PWA, deployed online

## 7. User stories and requirements

### 7.1 Welcome and access (no accounts)
- **As a first-time user**, I see a welcome screen with Morris and a "Let's go" button, so the app feels friendly from the start.
- **As the only user**, I never sign up. The first time I open Jim on a device it asks for one passcode that I chose, and remembers me on that device afterwards.
- Acceptance criteria:
  - No email, phone number, username, or verification step exists anywhere.
  - The welcome screen appears only on first launch.
  - The passcode is stored server-side as an environment variable and compared in constant time; wrong attempts are throttled (for example, 5 tries then a 15-minute lockout).
  - A correct passcode sets a signed, httpOnly, Secure, SameSite=Strict cookie lasting about a year.
  - Every page and API route (including the Claude API route) rejects requests without the cookie.
  - The database is reachable only from server routes; the browser holds no database key.

### 7.2 Onboarding (a conversation, not a form)
- **As a new user**, Morris asks me a few questions in the chat and I answer in my own words, typed or spoken. There are no dropdowns, text fields, sliders, or pickers. He saves my answers with tools.
- He asks about (all skippable, and I can tell him later):
  - Age bracket, and optionally my weight, height, and waist (metric)
  - Big goal and target timeframe (e.g. "5 strict pull-ups in 4 months", "drop waist size in 3 months", "full inversion in 6 months")
  - Injuries or current limitations
- He does **not** ask me to pick an aerial apparatus. I use different ones on different days (hammock, flying pole, hoop, silks and more), so the apparatus is recorded per workout from what I say.
- Morris then **proposes 3 to 6 micro-goals** that ladder up to the big goal (e.g. pull-up negatives, assisted pull-ups, 1 strict rep, 3 reps, 5 reps). I approve, change, remove, or add by replying in chat.
- Acceptance criteria:
  - Onboarding can be completed in under 5 minutes.
  - Goals, micro-goals, and profile are saved and used in every later chat.
  - I can change my goal, micro-goals, or any profile detail later just by telling Morris ("my waist is 74 cm now", "change my big goal to...").
  - The big goal is asked exactly once, at onboarding, and is not re-asked on a schedule. Micro-goals are only revisited when the current one is completed, at which point Morris proposes the next one.

### 7.3 Chat and logging (core feature)
- **As a user**, I can open the app at any time and send Morris a message as many times a day as I like.
- Examples that must work:
  - "Did 45 min on the hammock, worked on inversions, plus 20 pull-up negatives" (one workout, several details, apparatus captured)
  - "Flying pole class for an hour today" (a different apparatus)
  - "I weigh 62 kg this morning" or "waist is 74 cm" (measurement)
  - "Ate 2 eggs, toast and a protein shake" (one meal)
  - "Stretched for 15 min this morning and had oatmeal for breakfast" (workout and food in one message)
  - "Actually that was 30 minutes, not 45" (correction)
  - "Hey Morris, I skipped lunch" (name used as greeting, not logged as content)
  - "Delete my last food entry"
- Acceptance criteria:
  - Morris extracts and saves structured entries via tool calls, then confirms in a friendly one-or-two-line reply that states what was saved.
  - Workout entries capture category (aerial, calisthenics, stretching, cardio, sport, other), a free-text activity name (any activity — pickleball, basketball, hiking, swimming, not just a fixed list), the apparatus if mentioned, a description, duration in minutes, an estimated calories-burned figure, and date/time.
  - Measurements (weight, waist, hips, etc.) are saved with a date and shown back to me in metric; if I say pounds or inches, Morris converts and confirms the converted value.
  - Food entries include an estimated calorie figure (and protein when inferable), clearly labeled as an estimate.
  - Food entries capture a description, meal type if given, a rough quality tag (on plan, mixed, off plan) inferred by Morris, and date/time.
  - Relative times ("this morning", "yesterday", "last night") resolve correctly using my local timezone.
  - If something is ambiguous (e.g. "did some abs"), Morris logs it with what he knows and asks at most one short follow-up question. He never blocks logging to ask.
  - Corrections and deletions of recent entries work through chat.
  - Non-logging messages ("I'm sore today, what should I do?", "give me a plan for tomorrow") get a helpful coaching answer without creating logs.

### 7.4 Voice input
- **As a user**, I tap a large microphone button next to the text box, speak, and the transcript appears in the text box for me to check and send.
- Acceptance criteria:
  - The button is always visible, about 70px, and the listening state is obvious (color change and label).
  - Tap once to start, tap again to stop.
  - The transcript is placed in the input, not sent automatically, so I can fix mishearings.
  - If speech recognition is unavailable or permission is denied, the app shows a clear message and typing still works.
  - Uses the browser's built-in speech recognition (no paid transcription API).

### 7.5 Today summary
- **As a user**, I see a collapsible "Today" card pinned above the chat.
- Contents: two side-by-side, level tiles, "Workouts" and "Food", each showing today's entries (latest plus a count), and the current micro-goal with a progress bar.
- Acceptance criteria:
  - The card updates immediately after a log is saved.
  - It collapses and expands with a chevron button, and the state is remembered during the session.
  - Empty states are friendly ("Nothing logged yet today").
  - Tapping a tile shows the day's full entries in a simple list where I can delete an entry.

### 7.5b Weekly targets and three-tier adaptation
- **As a user**, I want Morris to act like an expert coach who notices when I fall behind and tells me how to get back on track, not just log data passively.
- Derived from my current micro-goal and big goal, Morris keeps an implicit weekly target (e.g. "3 aerial sessions, 2 calisthenics, 1 rest day") and can state it when I ask.
- When I fall behind (e.g. 2 skipped workout days), Morris works through three options **in order**, proposing the first that reasonably fits before offering the next:
  1. Catch up within the current week with a concrete, realistic plan.
  2. Adjust next week's targets, if catching up isn't realistic or healthy.
  3. Extend the goal's target date — last resort, only with my explicit agreement, only if a multi-week pattern shows the timeframe is unrealistic.
- Acceptance criteria:
  - Morris explains which tier he's recommending and why.
  - He never silently changes a target or goal date without telling me and getting my agreement for tier 3.
  - Calorie estimates use standard MET-based calculation against my logged weight, clearly labeled as an estimate.

### 7.5c Daily calorie balancing and Indian meal suggestions
- **As a user**, if I eat more than planned one day, I want Morris to help me balance it out sensibly the next day rather than ignoring it or overcorrecting drastically.
- At onboarding, Morris calculates a baseline daily calorie target from my profile (age, weight, height, activity level) using a standard formula, and tells me what it is and why.
- He tracks estimated calories eaten against that baseline each day, factoring in calories burned from logged workouts.
- If I eat meaningfully more than target, he can suggest a modest reduction for the next day — never drastic, and **never below about 1,200 kcal/day for an adult woman**, which he refuses even if asked, explaining why instead.
- **As a user**, when I ask what to eat, Morris gives me **Indian cuisine** suggestions using ingredients realistically available in a city like Hyderabad or Bangalore, with a rough calorie estimate, fitted to my remaining calories and goal.
- Acceptance criteria:
  - "4 boiled eggs and a roti for lunch" is logged with an estimated calorie figure.
  - Meal suggestions are Indian, use common local ingredients (dal, paneer, curd, roti, rice, vegetables, eggs, idli/dosa/upma, etc.), and come with a calorie estimate.
  - Suggestions vary rather than repeating the same meal every time.
  - If my messages suggest restriction or compensating after a big meal, Morris responds with care per the safety rules, not by tightening targets further.

### 7.5d Expert skill coaching (e.g. inversions)
- **As a user**, when I tell Morris I'm struggling with a specific skill, I want real diagnostic coaching, not generic encouragement.
- Example: "I still can't get my inversion, feels like I have no core strength" should get a reply that identifies likely limiting factors (core/hollow-body strength, shoulder flexibility, grip/wrist endurance, confidence, technique) and prescribes specific drills (e.g. leg raises, hollow body holds, scapular pulls), which I can accept as a new micro-goal.
- Acceptance criteria:
  - Responses name specific, plausible limiting factors for the skill mentioned, not a generic "keep practicing."
  - Suggested drills are concrete and actionable (named exercises), not vague.
  - Morris can turn a suggested drill into a micro-goal if I say yes.
  - This works in Phase 1 chat; a persistent, structured checklist of sub-skills is Phase 3.

### 7.6 Basic contextual coaching (in chat)
- **As a user**, I can ask Morris what to do today or for the rest of the week, and he answers using my goals, limitations, and the last 7 days of logs.
- Acceptance criteria:
  - Answers reference my real recent activity (e.g. "You've done three strength days and no aerial this week...").
  - Advice is flexible and practical (focus for the day, food guidance), not a rigid plan, unless I ask for one.
  - Morris never recommends movements that conflict with limitations I've told him about.
  - When a micro-goal appears completed, Morris congratulates me and proposes the next micro-goal for my approval.
  - The weekly three-tier adaptation above (section 7.5b) is in the MVP; a dedicated dashboard screen for it and the automated recap are Phase 2.

### 7.7 Installable PWA
- **As a user**, I can add the app to my phone's home screen and open it like a native app.
- Acceptance criteria: web manifest with name "Morris", icon, and theme colors; opens full-screen; layout works at 390px width first.

## 8. Morris: persona and AI behavior

- **Name:** Morris. He answers to it and refers to himself by it. A message beginning with "Morris" or "Hey Morris" treats the name as a greeting, never as part of a log.
- **Personality:** friendly, upbeat, slightly goofy little monster who is also a knowledgeable coach. Direct and honest, warm, never guilt-trips about cheat days or missed sessions; he treats setbacks as data.
- **Expertise:** calisthenics and bodyweight progressions; aerial arts across whichever apparatus I use that day (inversions, strength and mobility needs, typical injury areas such as shoulders, wrists, hip flexors); sparing, efficient cardio; and women's health, fitness, and wellbeing, including protein and recovery needs, sleep, stress, and energy.
- **Genuine specialist, not a themed generic assistant:** Morris reasons like an experienced aerial/calisthenics coach. When I say I'm stuck on a specific skill (e.g. "I can't get my inversion"), he identifies plausible limiting factors for that specific skill, explains which sound most likely from what I've said, and prescribes concrete accessory drills to close the gap — not vague encouragement. He can propose these as a new micro-goal for my approval. This is normal chat behavior, available any time, like talking to Claude directly but with deep applied knowledge of this domain.
- **Units:** metric (SI) only: kg, cm, km, minutes, grams and millilitres.
- **Grounding:** generally accepted, evidence-based practice. Flexible daily advice.
- **Safety guardrails:**
  - Never suggest a daily calorie target below about 1,200 kcal for an adult woman, even temporarily or on request; explain why and offer a modest, safe adjustment instead.
  - No diagnosis or medical advice. For pain beyond normal training soreness, he suggests seeing a professional.
  - No extreme dieting advice. He does not push very low calorie targets or crash approaches. If my messages suggest disordered eating or unhealthy compensation (restricting, punishing after cheat days), he responds with care, avoids giving numbers or plans that could feed it, and gently suggests talking to a professional.
  - Weight loss and waist goals are supported at a sustainable pace.
- **Tool use:** Morris persists data only through tool calls, never by "remembering" in chat. Required tools:
  - `log_workout`, `log_food`, `log_measurement`
  - `edit_log`, `delete_log`
  - `get_recent_history` (last N days of logs, used for coaching)
  - `create_goal`, `update_goal`, `set_micro_goals`, `update_micro_goal`
  - `update_profile`
- **Cost control:** send only the profile, goals, and the last 7 days of logs plus the most recent chat messages (for example the last 20) as context; cap output length; use a current Sonnet-class model; keep the API key server-side only.

## 9. Screens

1. **Welcome:** graph-paper background, Morris standing in a hand-drawn aerial hoop with two small friends, the headline "Hi, I am Morris!", one short line, dark "Let's go" button.
2. **Passcode:** a single passcode field, shown only on a device that hasn't entered it yet, in the same visual style.
3. **Onboarding:** conversational, inside the normal chat UI. No forms, dropdowns, or quick-pick buttons.
4. **Home (chat):** header (Morris avatar, the app name "Jim", day pill), collapsible Today card, message list with Morris avatar beside his bubbles, text input, large coral microphone button.
5. **Day detail:** simple list of today's entries opened from the Today tiles.

Visual design (fonts, colors, illustration style, Morris's look) is specified in the build prompt's "UI & Design Preferences" section and the design canvas mockups.

## 10. Data model (MVP)

| Table | Key fields |
|---|---|
| `profile` | id, age_bracket, limitations (text), timezone, weight, height, activity_level, baseline_daily_calorie_target, created_at |
| `goals` | id, title, description, target_date, status (active, achieved, dropped) |
| `micro_goals` | id, goal_id, position, title, status (not_started, in_progress, achieved), achieved_at |
| `workout_logs` | id, logged_at, category, activity_name (free text), description, duration_min (nullable), estimated_calories (nullable), raw_message |
| `food_logs` | id, logged_at, description, meal_type, quality, estimated_calories, estimated_protein_g, raw_message |
| `measurements` | id, measured_at, name (weight, waist, hips, etc.), value, unit (kg, cm) |
| `food_logs` | id, logged_at, meal_type (nullable), description, quality (on_plan, mixed, off_plan), raw_message |
| `chat_messages` | id, role, content, created_at |

Row-level security is on for every table. All timestamps are stored in UTC and shown in my local timezone.

## 11. Technical approach

- **Frontend and API routes:** Next.js (App Router), mobile-first, deployed on Vercel (free Hobby tier)
- **Database:** Supabase (free tier), used purely as a database and accessed only from server routes with the secret key. No Supabase Auth, no accounts. Row-level security on with no public policies.
- **Access:** a single passcode (environment variable) and a long-lived signed session cookie, as described in section 7.1
- **AI:** Anthropic Claude API with tool use, called only from server-side routes
- **Voice:** browser Web Speech API
- **PWA:** manifest and service worker (installable, cached app shell); no push notifications
- **Secrets:** stored in environment variables, never committed to the repo, never sent to the browser (Supabase secret key and Anthropic key server-side only)

## 12. Cost expectations

- One-off: about one month of Claude Pro (roughly $20) while building; can be cancelled afterwards, and the finished app keeps working.
- Running: Anthropic API pay-as-you-go, expected to be a few dollars a month for one user; set a monthly spend limit in the Anthropic console. Vercel and Supabase free tiers should cover this app.

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Browser speech recognition is inaccurate or unsupported on some browsers | Show the transcript for review before sending; typing always works; test on my actual phone early |
| Mis-parsed logs erode trust | Confirm every log in Morris's reply; make edit and delete easy; review first 50 logs |
| Supabase free projects pause after a week of inactivity | Regular use keeps it active; if paused, restore from the dashboard |
| API costs creep up | Limited context window, output caps, spend limit in console |
| Overly heavy first build hits Claude Code usage limits | Build in phases; pause between them |
| Advice that is unsafe or fuels unhealthy habits | Safety guardrails in section 8; no extreme targets |
| Public URL exposes personal data or lets strangers spend my API credits | Passcode gate on every page and API route, throttled failed attempts, database reachable only from the server, spend limit in the Anthropic console. Choose a long passphrase, not a short PIN |

## 14. Phasing

- **Phase 1 (this MVP):** everything in this document.
- **Phase 2:** dashboard, body measurements (numeric), injury/pain tracking, structured weekly "reset the week" rebalancing.
- **Phase 3:** weekly recap and next-week plan, menstrual-cycle-aware coaching (optional toggle), a *formally tracked* aerial skill progression checklist (persistent sub-skill statuses over time), and recovery and rest-day awareness. Expert conversational skill coaching itself (diagnosing limiting factors, prescribing drills) is in Phase 1.

## 15. Definition of done for the MVP

- I can open the app on my phone from the home screen, enter the passcode once, and complete onboarding entirely by chatting.
- I can log workouts and meals by voice and by text, several times a day, and see them in the Today card.
- I can correct and delete entries through chat.
- Morris answers coaching questions using my goals and recent logs.
- The app is deployed, there are no accounts, every route is passcode-protected, and secrets are not exposed.
- I've used it for a week and the parsing feels trustworthy.

## 16. Decisions and open questions

**Decided**
- The app is called Jim; the character is called Morris.
- No accounts or sign-up; a single passcode protects the app.
- Aerial apparatus varies day to day, so it is recorded per workout and never asked as a fixed profile setting.
- Workouts are not limited to aerial/calisthenics/stretching/cardio; any activity (pickleball, basketball, etc.) is logged, with an estimated calorie figure using MET-based calculation.
- No monthly goal check-in; the weekly three-tier adaptation logic replaces it.
- Testing happens on a free Vercel preview URL, opened on my own phone, before the real deployment.
- Everything (onboarding, goals, weight, waist, corrections) is done by chatting: no forms or dropdowns.
- Metric units only.

- Morris's replies are short by default (a line or two to confirm a log, a short paragraph for advice), with fuller detail whenever I ask.

**Open**
- None.
