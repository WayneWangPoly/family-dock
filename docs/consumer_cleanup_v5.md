# Consumer Cleanup v5

## What changed

- Replaced the Payments table with mobile payment cards. This prevents vertical letter stacking and removes editing-lock UI from normal family use.
- Reworked Family into a simple home list instead of a horizontal capsule strip.
- Promoted Requests and Locations so parent approvals and address management are not hidden.
- Removed Admin tools from the Family UI. Production/QA/release tools should not sit in a normal home app flow.
- Added Add/Edit/Remove location flow through the existing Places table. No new database table is required.
- Updated PlaceFormModal to support editing.
- Added updatePlace/deletePlace mutations.
- Added mobile CSS safeguards for tables and consumer cards.

## Supabase

No new table.
No new migration.
No new Edge Function.

Existing RLS must allow parent/guardian users to update/delete their family places. If delete fails because a place is used by events, edit the place instead.
