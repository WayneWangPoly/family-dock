/*
Patch note:
In src/lib/familyDataApi.ts, add learning_summaries to loadFamilyData().

1. Import LearningSummary type if you added it.

2. Add this Promise item:

selectAll<LearningSummary>("learning_summaries", role.family_id, { column: "created_at", ascending: false }),

3. Return it as:

learningSummaries,

4. Add "learning_summaries" to realtime subscriptions in your realtime table list if not already added.

The UI package works even before this patch, but NotebookPanel can only show saved summaries
after learningSummaries are included in family data.
*/
