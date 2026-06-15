import { useState } from "react";
import type { AppTab } from "../app/FamilyDockApp";

type Props = {
  onTabChange: (tab: AppTab) => void;
};

export function MobileQuickActions({ onTabChange }: Props) {
  const [open, setOpen] = useState(false);

  function go(tab: AppTab) {
    onTabChange(tab);
    setOpen(false);
  }

  return (
    <>
      <button className="fd-mobile-fab" onClick={() => setOpen((value) => !value)}>
        {open ? "×" : "+"}
      </button>

      <div className={`fd-quick-sheet ${open ? "open" : ""}`}>
        <div className="fd-quick-grid">
          <button className="fd-quick-action" onClick={() => go("calendar")}>
            Add event<br />
            <span className="fd-muted">课程 / 学校 / 家庭</span>
          </button>
          <button className="fd-quick-action" onClick={() => go("family")}>
            Add homework<br />
            <span className="fd-muted">作业 / 上传</span>
          </button>
          <button className="fd-quick-action" onClick={() => go("family")}>
            Add request<br />
            <span className="fd-muted">孩子 / Homestay</span>
          </button>
          <button className="fd-quick-action" onClick={() => go("family")}>
            Add payment<br />
            <span className="fd-muted">付款 / 记录</span>
          </button>
        </div>
      </div>
    </>
  );
}
