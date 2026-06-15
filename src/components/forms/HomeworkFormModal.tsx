import { useState } from "react";
import type { FamilyData } from "../../lib/familyDataTypes";
import { createHomeworkTask } from "../../lib/manualMutations";
import type { HomeworkItemDraft } from "../../lib/manualMutations";
import {
  buttonStyle,
  fieldStyle,
  formGridStyle,
  FormModal,
  inputStyle,
  primaryButtonStyle,
} from "./FormModal";

type Props = {
  open: boolean;
  data: FamilyData;
  onClose: () => void;
  onSaved?: () => Promise<unknown> | unknown;
};

export function HomeworkFormModal({ open, data, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [childId, setChildId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [items, setItems] = useState<HomeworkItemDraft[]>([
    { label: "完成作业", itemType: "checkbox", isRequired: true },
    { label: "上传照片/视频/录音", itemType: "video_upload", isRequired: false },
  ]);
  const [busy, setBusy] = useState(false);

  function updateItem(
    index: number,
    key: keyof HomeworkItemDraft,
    value: string | boolean,
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { label: "新分项", itemType: "checkbox", isRequired: true },
    ]);
  }

  async function submit() {
    if (!title) {
      alert("Title is required.");
      return;
    }

    setBusy(true);

    try {
      await createHomeworkTask({
        familyId: data.family.id,
        childId: childId || null,
        title,
        dueAt: dueAt || null,
        items,
      });

      await onSaved?.();
      onClose();
      setTitle("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormModal title="Add homework" open={open} onClose={onClose}>
      <div style={formGridStyle}>
        <label style={fieldStyle}>
          Title
          <input
            style={inputStyle}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label style={fieldStyle}>
          Child / member
          <select
            style={inputStyle}
            value={childId}
            onChange={(event) => setChildId(event.target.value)}
          >
            <option value="">未指定</option>
            {data.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          Due
          <input
            style={inputStyle}
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </label>

        <strong>Checklist items</strong>

        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 150px 90px",
              gap: 8,
            }}
          >
            <input
              style={inputStyle}
              value={item.label}
              onChange={(event) =>
                updateItem(index, "label", event.target.value)
              }
            />

            <select
              style={inputStyle}
              value={item.itemType}
              onChange={(event) =>
                updateItem(index, "itemType", event.target.value)
              }
            >
              <option value="checkbox">checkbox</option>
              <option value="text">text</option>
              <option value="photo_upload">photo</option>
              <option value="audio_upload">audio</option>
              <option value="video_upload">video</option>
              <option value="parent_approval">parent approval</option>
            </select>

            <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={item.isRequired}
                onChange={(event) =>
                  updateItem(index, "isRequired", event.target.checked)
                }
              />
              Required
            </label>
          </div>
        ))}

        <button style={buttonStyle} onClick={addItem}>
          Add item
        </button>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={buttonStyle} onClick={onClose}>
            Cancel
          </button>
          <button style={primaryButtonStyle} disabled={busy} onClick={submit}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </FormModal>
  );
}
