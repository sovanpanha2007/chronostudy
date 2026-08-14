# Chronostudy — project plan

*A study timer that makes daily consistency visible, rewarding, and something students actually want to keep up. The GitHub of studying.*

**Name status**: locked in as "Chronostudy." Names considered and ruled out due to existing collisions: Hearth (writing-habit app), Wick (student study planner), Commitly (cash-flow app, task app, git commit-message tool — triple collision), Emberlog (journaling app), Chronolog (watch-accuracy app, environmental time-lapse platform, logging infrastructure — multiple collisions). Stoke, Kiln, Timegrid, and Studyclock were also short-listed and cleared a preliminary check, kept here as backups. **Next step before fully committing**: run a proper USPTO trademark search and App Store/Play Store name check — the searches done during planning catch obvious collisions but aren't a substitute for that.

---

## 1. The problem

Most study timers are stopwatches with extra steps — they record what you did, but give you no reason to come back tomorrow. Developers have had this problem solved for over a decade: GitHub's contribution graph turns invisible daily effort into a visible, satisfying record, and it's one of the more quietly effective habit-forming UIs ever shipped. Students have nothing equivalent for the habit that arguably matters more to their outcomes.

## 2. The solution

One core loop: **start a timer → log a session → watch your year fill in.** That loop is wrapped in proven behavioral mechanics (detailed in section 4) rather than left as a bare feature list — the psychology is the product, not an add-on.

## 3. Who it's for

Students who already want to study more consistently but lose the thread without a visible reason to keep going — the same audience Forest, Duolingo, and Toggl have each proven will show up daily for a well-designed habit loop, currently split across generic tools none of which were built specifically for studying.

## 4. Core features

Each feature below includes the mechanic as decided, the reasoning behind it, and any open caution flagged during planning.

**Phase split**: Phase 1 (web app) ships Timer, Endowed progress (heatmap), Variable milestone (badges), and Immediate feedback. Streak (with passes) and Social leaderboard are deferred to phase 2, once the core loop is validated and the platform question is revisited for mobile. Full rationale in section 8.

### 4.0 Timer & session log

- **Timer display**: circular radial dial (reference: Session app), not a plain digital countdown — same start/pause/stop mechanics underneath, different visual language.
- **Minimum session duration**: 5 minutes. Sessions stopped before this are silently discarded — no session row is created, no message shown. Chosen for a clean, unambiguous cutoff over showing a "too short" message; can be loosened later if it turns out to feel too strict for short legitimate sessions.
- **Session log**: collapsed by default, showing only the 3 most recent sessions as a compact link/list (reference: Session app's "Session log" link). Clicking it expands to show the full past week — not all-time history.
- **Full history access**: anything older than a week is reached by clicking a specific day on the heatmap, which shows that day's session breakdown. The heatmap remains the only place for genuine long-term history; the session log is a fast, short-range check, not a browsing tool.
- **Tab close / crash handling**: closing the tab **ends** the session rather than pausing it — simpler than pause-and-resume, and avoids having to invent abandoned-session cleanup rules or cross-device resume logic. Since a hard crash may not reliably fire a close event, the timer **autosaves elapsed time to Supabase every 30–60 seconds** while running, not just once at the end — worst case loses under a minute, not the whole session. Stepping away and coming back later produces two separate session entries rather than one continuous one; daily totals and heatmap color still sum correctly either way. The 5-minute minimum duration rule applies the same at this close point as anywhere else.

### 4.1 Streak (loss aversion) — deferred to phase 2

- **Mechanic**: user sets a personal daily study-time goal. Reaching **10% of that goal** on a given day is enough to increment the streak — proportional to the user's own goal, not a fixed number, so a 30-minute goal and a 4-hour goal both have a fair, personally-calibrated bar.
- **Streak passes**: TikTok-style bank of **5 passes**. Missing a day's 10% threshold burns a pass instead of breaking the streak immediately. Once all 5 are used, the streak resets.
- **Streak recovery**: originally considered pay-to-restore; **replaced** with earn-back paths — a bonus pass earned monthly for consistent use, or completing 7 straight days of full goal completion to earn the streak back. No payment tied to restoring a broken streak (see design values, section 6).
- **Day boundary**: determined by the user's local timezone. No cross-timezone handling planned for v1.
- **Open design tension**: reaching only 10% of goal is enough to grow the streak, so the streak signals "showed up," not "hit the goal." Plan is a *separate*, bigger celebration specifically for 100%-of-goal days, so that distinction stays visible (see 4.4).

### 4.2 Endowed progress (heatmap)

- **Mechanic**: a GitHub-style calendar heatmap, one cell per day. Color intensity is **relative to the user's personal daily goal** (not raw minutes) — light color for partial progress, darkest/brightest for meeting or exceeding goal. This keeps a 20-minute goal and a 4-hour goal equally satisfying to fill in.
- **Aggregation**: heatmap is not divided by subject — any completed session updates the day's cell.
- **Gradient**: intended as a true multi-step gradient (roughly 5–6 visible levels) rather than a binary met/not-met, so a full year reads with real texture.
- **Persistence**: intended to be permanent — this is the "forever" record the whole concept is built around.

### 4.3 Variable milestone (badges)

- **Mechanic**: tiered badges, level determined by cumulative time spent in the app.
- **Note on terminology**: this is technically a *predictable* reward system (RPG-style leveling), not a true variable reward (which depends on unpredictability, closer to a slot-machine mechanic). Decision was made to keep it as tiered/predictable — lower ethical risk, easier to explain to users — rather than add true randomized rewards.

### 4.4 Immediate feedback

- **Original design (full version, deferred with streak)**: streak increase (10% threshold met) triggers a Duolingo-style animation.
- **Phase 1 design (no streak counter)**: a three-tier hierarchy, scaled so reward size matches how rare the moment is:
  1. **Every session saved** — the heatmap cell fills/deepens immediately on save. Baseline payoff, happens every time.
  2. **Daily goal met** — a distinct "goal complete" animation. Happens at most once a day.
  3. **Badge milestone crossed** — full unlock animation. Rarest, biggest celebration.
- Session totals (today's time, lifetime total) update and tick upward on save regardless of tier.
- The heatmap itself doubles as the de facto streak signal in phase 1 — an unbroken run of filled cells creates a similar "don't leave a gap" pull to a streak counter, without the passes/timezone/freeze logic.

### 4.5 Social leaderboard — deferred to phase 2

- **Mechanic**: friends-only, invite-based. Compares study time and streaks among invited friends — not a global leaderboard.
- **Reasoning**: global leaderboards tend to demotivate via upward comparison against unrelatable strangers, and increase incentive to fake numbers competitively. Friends-only was chosen specifically to avoid both problems.
- **Anti-gaming stance for v1**: no idle-detection or foreground-tracking planned initially — the friends-only scope already reduces the incentive to game it. Revisit only if real gaming behavior shows up.

## 4.6 Platform & tech stack — decided

- **Phase 1: Web app / PWA.** Fastest path for a solo build, no app-store review delay, fits the share-a-link referral loop better than a download. Core loop (timer, heatmap, badges, immediate feedback) is achievable as pure frontend + a lightweight backend for session storage — no native code required.
- **Phase 2: Cross-platform mobile (React Native or Flutter), once the phase 1 loop is validated.** This is where streak (with reliable notifications and background/foreground detection) and the social leaderboard are picked back up, along with a home-screen widget for one-tap start.
- **Reasoning for staging rather than picking once**: web is weaker specifically for background/foreground detection, push notifications, and widgets — all of which streak and "one tap to start" depend on. Rather than over-build for a platform before the psychology is validated with real users, ship the leaner web loop first.

**Phase 1 stack:**
- **Frontend/backend**: Next.js (React) + TypeScript — frontend and API routes in one framework, minimizes moving parts for a solo build.
- **Styling**: Tailwind CSS — fast to build with, no fighting a component library's default look against the custom amber-glow dark theme already designed.
- **Database + auth**: Supabase (Postgres + built-in auth) — avoids building login/signup from scratch; Postgres handles the heatmap's "sum minutes grouped by day" queries naturally. **Auth methods**: both email/password and Google sign-in, enabled together on the same project — Supabase supports multiple providers natively. Account-linking settings need deliberate configuration so the same email via Google vs. email/password doesn't create two separate accounts.
- **Animation**: Motion (formerly Framer Motion), imported as `motion/react` — powers the three-tier feedback hierarchy (cell fill, goal-met pulse, badge unlock). Chosen over lighter alternatives (Motion One, AutoAnimate) because layout animations, `AnimatePresence` exit transitions, and gesture support are needed for those specific moments; ~30kB gzipped is negligible next to images/fonts the app loads anyway. Open source, MIT license, no Framer subscription required. Includes a `useReducedMotion` hook for accessibility.
- **Heatmap & timer**: hand-built, not a library — a working version already exists from earlier prototyping; a pre-made heatmap library would fight the custom goal-relative color scheme.
- **Hosting**: Vercel — zero-config deploys for Next.js, pairs with Supabase's free tier, realistic to run phase 1 at $0/month pre-launch.
- **Forward-compatibility note**: if phase 2 moves to React Native, the Supabase backend and data layer carry over largely untouched — only the UI layer gets rebuilt.

## 5. Growth & monetization

**Sequencing**: none of this ships with the initial build. Core loop (timer, heatmap, badges, feedback) gets built and validated first — see section 15's build sequence, where monetization now sits as its own later stage rather than bundled in. This also resolves an earlier inconsistency: the "watch an ad to earn a streak pass" mechanic below depends on streak, which is itself a phase 2 feature — it can't exist before streak does, so it's correctly grouped with phase 2+ work now rather than implied as day-one.

- **Model**: free to use. No paywall in front of the core habit loop — charging students to protect their own streak was identified as damaging to trust in this category.
- **Revenue paths under consideration**:
  - Lightweight ads
  - Opt-in "watch an ad to earn a streak pass" mechanic (phase 2+, depends on streak existing)
  - *Caution noted*: this still monetizes loss aversion, just via attention instead of money — less bad than a paywall, but the same underlying pattern. Worth being a deliberate choice, not a default.
- **Growth loop**: referral/invite system (share the app, invite friends to compare streaks) — doubles as both a growth mechanism and the unlock for the friends leaderboard. Also deferred past initial build; see section 15.

## 6. Design values

- The app should feel like it's **rooting for the user**, not watching them. Every mechanic above (streak, passes, leaderboard) can be built either encouragingly or punitively — tone, copy, and how a missed day is framed determines which.
- A bad day should read as a gap, not a failure — hence streak passes and earned (not purchased) recovery.
- No dark-pattern monetization of failure (no pay-to-restore).

## 7. Market context

Industry estimates for the global student productivity app market vary by research firm — a useful signal of *direction*, not a precise figure:

- ~$6.4B (2024) → ~$19.4B (2033), 13.2% CAGR — one estimate
- ~$5.8B (2024) → ~$18.1B (2033), 13.7% CAGR — another estimate
- ~$7B specifically for 2026 — a third estimate

Direction is consistent across sources: double-digit growth, no dominant player has claimed the "habit visualization for studying" niche specifically. Treat any single number as directional, not authoritative — these reports disagree meaningfully with each other.

## 8. MVP scope: phase 1 (web) vs phase 2 (mobile) vs later

**Phase 1 — web app, ships first:**
- Timer (start/pause/resume/stop-save)
- Session log (date, duration, subject optional)
- Heatmap (goal-relative color) — doubles as the de facto streak signal in this phase
- Variable milestone badges (tiered, based on cumulative time)
- Immediate feedback, three-tier hierarchy (session save → daily goal met → badge unlock)
- Basic stats (total time, sessions logged)

**Phase 2 — cross-platform mobile, once phase 1 loop is validated:**
- Streak counter + TikTok-style passes + earn-back recovery
- Social leaderboard (friends-only, invite-based)
- Push notifications for streak reminders
- Home-screen widget for one-tap start

**Explicitly deferred beyond phase 2 (do not build until the loop above is validated):**
- Manual backfill of past sessions
- Per-subject color-coded heatmap
- Weekly/monthly summary views
- Data export
- Multi-device account sync
- Pomodoro mode
- Goal progress rings beyond the heatmap itself
- True variable-reward mechanics (as opposed to tiered badges)
- Leaderboard anti-cheat tooling (idle/foreground detection)

## 8.5 Phase 1 success metric

The pitch's original success measure ("unbroken streak at 60 days") no longer applies — streak was deferred to phase 2 after that was written, so phase 1 (timer + heatmap + badges + feedback) has no streak counter to measure.

**Replacement metric**: % of new users with at least 5 filled-in heatmap days within their first two weeks. Checked weekly once real users exist. Closest available analog to the original streak-based measure, but derived from the heatmap instead of a counter that doesn't exist yet in phase 1.

**Small-sample caveat**: with a low user count (roughly under ~50 users), this percentage is noisy — a single user swings it by several points, so it shouldn't be treated as meaningful signal that early. Below that threshold, direct conversation with users ("why did you stop after day 2?") is more reliable than the number itself. The percentage becomes genuinely useful as a trend once the user base is larger.

**Streak note**: current plan is to build the phase 1 loop first, then bring streak back into the *web app itself* rather than necessarily waiting for a phase 2 mobile rebuild. Worth knowing going in: streak was originally deferred partly because push notifications and background/foreground detection are more reliable on mobile — if streak ships on web first, it'll be a weaker version (no reliable push reminder before a streak is lost) than the mobile-native version originally envisioned in section 4.1.

## 9. Competitive positioning

**Direct competitors (study/focus timers):**
- **Forest** — strongest gamification, but generic (not study-specific) and no persistent history; the tree resets each session, nothing accumulates into a long-term visual record.
- **Session** — clean, minimal, category-based tracking. No gamification layer at all.
- **Athenify** — closest existing analog: study-specific, live timer, streaks, dashboard charts. Missing piece: charts are conventional (donut/bar/spider), not a GitHub-style contribution grid.
- **Focus To-Do** — Pomodoro-based, ties sessions to tasks, generates reports. Reports are backward-looking summaries, not a living on-screen visual.
- **Toggl Track** — powerful generic time tracking, zero gamification, zero study framing.

**Habit/heatmap tools (adjacent, not study timers):**
- **HabitHeat / Streakly** — have the GitHub-style grid, the closest match to Chronostudy's core visual, but general-purpose habit trackers with manual logging — no live timer, no goal-relative coloring.

**Proof-points, not competitors:** Duolingo (streak/loss-aversion at scale), GitHub (contribution grid as pride/retention mechanic), WakaTime (automatic time-tracking + heatmap, for code not study). Each validates one piece of the mechanic independently, none combine them for studying.

**The gap:**

| | Study-specific | Live timer | GitHub-style heatmap | Goal-relative color | Badges | Friends |
|---|---|---|---|---|---|---|
| Forest | No | Yes | No | No | Partial | Limited |
| Session | Partial | Yes | No | No | No | No |
| Athenify | Yes | Yes | No (charts) | No | No | No |
| Focus To-Do | Partial | Yes | No | No | No | No |
| Toggl Track | No | Yes | No | No | No | No |
| HabitHeat/Streakly | No | No | Yes | No | No | Some |
| **Chronostudy** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Phase 2** |

No competitor combines more than 2–3 of these at once. The two closest — Athenify (study-specific + timer, no heatmap) and HabitHeat (heatmap, no timer or study focus) — are each missing exactly what the other has. That's the actual whitespace.

## 10. Open questions still to resolve

- **Screen & navigation map** — layout structure decided (single scrolling page, top bar with nickname/badge/settings, timer → stats → heatmap → recent sessions); full wireframe with real styling not yet built.
- **Monetization specifics** — ad placement/frequency, referral reward structure not yet detailed.

## 11. Data model (phase 1)

Tables live in Supabase/Postgres. `sessions` is the single source of truth — heatmap, stats, and badge progress are all computed from it via queries rather than stored redundantly, to avoid sync bugs between a stored total and the sessions that should add up to it.

**`profiles`** (extends Supabase's built-in `auth.users`)
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK, FK → auth.users) | |
| display_name | text | |
| daily_goal_minutes | int | current goal |
| created_at | timestamptz | |

**`sessions`**
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK → profiles.id) | |
| session_date | date | the day it counts toward, in the user's local timezone |
| duration_seconds | int | |
| subject | text, nullable | optional tag |
| goal_minutes_at_time | int | snapshot of the user's goal when saved — prevents a later goal change from silently rewriting past heatmap colors |
| created_at | timestamptz | actual save time, for ordering "recent sessions" |

**`badges`** (reference data — may start as a hardcoded array in code rather than a real table until badges need to be added without a redeploy)
| Column | Type | Notes |
|---|---|---|
| id | text (PK) | |
| name | text | |
| threshold_minutes | int | cumulative time required to unlock |
| tier | int | for ordering/display |

**`user_badges`** (join table, so the unlock animation only fires once per badge)
| Column | Type | Notes |
|---|---|---|
| user_id | uuid (FK) | |
| badge_id | text (FK) | |
| unlocked_at | timestamptz | |

## 13. Onboarding & goal-setting flow

Six screens, no tutorial/summary screen — straight from sign-up into the first timer session.

| # | Screen | Type | Content |
|---|---|---|---|
| 1 | Welcome | Static | Title/tagline, no input |
| 2 | "What are you using Chronostudy for?" | Single-select, tap-only | Exam prep / Coursework / Personal learning / Professional certification / Language learning / Other |
| 3 | "Where are you starting from?" | Single-select, tap-only | Already study consistently / Building a new habit / Getting back into it after a break |
| 4 | "What's your daily study goal?" | Preset buttons | 30 min / 1 hr (marked "Recommended") / 2 hr / 4 hr |
| 5 | "What should we call you?" | Text input, skippable | Auto-generates a placeholder display name if skipped; editable later in settings |
| 6 | Transition | Static, momentary | "You're set — let's log your first session," then lands directly on the timer |

**Design decisions behind the ordering:**
- **Tap-only screens (2–4) come before the typing screen (5)**, not interleaved — typing has the highest drop-off rate of any onboarding action, so it's placed last, after momentum is already built, and made skippable rather than required.
- **Goal-setting (screen 4) comes after purpose and habit-context**, not first — answering a couple of easy questions about themselves first tends to make people more deliberate about the goal number they pick, rather than tapping the first option just to get through a form.
- **A progress indicator** (e.g. "Step 2 of 4" or dots) should appear on screens 2–5, since not knowing how much is left is a known cause of mid-flow abandonment.
- **One preset is pre-highlighted as "Recommended"** (1 hr) on the goal screen rather than presenting four flat, equally-weighted options — reduces decision paralysis while remaining fully overridable.
- **A one-line transition (screen 6)** gives a sense of completion before dropping into the real app, rather than an abrupt handoff straight from the goal screen.

**Data note**: the goal answer (screen 4) writes directly to `profiles.daily_goal_minutes`, and the display name (screen 5) writes to `profiles.display_name` — both already exist in the phase 1 schema. The purpose and habit-context answers (screens 2–3) are **not currently stored** anywhere in the schema; as designed, they only shape in-the-moment onboarding copy/tone. If personalization needs to persist past onboarding (e.g. tailoring future messaging by purpose), add columns to `profiles` for them later — not needed for phase 1 as scoped.

## 14. Roadmap for planning (updated)

## 15. Phase 1 build sequence

**Stage 1 — Foundation**
1. Next.js + TypeScript scaffold, Tailwind config, Vercel deploy pipeline
2. Supabase project setup, create the four tables from section 11

**Stage 2 — Auth & onboarding**
3. Auth — email/password and Google sign-in, both enabled (see section 4.6)
4. The 6-screen onboarding flow — writes to `daily_goal_minutes` and `display_name`

**Stage 3 — The core loop**
5. Timer component (circular radial dial, see section 4.0)
6. Session save logic — wires "stop & save" to the `sessions` table, applies the 5-minute minimum rule
7. Heatmap — queries sessions, computes goal-relative color per day
8. Stats row (total time, today's progress)
9. Session log (3 recent + expand to past week, see section 4.0)

**Stage 4 — Retention layer**
10. Badges — unlock detection, display next to nickname
11. Three-tier feedback animations (Motion) — cell fill, goal-met pulse, badge unlock

**Stage 5 — Polish & ship**
12. Settings modal (edit goal/name)
13. Visual polish pass (amber-glow theme), mobile responsiveness, reduced-motion check
14. Deploy, soft launch

**Stage 6 — Growth & monetization (post-launch, after the core loop is validated)**
15. Referral/invite system
16. Lightweight ads integration
17. Watch-ad-to-earn-pass mechanic — blocked on streak (phase 2), cannot ship before it

## 16. Roadmap for planning (updated)

1. ~~Platform & tech stack~~ — decided, see section 4.6
2. ~~Data model~~ — decided, see section 11
3. ~~Onboarding & goal-setting flow~~ — decided, see section 13
4. ~~Competitive positioning~~ — decided, see section 9
5. ~~Screen & navigation map~~ — decided, see sections 4.0 and 13
6. ~~MVP scope lock + build plan for phase 1~~ — decided, see section 15

All planning-stage items are resolved. Remaining open items are the smaller in-flight details noted in section 10 (monetization specifics) plus whatever comes up once building actually starts.
