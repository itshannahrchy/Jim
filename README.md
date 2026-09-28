# Jim: chat with Morris

A personal coaching app (installable on your phone) where you tell Morris what you did and what you ate, and he logs it and coaches you.

This guide gets Phase 1 online. Do the steps in order. Nothing here costs money except the Claude API.

---

## Step 1: Set up the database (Supabase)

1. Open your Supabase project in the browser.
2. In the left sidebar, click **SQL Editor**, then **New query**.
3. Open the file `supabase/schema.sql` from this folder (in Notepad is fine), select everything, copy it, and paste it into the Supabase query box.
4. Click **Run**. You should see "Success. No rows returned".
5. Now get two values. Click **Project Settings** (gear icon), then:
   - **Data API**: copy the **Project URL**. This is `SUPABASE_URL`.
   - **API Keys**: copy the **secret** key (it starts with `sb_secret_`; on older projects it's the `service_role` key). This is `SUPABASE_SECRET_KEY`.
   Never use the "publishable"/"anon" key for this app.

## Step 2: Choose your passphrase

Pick several random words, e.g. `purple hammock eats seven mangoes`. Not a short PIN. This is `APP_PASSCODE`. Spaces are fine, capital letters count.

## Step 3: Anthropic key and spend limit

1. In the Anthropic Console, create an API key. This is `ANTHROPIC_API_KEY`.
2. In **Settings → Limits**, set a monthly spend limit (e.g. $10) so costs can never run away.

## Step 4: Put the code on GitHub

The code is already saved in a local Git repository in this folder. In your empty private GitHub repo, GitHub shows a box called **"…or push an existing repository from the command line"**. Copy those lines and run them in a terminal in this folder. They look like this:

```
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## Step 5: Deploy on Vercel

1. In Vercel, click **Add New… → Project**, choose your GitHub repo, and click **Import**.
2. Before clicking Deploy, open **Environment Variables** and add these five (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `APP_PASSCODE` | your passphrase |
   | `SESSION_SECRET` | copy it from the `.env.local` file in this folder (already generated for you) |
   | `ANTHROPIC_API_KEY` | from step 3 |
   | `SUPABASE_URL` | from step 1 |
   | `SUPABASE_SECRET_KEY` | from step 1 |

3. Click **Deploy**. When it finishes you get a link like `https://jim-xxxx.vercel.app`.

## Step 6: Put it on your phone

- **iPhone (Safari):** open the link, tap the **Share** button, then **Add to Home Screen**, then **Add**.
- **Android (Chrome):** open the link, tap the **⋮** menu, then **Add to Home screen** (or **Install app**).

Open **Jim** from your home screen, tap **Let's go**, enter your passphrase once, and Morris starts getting to know you.

Note: an app installed on an iPhone home screen keeps its own separate login, so you'll enter the passphrase once in Safari and once more inside the installed app. After that it remembers you for about a year.

---

## Good to know

- **Voice:** tap the red microphone, speak, tap again to stop. Your words appear in the text box so you can fix them before sending. If voice doesn't work (it's unreliable inside installed apps on some iPhones), use the microphone key on your phone's keyboard instead. It does the same job.
- **Fixing mistakes:** just tell Morris ("actually that was 30 minutes", "delete my last food entry"), or tap a tile in the Today card and delete an entry there.
- **Calories are estimates.** Workouts use standard MET values × your logged weight × time; food uses typical portion values.
- **Changing the passphrase:** change `APP_PASSCODE` in Vercel (Settings → Environment Variables), then redeploy. Every device will need the new passphrase.
- **Supabase pauses** free projects after about a week with no use. If Jim ever says it can't reach the database, open Supabase and click **Restore project**.
- **Wrong passphrase 5 times** locks that network out for 15 minutes.

## Running it on your computer (optional)

Fill in the blanks in `.env.local`, then run `npm install` and `npm run dev`, and open http://localhost:3000.

## What's where (for the curious)

- `app/`: screens (`unlock` = welcome + passphrase, `page.tsx` = home) and server routes (`api/`)
- `components/`: the chat screen, Today card, microphone, and the hand-drawn Morris illustrations
- `lib/morris-prompt.ts`: Morris's personality and coaching rules
- `lib/tools.ts`: the actions Morris can take (log a workout, log food, edit, delete, goals…)
- `supabase/schema.sql`: the database tables
