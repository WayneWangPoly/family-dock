# Step 7.10 Invite-based Self Registration

## Security model

Self-registration is public, but it requires a valid unused invite code.

Invite code points to:
- family_id
- member_id
- intended_role
- expiry

Only parent/guardian can generate invite codes.

## Why not store passwords in database

The child/homestay password is only sent to the Edge Function, which immediately creates a Supabase Auth user. It is never stored in a public table.

## Later improvements

- QR invite links
- resend invitation
- parent approval queue
- disable account
- reset password
- stricter RLS for child/homestay data
