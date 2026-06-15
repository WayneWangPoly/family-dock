# Step 7.23 QA / Health / Audit

The app now has many moving parts: Auth, RLS, Edge Functions, Realtime, Maps, Push, Service Worker, PWA, AI, parent/child/homestay roles, notification preferences and devices.

This step adds an in-app operational QA surface so each patch can be checked quickly before more features are added.

`system-health-check` returns booleans for secrets; it does not expose secret values. It authenticates the caller and checks family membership before returning family-specific data.

Next recommended step: Step 7.24 AI Copilot Upgrade.
