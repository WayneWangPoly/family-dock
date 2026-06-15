import { getActionMainFields, getAiActionLabel, getFieldLabel, isMissing } from "../lib/aiActionLabels";
import type { AiActionDraft } from "../hooks/useAiCommandFlow";

type Props = {
  action: AiActionDraft;
  index: number;
  onChange: (index: number, key: string, value: unknown) => void;
  onRemove: (index: number) => void;
};

export function AiActionReviewCard({ action, index, onChange, onRemove }: Props) {
  const fields = getActionMainFields(action.type);

  return (
    <section style={cardStyle}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>动作 {index + 1}</div>
          <h3 style={{ margin: 0 }}>{getAiActionLabel(action.type)}</h3>
        </div>
        <button onClick={() => onRemove(index)} style={smallButtonStyle}>删除</button>
      </header>

      <div style={gridStyle}>
        {fields.map((field) => {
          const value = action[field] ?? "";
          const missing = ["title", "amount", "start_date", "start_time", "lesson_title"].includes(field) && isMissing(value);
          return (
            <label key={field} style={labelStyle}>
              {getFieldLabel(field)}
              <input
                value={String(value)}
                onChange={(event) => onChange(index, field, field === "amount" ? Number(event.target.value) : event.target.value)}
                style={{ ...inputStyle, borderColor: missing ? "#fb923c" : "#ddd", background: missing ? "#fff7ed" : "white" }}
              />
            </label>
          );
        })}
      </div>

      {action.type === "create_homework_task" && <HomeworkItemsEditor action={action} index={index} onChange={onChange} />}
      {action.type === "create_meal_or_recipe" && <IngredientsEditor action={action} index={index} onChange={onChange} />}
      {action.type === "create_learning_record" && <ArrayFieldEditor title="不足 / 问题" field="issues" action={action} index={index} onChange={onChange} />}
    </section>
  );
}

function HomeworkItemsEditor({ action, index, onChange }: { action: AiActionDraft; index: number; onChange: (index: number, key: string, value: unknown) => void }) {
  const items = action.homework_items ?? [];
  const updateItem = (i: number, key: string, value: unknown) => {
    onChange(index, "homework_items", items.map((item: any, itemIndex: number) => itemIndex === i ? { ...item, [key]: value } : item));
  };
  const addItem = () => onChange(index, "homework_items", [...items, { label: "新分项", item_type: "checkbox", is_required: true }]);

  return (
    <div style={{ marginTop: 12 }}>
      <strong>作业分项</strong>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 8 }}>
            <input value={item.label ?? ""} onChange={(e) => updateItem(i, "label", e.target.value)} style={inputStyle} />
            <select value={item.item_type ?? "checkbox"} onChange={(e) => updateItem(i, "item_type", e.target.value)} style={inputStyle}>
              <option value="checkbox">勾选</option>
              <option value="text">文字</option>
              <option value="photo_upload">照片</option>
              <option value="audio_upload">录音</option>
              <option value="video_upload">视频</option>
              <option value="parent_approval">家长确认</option>
            </select>
          </div>
        ))}
      </div>
      <button onClick={addItem} style={{ ...smallButtonStyle, marginTop: 8 }}>添加分项</button>
    </div>
  );
}

function IngredientsEditor({ action, index, onChange }: { action: AiActionDraft; index: number; onChange: (index: number, key: string, value: unknown) => void }) {
  const ingredients = action.ingredients ?? [];
  const updateItem = (i: number, key: string, value: unknown) => {
    onChange(index, "ingredients", ingredients.map((item: any, itemIndex: number) => itemIndex === i ? { ...item, [key]: value } : item));
  };
  const addItem = () => onChange(index, "ingredients", [...ingredients, { name: "新食材", quantity: "", category: "" }]);

  return (
    <div style={{ marginTop: 12 }}>
      <strong>采购食材</strong>
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {ingredients.map((item: any, i: number) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px", gap: 8 }}>
            <input value={item.name ?? ""} onChange={(e) => updateItem(i, "name", e.target.value)} style={inputStyle} />
            <input value={item.quantity ?? ""} onChange={(e) => updateItem(i, "quantity", e.target.value)} style={inputStyle} />
            <input value={item.category ?? ""} onChange={(e) => updateItem(i, "category", e.target.value)} style={inputStyle} />
          </div>
        ))}
      </div>
      <button onClick={addItem} style={{ ...smallButtonStyle, marginTop: 8 }}>添加食材</button>
    </div>
  );
}

function ArrayFieldEditor({ title, field, action, index, onChange }: { title: string; field: string; action: AiActionDraft; index: number; onChange: (index: number, key: string, value: unknown) => void }) {
  const value = Array.isArray(action[field]) ? action[field].join("\n") : "";
  return (
    <label style={{ ...labelStyle, marginTop: 12 }}>
      {title}
      <textarea
        value={value}
        onChange={(event) => onChange(index, field, event.target.value.split("\n").map((line) => line.trim()).filter(Boolean))}
        style={{ ...inputStyle, minHeight: 72 }}
      />
    </label>
  );
}

const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 20, padding: 16, background: "white" };
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 12 };
const eyebrowStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 2 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const labelStyle: React.CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 800, color: "#334155" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 12, border: "1px solid #ddd", font: "inherit", boxSizing: "border-box" };
const smallButtonStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 800 };
