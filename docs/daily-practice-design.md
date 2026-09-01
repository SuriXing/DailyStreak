# Daily Practice Design — Research Summary and Implementation Notes

> This document distills the mechanism research across industry-leading products (desktop research, 2026-08, 40+ products) into the daily practice design decisions behind DailyStreak. Sources at the bottom.

## 1. Daily Question Volume

| Source | Daily volume | Session length |
|---|---|---|
| Duolingo | 5-8 questions per lesson, one lesson counts as the check-in | 3-5 min |
| Khan Academy | 4-7 questions per exercise, 5+ per quiz | ~10 min |
| Baicizhan / Maimemo / Bubudanci | floor of 3, default 5-10 | 3-10 min sweet spot; over an hour loses users |
| Babbel / Busuu | ~10 minutes per day | 5-10 min |

**Decision: 5 questions per day by default (~4-6 min), a floor of 3, and 3/5/10 tiers (`useDailyGoal`).** AP questions cost 30-60 seconds of thought each, above the 3-5 seconds of vocabulary questions, so the volume stays below the vocabulary apps' 20 words a day.

## 2. New : Review = 1:2, Review-First, Dynamic Allocation

- Review scheduling: a simplified SRS ladder of `1/3/7/14` days — consecutive correct answers double the interval, a miss resets to 1 day
- Session building (`buildSessionPlan`): due reviews come first (capped at 3), then new items fill up to the daily goal; heavy review backlog automatically reduces new items (Maimemo-style dynamic allocation against the review snowball)
- Overdue reviews are never punished or force-cleared: coming back after a break only faces today's volume
- References: Khan's Mastery Challenge formula of 6 questions over 3 skills; Shanbay's review cap; Anki/FSRS desired retention of 90% as the default sweet spot, without importing the full algorithm

## 3. Check-In and Practice: Two-Layer Design

- **Light check-in**: one tap keeps the streak alive (3 seconds, Duolingo's minimum viable unit)
- **Practice completion**: finishing the daily goal upgrades the calendar cell from light green checked-in to deep green completed (two-state heat map)
- Safety: the streak rule already counts through yesterday; freeze and repair items are left for a later iteration
- Explicitly not doing: Habitica-style health-penalty punishment, Snapchat-style 24-hour hard breaks, or hearts/energy gating (Duolingo itself moved from Hearts to a non-punitive Energy system in 2025)

## 4. Progress Evidence (motivation decay accounts for 40% of edtech churn)

- Skill mastery (simplified Khan 100-point ladder): 1 consecutive correct = familiar 50, 2 = proficient 80, 3+ = mastered 100; a miss resets. Aggregated per skill (`computeMastery`)
- Every session ends with a summary card: accuracy, mastery delta, and what tomorrow's review will lead with
- Milestone badges (7/30/90 days) are a later iteration; no multi-currency, multi-tier badge system

## 5. Notifications (later iteration)

- User-chosen reminder time plus an evening "streak at risk" message in loss framing (Duolingo's highest-converting lever)
- Restrained default frequency (1-3 per day), with a retention-minded opt-out flow

## Research Sources (selected)

- Duolingo: official blog "The habit-building research behind your Duolingo streak", Lenny's Podcast (Jackson Shuttleworth), The Verge "Duolingo is replacing hearts with energy"
- Khan Academy: official help center (Mastery levels / Mastery Challenges / Streaks), official blog "Get Motivated to Learn with Streaks and Levels"
- Vocabulary apps: Maimemo official help (dynamic daily volume), smzdm review-debt field report, Anki source defaults (20 new / 200 review), Babbel's official 10-minutes-a-day article
- Habit products: Apple activity rings psychology, GitHub contribution graph loss aversion, Streaks minimum viable action
- Retention data: RetentionCheck (edtech monthly churn 10.5%, motivation decay 40%)

## Implementation Files

- `src/lib/answers.ts` — SRS state, session building, mastery computation
- `src/hooks/use-daily-goal.ts` — daily volume tiers (3/5/10)
- `src/app/(tabs)/study.tsx` — session-based practice (review-first) with summary card
- `src/app/(tabs)/index.tsx` — daily progress bar and two-state calendar
- `src/app/(tabs)/profile.tsx` — course mastery and goal tiers
- `supabase/schema.sql` — the `answers` table (RLS)
