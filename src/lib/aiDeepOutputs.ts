import { supabase } from "./supabaseClient";

export type LearningNote = {
  id: string;
  family_id: string;
  child_id: string | null;
  created_by: string | null;
  subject: string | null;
  title: string;
  content: string;
  tags: string[];
  note_date: string;
  note_type: string;
  created_at: string;
};

export type MealPlan = {
  id: string;
  family_id: string;
  created_by: string | null;
  week_start: string | null;
  meal_type: string;
  title: string;
  preferences: string[];
  notes: string | null;
  status: string;
  created_at: string;
};

export type MealPlanItem = {
  id: string;
  family_id: string;
  meal_plan_id: string;
  day_label: string | null;
  meal_slot: string;
  title: string;
  description: string | null;
  sort_order: number;
};

export type ShoppingListItem = {
  id: string;
  family_id: string;
  meal_plan_id: string | null;
  name: string;
  quantity: string | null;
  category: string | null;
  is_checked: boolean;
  sort_order: number;
};

export type AIRouteReview = {
  id: string;
  family_id: string;
  created_by: string | null;
  review_date: string | null;
  focus: string;
  question: string;
  analysis: string;
  risk_level: string;
  recommendations: string[];
  created_at: string;
};

export async function loadRecentLearningNotes(familyId: string) {
  const { data, error } = await supabase
    .from("learning_notes")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;
  return (data ?? []) as LearningNote[];
}

export async function loadRecentMealPlans(familyId: string) {
  const { data, error } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw error;
  return (data ?? []) as MealPlan[];
}

export async function loadMealPlanItems(familyId: string, planIds: string[]) {
  if (planIds.length === 0) return [];

  const { data, error } = await supabase
    .from("meal_plan_items")
    .select("*")
    .eq("family_id", familyId)
    .in("meal_plan_id", planIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MealPlanItem[];
}

export async function loadShoppingListItems(familyId: string, planIds: string[]) {
  if (planIds.length === 0) return [];

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("family_id", familyId)
    .in("meal_plan_id", planIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ShoppingListItem[];
}

export async function loadRecentRouteReviews(familyId: string) {
  const { data, error } = await supabase
    .from("ai_route_reviews")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;
  return (data ?? []) as AIRouteReview[];
}
