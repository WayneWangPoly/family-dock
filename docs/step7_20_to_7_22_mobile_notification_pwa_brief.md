# Step 7.20–7.22 Upgrade Notes

## Why this package

You asked to move several steps ahead. This package focuses on upgrades that reduce real-world failure points on mobile:

- reminders should respect quiet hours
- parent should see unread notification count without digging
- PWA should be installable
- service worker should not only handle push but also provide minimal offline behavior
- Today should explain priorities quickly

## Quiet hours

Quiet hours are enforced in both:

```text
send-family-reminders
run-scheduled-reminders
```

Manual tests bypass quiet hours because they are explicit user-triggered diagnostics.

## Dedupe

The Step 7.18 dedupe model is preserved:

```text
subscription_id + dedupe_key
```

## PWA

The package adds runtime metadata injection through `ensurePwaMetadata()` so the app still works even if `index.html` was not manually edited.

## Daily Brief

This is currently rule-based, not OpenAI-based. That is deliberate:
- fast
- cheap
- works offline from loaded data
- no API latency

A later AI digest can be added on top.
