# Step 7.8 Attachments + Child Portal

## Why

Family Dock needs two user experiences:

1. Parent dashboard:
   Full control, payments, scheduling, approvals, AI assistant.

2. Child/Homestay portal:
   Minimal actions only:
   - see my schedule
   - complete homework
   - upload evidence
   - ask parents

## Security note

This package assumes your RLS policies allow family members to insert homework_attachments and requests.

For stricter production use:
- children should only access their own homework/request data
- storage policies should restrict object paths by family_id and member_id
