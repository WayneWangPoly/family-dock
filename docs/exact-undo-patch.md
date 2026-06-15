# Exact Undo Patch

## Why

The previous UI used the newest undoable `action_logs` row after commit. That is unsafe when:

- two parents commit at nearly the same time
- one AI command creates multiple actions
- realtime refresh delays action order

## Fix

`ai-commit-actions` now returns:

```text
action_log_id
```

for each committed action.

The frontend stores those exact IDs and calls `ai-undo-action` against them.

## Remaining production improvement

The commit function still commits actions sequentially. Later, a Postgres RPC can make multi-action commit transactional.
