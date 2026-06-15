import { createUserWithEmailAndPassword, signInWithEmailAndPassword as firebaseSignIn, signOut as firebaseSignOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseFunctions, firestore } from "./firebaseClient";
import type {
  CalendarEvent,
  Family,
  FamilyData,
  FamilyMember,
  FamilyRequest,
  FamilyRole,
  FamilyUserRole,
  HomeworkItem,
  HomeworkTask,
  LearningRecord,
  LearningSummary,
  MealPlan,
  Payment,
  Place,
  RouteStop,
  ShoppingItem,
} from "./familyDataTypes";

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function familyCollection(familyId: string, name: string) {
  return collection(firestore, "families", familyId, name);
}

function familyDoc(familyId: string, name: string, id: string) {
  return doc(firestore, "families", familyId, name, id);
}

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) {
  return { id: snapshot.id, ...snapshot.data() } as T;
}

async function getList<T>(familyId: string, name: string, constraints: QueryConstraint[] = []) {
  const ref = familyCollection(familyId, name);
  const snapshot = constraints.length > 0 ? await getDocs(query(ref, ...constraints)) : await getDocs(ref);
  return snapshot.docs.map((item: any) => withId<T>(item));
}

function eventWindowConstraints() {
  return [where("start_at", ">=", daysFromNow(-30)), where("start_at", "<=", daysFromNow(120)), orderBy("start_at", "asc"), limit(300)];
}

function routeWindowConstraints() {
  const start = daysFromNow(-7).slice(0, 10);
  const end = daysFromNow(45).slice(0, 10);
  return [where("stop_date", ">=", start), where("stop_date", "<=", end), orderBy("stop_date", "asc"), orderBy("stop_order", "asc"), limit(250)];
}

export async function getCurrentUser() {
  return firebaseAuth.currentUser;
}

export async function getCurrentFamilyRole(): Promise<FamilyUserRole> {
  const user = firebaseAuth.currentUser;

  if (!user) {
    throw new Error("Not logged in");
  }

  const userSnap = await getDoc(doc(firestore, "users", user.uid));
  const defaultFamilyId = userSnap.data()?.default_family_id as string | undefined;

  if (!defaultFamilyId) {
    throw new Error("This login user is not linked to any family.");
  }

  const memberSnap = await getDoc(doc(firestore, "families", defaultFamilyId, "members", user.uid));
  if (!memberSnap.exists()) {
    throw new Error("This login user is not a member of this family.");
  }

  const member = memberSnap.data() as FamilyMember;

  return {
    id: `${defaultFamilyId}_${user.uid}`,
    family_id: defaultFamilyId,
    auth_user_id: user.uid,
    member_id: user.uid,
    role: member.role as FamilyRole,
  };
}

export async function loadFamilyData(): Promise<FamilyData> {
  const role = await getCurrentFamilyRole();
  const familySnap = await getDoc(doc(firestore, "families", role.family_id));

  if (!familySnap.exists()) {
    throw new Error("Family workspace not found.");
  }

  const [
    members,
    places,
    calendarEvents,
    routeStops,
    homeworkTasks,
    homeworkItems,
    requests,
    payments,
    learningRecords,
    learningSummaries,
    mealPlans,
    shoppingItems,
  ] = await Promise.all([
    getList<FamilyMember>(role.family_id, "members", [orderBy("created_at", "asc"), limit(80)]),
    getList<Place>(role.family_id, "places", [orderBy("created_at", "asc"), limit(120)]),
    getList<CalendarEvent>(role.family_id, "events", eventWindowConstraints()),
    getList<RouteStop>(role.family_id, "route_stops", routeWindowConstraints()),
    getList<HomeworkTask>(role.family_id, "homework_tasks", [orderBy("created_at", "desc"), limit(150)]),
    getList<HomeworkItem>(role.family_id, "homework_items", [orderBy("sort_order", "asc"), limit(500)]),
    getList<FamilyRequest>(role.family_id, "requests", [orderBy("created_at", "desc"), limit(150)]),
    getList<Payment>(role.family_id, "payments", [orderBy("created_at", "desc"), limit(160)]),
    getList<LearningRecord>(role.family_id, "learning_records", [orderBy("lesson_date", "desc"), limit(120)]),
    getList<LearningSummary>(role.family_id, "learning_summaries", [orderBy("created_at", "desc"), limit(50)]),
    getList<MealPlan>(role.family_id, "meal_plans", [orderBy("week_start", "desc"), limit(80)]),
    getList<ShoppingItem>(role.family_id, "shopping_items", [orderBy("created_at", "desc"), limit(150)]),
  ]);

  const itemsByTaskId = new Map<string, HomeworkItem[]>();
  for (const item of homeworkItems) {
    const list = itemsByTaskId.get(item.homework_task_id) ?? [];
    list.push(item);
    itemsByTaskId.set(item.homework_task_id, list);
  }

  return {
    role,
    family: withId<Family>(familySnap),
    members,
    places,
    calendarEvents,
    routeStops,
    homeworkTasks: homeworkTasks.map((task: HomeworkTask) => ({
      ...task,
      homework_items: itemsByTaskId.get(task.id) ?? [],
    })),
    requests,
    payments,
    learningRecords,
    learningSummaries,
    mealPlans,
    shoppingItems,
  };
}

export function subscribeToFamilyChanges(familyId: string, onChange: () => void) {
  // Keep realtime useful but bounded. Firestore bills the initial snapshot reads, so avoid listening to unlimited history.
  const listeners: Array<[string, QueryConstraint[]]> = [
    ["members", [orderBy("created_at", "asc"), limit(80)]],
    ["places", [orderBy("created_at", "asc"), limit(120)]],
    ["events", eventWindowConstraints()],
    ["route_stops", routeWindowConstraints()],
    ["homework_tasks", [orderBy("created_at", "desc"), limit(150)]],
    ["homework_items", [orderBy("sort_order", "asc"), limit(500)]],
    ["requests", [orderBy("created_at", "desc"), limit(150)]],
    ["payments", [orderBy("created_at", "desc"), limit(160)]],
    ["learning_records", [orderBy("lesson_date", "desc"), limit(120)]],
    ["learning_summaries", [orderBy("created_at", "desc"), limit(50)]],
    ["meal_plans", [orderBy("week_start", "desc"), limit(80)]],
    ["shopping_items", [orderBy("created_at", "desc"), limit(150)]],
  ];

  const unsubscribers: Unsubscribe[] = [
    onSnapshot(doc(firestore, "families", familyId), onChange),
    ...listeners.map(([name, constraints]) => onSnapshot(query(familyCollection(familyId, name), ...constraints), onChange)),
  ];

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function signInWithEmailPassword(email: string, password: string) {
  return firebaseSignIn(firebaseAuth, email.trim(), password);
}

export async function signOut() {
  await firebaseSignOut(firebaseAuth);
}

export type CreateFamilyAccountInput = {
  familyName: string;
  parentDisplayName: string;
  parentEmail: string;
  parentPassword: string;
  stateRegion?: string;
  schoolLevel?: string;
  timezone?: string;
};

export async function createFamilyAccount(input: CreateFamilyAccountInput) {
  const credential = await createUserWithEmailAndPassword(
    firebaseAuth,
    input.parentEmail.trim(),
    input.parentPassword,
  );

  const uid = credential.user.uid;
  const familyRef = doc(collection(firestore, "families"));
  const memberRef = doc(firestore, "families", familyRef.id, "members", uid);
  const userRef = doc(firestore, "users", uid);
  const createdAt = nowIso();

  const family: Family = {
    id: familyRef.id,
    name: input.familyName.trim(),
    timezone: input.timezone ?? "Australia/Adelaide",
    state_region: input.stateRegion ?? "SA",
    school_level: input.schoolLevel ?? "primary",
    school_week1_start: null,
  };

  const member: FamilyMember = {
    id: uid,
    family_id: familyRef.id,
    auth_user_id: uid,
    display_name: input.parentDisplayName.trim(),
    role: "parent",
    color: "#31535c",
    avatar_url: null,
    default_navigation_app: null,
    can_login: true,
    email: input.parentEmail.trim(),
  };

  const batch = writeBatch(firestore);
  batch.set(familyRef, {
    ...family,
    created_by: uid,
    created_at: createdAt,
    updated_at: createdAt,
  });
  batch.set(memberRef, {
    ...member,
    created_at: createdAt,
    updated_at: createdAt,
  });
  batch.set(userRef, {
    uid,
    email: input.parentEmail.trim(),
    display_name: input.parentDisplayName.trim(),
    default_family_id: familyRef.id,
    created_at: createdAt,
    updated_at: createdAt,
  });
  await batch.commit();

  return { family, member, user: credential.user };
}

export async function createMember(input: {
  familyId: string;
  displayName: string;
  role: FamilyRole;
  color?: string | null;
  defaultNavigationApp?: string | null;
}) {
  const memberRef = doc(collection(firestore, "families", input.familyId, "members"));
  const createdAt = nowIso();
  const member: FamilyMember = {
    id: memberRef.id,
    family_id: input.familyId,
    auth_user_id: null,
    display_name: input.displayName.trim(),
    role: input.role,
    color: input.color ?? null,
    avatar_url: null,
    default_navigation_app: input.defaultNavigationApp ?? null,
    can_login: false,
  };

  await setDoc(memberRef, { ...member, created_at: createdAt, updated_at: createdAt });
  return member;
}

export async function updateMember(input: {
  familyId: string;
  memberId: string;
  displayName: string;
  role: FamilyRole;
  color?: string | null;
  defaultNavigationApp?: string | null;
}) {
  await updateDoc(familyDoc(input.familyId, "members", input.memberId), {
    display_name: input.displayName.trim(),
    role: input.role,
    color: input.color ?? null,
    default_navigation_app: input.defaultNavigationApp ?? null,
    updated_at: nowIso(),
  });
}

export async function deleteMember(input: { familyId: string; memberId: string }) {
  const currentUser = firebaseAuth.currentUser;
  if (currentUser?.uid === input.memberId) {
    throw new Error("You cannot remove your own parent account from the app.");
  }
  await deleteDoc(familyDoc(input.familyId, "members", input.memberId));
}

export type CreateMemberLoginInput = {
  familyId: string;
  memberId?: string | null;
  displayName: string;
  role: FamilyRole;
  email: string;
  password: string;
  color?: string | null;
  defaultNavigationApp?: string | null;
};

export async function createMemberLogin(input: CreateMemberLoginInput) {
  const fn = httpsCallable<CreateMemberLoginInput, { uid: string; member_id: string }>(firebaseFunctions, "createMemberLogin");
  const result = await fn({
    ...input,
    email: input.email.trim(),
    displayName: input.displayName.trim(),
  });
  return result.data;
}
