import type { FamilyData } from "../../lib/familyDataTypes";
import { getThisWeekMeals, groupShoppingItems } from "../../lib/familyUiHelpers";
import { PanelCard, SectionTitle, StatusPill } from "./shared";

type Props = { data: FamilyData; onRefresh?: () => Promise<unknown> | unknown };

export function MealsPanel({ data }: Props) {
  const meals = getThisWeekMeals(data.mealPlans);
  const shoppingGroups = groupShoppingItems(data.shoppingItems);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      <PanelCard>
        <SectionTitle title="Meal plan" subtitle="Lunch box / dinner / snack" />
        <div style={{ display: "grid", gap: 10 }}>
          {meals.map((meal) => (
            <div key={meal.id} style={rowStyle}>
              <div>
                <strong>{meal.title}</strong>
                <div style={mutedStyle}>
                  week {meal.week_start} · day {meal.day_of_week} · {meal.meal_type}
                </div>
                {meal.notes && <div style={mutedStyle}>{meal.notes}</div>}
              </div>
              <StatusPill label={meal.meal_type} />
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard>
        <SectionTitle title="Shopping list" subtitle="按食材类别汇总" />
        <div style={{ display: "grid", gap: 14 }}>
          {Object.entries(shoppingGroups).map(([category, items]) => (
            <section key={category} style={groupStyle}>
              <strong>{category}</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {items.map((item) => (
                  <div key={item.id} style={shopLineStyle}>
                    <span>{item.status === "bought" ? "✅" : "⬜"}</span>
                    <span>{item.name}</span>
                    <span style={mutedStyle}>{item.quantity ?? ""}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: 12,
  borderRadius: 18,
  background: "#fbf7ef",
};

const groupStyle: React.CSSProperties = {
  padding: 14,
  borderRadius: 18,
  background: "#fbf7ef",
};

const shopLineStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "24px 1fr 90px",
  gap: 8,
  padding: 8,
  borderRadius: 12,
  background: "white",
};

const mutedStyle: React.CSSProperties = {
  color: "#78716c",
  fontSize: 13,
  fontWeight: 650,
  marginTop: 3,
};
