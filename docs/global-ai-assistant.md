# Global AI Assistant UI

## Purpose

Family Dock has many modules. Parents should not need to learn all menus.

This component makes AI the universal entry point.

## Flow

```text
Parent speaks/types
→ parseFamilyCommand()
→ AI returns draft actions
→ parent reviews fields
→ commitFamilyActions()
→ family data refreshes
→ undo toast appears
```

## Supported review cards

- Calendar event
- Homework task
- Request
- Payment
- Meal / recipe
- Learning record

## UX rule

AI never directly writes data before parent confirmation.

## Recommended next improvements

- Make `ai-commit-actions` return `action_log_id` for each committed action.
- Show multi-action undo list.
- Add better natural-language date correction UI.
- Integrate with the polished app layout instead of debug page.
