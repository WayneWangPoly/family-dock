import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { firestore } from "./firebaseClient";

export type LearningNote = { id: string; family_id: string; child_id: string | null; created_by: string | null; subject: string | null; title: string; content: string; tags: string[]; note_date: string; note_type: string; created_at: string; };
export type MealPlan = { id: string; family_id: string; created_by: string | null; week_start: string | null; meal_type: string; title: string; preferences: string[]; notes: string | null; status: string; created_at: string; };
export type MealPlanItem = { id: string; family_id: string; meal_plan_id: string; day_label: string | null; meal_slot: string; title: string; description: string | null; sort_order: number; };
export type ShoppingListItem = { id: string; family_id: string; meal_plan_id: string | null; name: string; quantity: string | null; category: string | null; is_checked: boolean; sort_order: number; };
export type AIRouteReview = { id: string; family_id: string; created_by: string | null; review_date: string | null; focus: string; question: string; analysis: string; risk_level: string; recommendations: string[]; created_at: string; };

function familyCollection(familyId: string, name: string) {
  return collection(firestore, "families", familyId, name);
}

function withId<T>(snapshot: { id: string; data: () => Record<string, unknown> }) {
  return { id: snapshot.id, ...snapshot.data() } as T;
}

export async function loadRecentLearningNotes(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "learning_notes"), orderBy("created_at", "desc"), limit(12)));
  return snap.docs.map((docSnap) => withId<LearningNote>(docSnap));
}

export async function loadRecentMealPlans(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "meal_plans"), orderBy("created_at", "desc"), limit(6)));
  return snap.docs.map((docSnap) => withId<MealPlan>(docSnap));
}

export async function loadMealPlanItems(familyId: string, planIds: string[]) {
  if (planIds.length === 0) return [];
  const snap = await getDocs(query(familyCollection(familyId, "meal_plan_items"), where("meal_plan_id", "in", planIds.slice(0, 10)), orderBy("sort_order", "asc")));
  return snap.docs.map((docSnap) => withId<MealPlanItem>(docSnap));
}

export async function loadShoppingListItems(familyId: string, planIds: string[]) {
  if (planIds.length === 0) return [];
  const snap = await getDocs(query(familyCollection(familyId, "shopping_list_items"), where("meal_plan_id", "in", planIds.slice(0, 10)), orderBy("sort_order", "asc")));
  return snap.docs.map((docSnap) => withId<ShoppingListItem>(docSnap));
}

export async function loadRecentRouteReviews(familyId: string) {
  const snap = await getDocs(query(familyCollection(familyId, "ai_route_reviews"), orderBy("created_at", "desc"), limit(8)));
  return snap.docs.map((docSnap) => withId<AIRouteReview>(docSnap));
}
