import { useState } from "react";
import { ELD_TABS_CONFIG } from "./ELD_TABS_CONFIG";

export function EldPage() {
  const [activeTab, setActiveTab] = useState("live-duty");
  return (
    <div>
      {ELD_TABS_CONFIG.map((tab) => (
        <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
          {tab.label}
        </button>
      ))}
      <p>{activeTab}</p>
    </div>
  );
}
