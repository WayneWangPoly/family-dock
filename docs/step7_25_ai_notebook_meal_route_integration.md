# Step 7.25 AI Deep Integration

## Goal

The AI Copilot should no longer stop at basic records. It should help parents preserve learning observations, plan meals, and reason about route risk.

## New committed action types

### notebook_note

Writes to `learning_notes`.

Designed for:
- lesson comments
- parent observations
- child reflections
- teacher feedback
- AI summaries

### meal_plan

Writes to:
- `meal_plans`
- `meal_plan_items`
- `shopping_list_items`

Designed for:
- weekly dinner plan
- lunchbox plan
- shopping list generation

### route_review

Writes to `ai_route_reviews`.

Designed for:
- route conflict review
- next stop advice
- travel-time risk assessment
- order suggestions

## Safety

The Review → Confirm + commit pattern remains unchanged.

Only parent/guardian can commit.

## Next recommended step

Step 7.26:
- AI weekly/monthly child progress summary
- aggregate learning notes by child/subject/date
- generate weakness/progress/action plan
- export summary for teacher or parent meeting
