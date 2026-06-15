# Step 1.2 Frontend Supabase Connection

## Goal

Confirm that your frontend can:

1. Sign in with Supabase Auth.
2. Find the current user's family via `family_user_roles`.
3. Load real family data from Supabase.
4. Subscribe to Realtime changes.
5. Display counts and sample records.

## Why this step matters

Before building AI commit actions, you need to prove the basic read path works:

```text
Auth user
→ family_user_roles
→ family_id
→ family data
→ frontend state
```

If this path is broken, AI and Realtime will be hard to debug later.

## Realtime behavior

`subscribeToFamilyChanges()` subscribes to key tables and refetches all family data when something changes.

This is not the most optimized approach, but it is the safest first version. Later you can optimize per-table updates.

## Tables loaded

- `family_members`
- `places`
- `calendar_events`
- `route_stops`
- `homework_tasks`
- `homework_items`
- `requests`
- `payments`
- `learning_records`
- `meal_plans`
- `shopping_items`

## Troubleshooting

### Error: Not logged in

You are not signed into Supabase Auth.

### Error: This login user is not linked to any family

Your `auth.users` account exists, but `family_user_roles` does not link it to a family.

Fix with the seed file or manually insert:

```sql
insert into public.family_user_roles (family_id, auth_user_id, member_id, role)
values ('...', '...', '...', 'parent');
```

### RLS blocks data

Check:

```sql
select auth.uid();
```

This works only inside authenticated API contexts, not plain SQL editor.

Use the app login flow to test RLS properly.
