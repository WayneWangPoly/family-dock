# Family Dock Firebase Full Overlay Step 1-2

Generated from the uploaded project zip. Includes mobile consumer cleanup through v7 plus Firebase migration core, people/location management, bounded Firestore reads, and Firebase route estimate storage.

Overlay this zip onto your project root. It intentionally does not include .env.local, node_modules, dist, or Supabase .temp files.

Run npm install after overlay because package.json now includes Firebase dependencies.

## Files in this overlay

- `.env.firebase.example`
- `.firebaserc.example`
- `docs/consumer_cleanup_v5.md`
- `docs/consumer_polish_v6.md`
- `docs/empty_text_cleanup_v7.md`
- `docs/firebase_migration_step1_core.md`
- `docs/firebase_migration_step2_people_locations.md`
- `docs/mobile_consumer_refactor_v3.md`
- `docs/mobile_overflow_cleanup_v4.md`
- `firebase.json`
- `firestore.indexes.json`
- `firestore.rules`
- `functions/package.json`
- `functions/src/index.ts`
- `functions/tsconfig.json`
- `package.json`
- `src/App.tsx`
- `src/components/AiUndoToast.tsx`
- `src/components/GlobalAIAssistant.tsx`
- `src/components/app/AppShell.tsx`
- `src/components/app/ChildPortalApp.tsx`
- `src/components/app/FamilyDockApp.tsx`
- `src/components/app/PublicAuthPage.tsx`
- `src/components/forms/AttachmentList.tsx`
- `src/components/forms/HomeworkUploadBox.tsx`
- `src/components/forms/MemberFormModal.tsx`
- `src/components/forms/PlaceFormModal.tsx`
- `src/components/panels/AICopilotPanel.tsx`
- `src/components/panels/CalendarPanel.tsx`
- `src/components/panels/DailyBriefPanel.tsx`
- `src/components/panels/FamilyPanel.tsx`
- `src/components/panels/HomeworkPanel.tsx`
- `src/components/panels/MealsPanel.tsx`
- `src/components/panels/MembersPlacesPanel.tsx`
- `src/components/panels/NotebookPanel.tsx`
- `src/components/panels/PaymentsPanel.tsx`
- `src/components/panels/RequestsPanel.tsx`
- `src/components/panels/RoutePanel.tsx`
- `src/components/panels/SmartRouteDeparturePanel.tsx`
- `src/components/panels/TodayPanel.tsx`
- `src/components/ui/MobileQuickActions.tsx`
- `src/hooks/useAiCommandFlow.ts`
- `src/hooks/useEditingLock.ts`
- `src/hooks/useFamilyData.ts`
- `src/lib/aiCommitActions.ts`
- `src/lib/aiParseCommand.ts`
- `src/lib/dailyBrief.ts`
- `src/lib/familyDataApi.ts`
- `src/lib/familyDataTypes.ts`
- `src/lib/familyMutations.ts`
- `src/lib/familyRealtime.ts`
- `src/lib/firebaseClient.ts`
- `src/lib/homeworkAttachments.ts`
- `src/lib/manualMutations.ts`
- `src/lib/smartRoute.ts`
- `src/lib/supabaseClient.ts`
- `src/styles/fdTheme.css`
- `storage.rules`
