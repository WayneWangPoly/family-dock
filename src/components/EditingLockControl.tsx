import { useEditingLock } from "../hooks/useEditingLock";

type EditingLockControlProps = {
  familyId: string;
  targetTable: string;
  targetId: string;
};

export function EditingLockControl({
  familyId,
  targetTable,
  targetId,
}: EditingLockControlProps) {
  const lock = useEditingLock({
    familyId,
    targetTable,
    targetId,
  });

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: 14,
        background: lock.isLockedByOther ? "#fff7ed" : "#f8fafc",
        border: "1px solid #e5e7eb",
      }}
    >
      {lock.isLockedByOther && (
        <strong style={{ color: "#c2410c" }}>
          {lock.lockedByName ?? "Someone"} is editing
        </strong>
      )}

      {lock.isLockedByMe && (
        <strong style={{ color: "#047857" }}>You are editing</strong>
      )}

      {!lock.isLockedByMe && (
        <button
          disabled={lock.busy || lock.isLockedByOther}
          onClick={() => lock.acquire()}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: lock.isLockedByOther ? "#eee" : "white",
            cursor: lock.isLockedByOther ? "not-allowed" : "pointer",
          }}
        >
          Start editing
        </button>
      )}

      {lock.isLockedByMe && (
        <button
          disabled={lock.busy}
          onClick={() => lock.release()}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "white",
          }}
        >
          Finish
        </button>
      )}

      {lock.errorMessage && (
        <span style={{ color: "crimson", fontWeight: 700 }}>{lock.errorMessage}</span>
      )}
    </div>
  );
}
