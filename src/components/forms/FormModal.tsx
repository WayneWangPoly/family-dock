import type { CSSProperties, ReactNode } from "react";

type Props = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function FormModal({ title, open, onClose, children }: Props) {
  if (!open) return null;

  return (
    <div className="fd-modal-overlay">
      <div className="fd-modal">
        <header className="fd-modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="fd-icon-button">×</button>
        </header>
        <div className="fd-modal-body">{children}</div>
      </div>
    </div>
  );
}

export const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 13,
  fontWeight: 850,
  color: "#44403c",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 11px",
  borderRadius: 13,
  border: "1px solid var(--fd-border-strong)",
  boxSizing: "border-box",
  font: "inherit",
  background: "white",
};

export const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

export const buttonStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 13,
  border: "1px solid var(--fd-border-strong)",
  background: "white",
  color: "var(--fd-brand)",
  fontWeight: 900,
  cursor: "pointer",
};

export const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(135deg, var(--fd-brand), var(--fd-brand-2))",
  color: "white",
  border: "1px solid var(--fd-brand)",
};
