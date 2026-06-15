# Step 7.11 Bulk Invite + Family Self-Onboarding

## Goal

Avoid platform-admin manual setup when user count grows.

## Scalable flow

```text
Parent self-signs up
→ Family workspace is created
→ Parent bulk imports members
→ System generates invite links
→ Children/Homestay self-register
→ They enter Child Portal
```

## Important security boundary

Children/Homestay cannot self-join arbitrary families. They need an invite code tied to a specific member record.

## Production improvements later

- Email sending
- QR code generation
- invite history table view
- disabled account management
- stricter role-specific RLS
- school/agency admin tenant layer
