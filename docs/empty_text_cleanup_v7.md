# Family Dock Empty Text Cleanup v7

This patch removes non-actionable placeholder/explanation text from the consumer UI.

## Changed

- Today no longer renders the Daily Brief explanation block.
- Empty Today sections are hidden instead of showing explanatory copy.
- Removed subtitles such as:
  - Your timeline
  - Homework, requests and payments
  - Only the things worth noticing
- Removed Daily Brief "all clear" generated items such as:
  - Today is clear unless new items are added.
  - No overlap or tight-transfer warning in the current planning window.
- Calendar no longer shows the "Checks and reminders" disclosure.
- Calendar still shows schedule conflicts inline only when there is an actual conflict.

## Supabase

No SQL or Edge Function deployment is required.
