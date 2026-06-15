import type { ReactNode } from "react";

type PanelCardProps = {
  children: ReactNode;
  soft?: boolean;
  raised?: boolean;
};

export function PanelCard({ children, soft, raised }: PanelCardProps) {
  return <section className={`fd-card ${soft ? "soft" : ""} ${raised ? "raised" : ""}`}>{children}</section>;
}

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function SectionTitle({ title, subtitle, right }: SectionTitleProps) {
  return (
    <header className="fd-section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <div className="fd-section-subtitle">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone?: "default" | "warning" | "success" | "danger" | "info";
}) {
  return <span className={`fd-badge ${tone && tone !== "default" ? tone : ""}`}>{label}</span>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="fd-empty">{text}</div>;
}
