# Step 7.24 AI Copilot Upgrade

## Goal

The app is now feature-rich, but parents will not want to explore every page manually.

The AI tab becomes the main entry point:

```text
say one thing
→ AI understands intent
→ missing info appears
→ parent reviews
→ confirmed actions commit
```

## Planner

`ai-copilot-planner`:
- authenticates user
- checks family membership
- sends compact context to OpenAI
- returns JSON-only plan
- stores `ai_copilot_sessions`

## Commit

`ai-copilot-commit`:
- authenticates user
- checks family membership
- only parent/guardian can commit
- commits safe high-frequency actions
- logs to `ai_copilot_action_logs`

## Why review first

Family operations are high-trust:
- wrong child
- wrong date
- wrong place
- wrong payment
- wrong homework

So the app uses review cards before writing.

## Next recommended step

Step 7.25:
- connect notebook_note to course notebook
- connect meal_plan to meal planner and shopping list
- connect route_review to actual conflict/route engine
- add AI weekly/monthly child progress summary
