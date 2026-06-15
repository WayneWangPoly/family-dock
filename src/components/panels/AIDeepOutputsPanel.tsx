import { useEffect, useMemo, useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import {
  loadMealPlanItems,
  loadRecentLearningNotes,
  loadRecentMealPlans,
  loadRecentRouteReviews,
  loadShoppingListItems,
} from "../../lib/aiDeepOutputs";
import type {
  AIRouteReview,
  LearningNote,
  MealPlan,
  MealPlanItem,
  ShoppingListItem,
} from "../../lib/aiDeepOutputs";
import { getMemberName } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill, EmptyState } from "./shared";
import { useToast } from "../app/ToastProvider";

type Props = {
  data: FamilyData;
};

export function AIDeepOutputsPanel({ data }: Props) {
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [mealItems, setMealItems] = useState<MealPlanItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);
  const [routeReviews, setRouteReviews] = useState<AIRouteReview[]>([]);
  const [loading, setLoading] = useState(false);
  const { showError } = useToast();

  async function refresh() {
    setLoading(true);
    try {
      const [noteRows, mealRows, routeRows] = await Promise.all([
        loadRecentLearningNotes(data.family.id),
        loadRecentMealPlans(data.family.id),
        loadRecentRouteReviews(data.family.id),
      ]);

      setNotes(noteRows);
      setMealPlans(mealRows);
      setRouteReviews(routeRows);

      const planIds = mealRows.map((plan) => plan.id);
      const [items, shopping] = await Promise.all([
        loadMealPlanItems(data.family.id, planIds),
        loadShoppingListItems(data.family.id, planIds),
      ]);

      setMealItems(items);
      setShoppingItems(shopping);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [data.family.id]);

  const itemsByPlan = useMemo(() => {
    const map = new Map<string, MealPlanItem[]>();
    for (const item of mealItems) {
      map.set(item.meal_plan_id, [...(map.get(item.meal_plan_id) ?? []), item]);
    }
    return map;
  }, [mealItems]);

  const shoppingByPlan = useMemo(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of shoppingItems) {
      if (!item.meal_plan_id) continue;
      map.set(item.meal_plan_id, [...(map.get(item.meal_plan_id) ?? []), item]);
    }
    return map;
  }, [shoppingItems]);

  return (
    <div className="fd-grid">
      <PanelCard>
        <SectionTitle
          title="AI learning notebook"
          subtitle="AI 写入的课程/成长笔记"
          right={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill label={`${notes.length} notes`} tone="info" />
              <button onClick={refresh} className="fd-button small">{loading ? "Loading..." : "Refresh"}</button>
            </div>
          }
        />

        {notes.length === 0 ? (
          <EmptyState text="暂无 AI 学习笔记。可以说：记录一下今天击剑课..." />
        ) : (
          <div className="fd-grid">
            {notes.map((note) => (
              <article key={note.id} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{note.title}</strong>
                  <StatusPill label={note.note_type} tone="info" />
                </div>
                <div className="fd-muted">
                  {getMemberName(data, note.child_id)} · {note.subject ?? "general"} · {note.note_date}
                </div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{note.content}</div>
                {note.tags?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {note.tags.map((tag) => <span key={tag} className="fd-badge">{tag}</span>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="AI meal plans"
          subtitle="每周菜单和采购清单"
          right={<StatusPill label={`${mealPlans.length} plans`} tone="info" />}
        />

        {mealPlans.length === 0 ? (
          <EmptyState text="暂无 AI 菜单。可以说：给下周推荐 lunchbox 和晚餐菜单..." />
        ) : (
          <div className="fd-grid">
            {mealPlans.map((plan) => {
              const items = itemsByPlan.get(plan.id) ?? [];
              const shopping = shoppingByPlan.get(plan.id) ?? [];

              return (
                <article key={plan.id} className="fd-card soft">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{plan.title}</strong>
                    <StatusPill label={plan.meal_type} tone="success" />
                    <StatusPill label={plan.status} tone="info" />
                  </div>
                  <div className="fd-muted">Week start: {plan.week_start ?? "not set"}</div>
                  {plan.notes && <div style={{ marginTop: 8 }}>{plan.notes}</div>}

                  {items.length > 0 && (
                    <section style={{ marginTop: 10 }}>
                      <strong>Meals</strong>
                      <div className="fd-grid" style={{ marginTop: 8 }}>
                        {items.map((item) => (
                          <div key={item.id} className="fd-row wrap">
                            <span className="fd-badge">{item.day_label ?? "day"}</span>
                            <div style={{ flex: 1 }}>
                              <strong>{item.title}</strong>
                              <div className="fd-muted">{item.meal_slot} · {item.description ?? ""}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {shopping.length > 0 && (
                    <section style={{ marginTop: 10 }}>
                      <strong>Shopping list</strong>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {shopping.map((item) => (
                          <span key={item.id} className="fd-badge">
                            {item.name}{item.quantity ? ` · ${item.quantity}` : ""}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </PanelCard>

      <PanelCard>
        <SectionTitle
          title="AI route reviews"
          subtitle="AI 对接送路线、冲突和出发风险的分析记录"
          right={<StatusPill label={`${routeReviews.length} reviews`} tone="info" />}
        />

        {routeReviews.length === 0 ? (
          <EmptyState text="暂无 AI 路线分析。可以说：看看今天 5 点后接送安排会不会冲突。" />
        ) : (
          <div className="fd-grid">
            {routeReviews.map((review) => (
              <article key={review.id} className="fd-card soft">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong>{review.question}</strong>
                  <StatusPill
                    label={review.risk_level}
                    tone={review.risk_level === "high" ? "danger" : review.risk_level === "medium" ? "warning" : "info"}
                  />
                  <StatusPill label={review.focus} tone="info" />
                </div>
                <div className="fd-muted">{review.review_date ?? "no date"} · {new Date(review.created_at).toLocaleString("en-AU")}</div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{review.analysis}</div>
                {review.recommendations?.length > 0 && (
                  <ul>
                    {review.recommendations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </PanelCard>
    </div>
  );
}
