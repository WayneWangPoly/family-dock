# Step 7.9 Member Accounts

## Why

Manually creating Supabase Auth users and binding `family_user_roles` is error-prone.

This package adds a parent-only account manager.

## Flow

```text
Parent opens People
→ selects child/homestay member
→ enters email + temporary password
→ Edge Function creates/updates Auth user
→ binds family_user_roles
→ updates family_members
→ child/homestay can login
```

## Production considerations

Later you may add:
- password reset email
- account disabled switch
- audit log
- stricter storage policies by member
- role-specific RLS so children only see their own data
