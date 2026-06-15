# Step 7.17 True Push Notifications

## Architecture

```text
Browser/PWA
→ registers public/fd-sw.js
→ subscribes via PushManager using VAPID public key
→ saves subscription to Supabase via Edge Function
→ Edge Function sends web push using VAPID private key
→ service worker receives push
→ notification opens app
```

## Tables

### push_subscriptions

Stores:
- endpoint
- p256dh
- auth
- family_id
- auth_user_id
- member_id
- active status

### notification_logs

Stores:
- sent/failed/skipped status
- title/body
- source table/source id
- dedupe key
- error message

## Edge Functions

### save-push-subscription

Authenticated user function. Saves or deactivates current device subscription.

### send-family-reminders

Parent/guardian or cron-secret function. Sends:
- manual test push
- due reminder push

## Current reminder rules

- Events within 60 minutes
- Homework due within 24 hours
- Unpaid payments due within 3 days

## Cron-ready

For cron invocation, call `send-family-reminders` with:

```text
x-cron-secret: CRON_SECRET
```

Body:

```json
{
  "family_id": "...",
  "mode": "due_reminders"
}
```

## Next recommended step

Step 7.18:
- create scheduled reminder runner
- notification inbox UI
- device management UI
- DB-backed notification preferences
