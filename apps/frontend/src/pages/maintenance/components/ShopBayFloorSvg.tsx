/**
 * ShopBays.dc.html — per-bay top-down floor graphic (viewBox 0 0 300 330).
 * Occupied vs OPEN BAY geometry from the board; live unit label + status chip only.
 */
import type { CSSProperties } from "react";

const CAB_BY_STATUS: Record<string, string> = {
  in_progress: "#14314F",
  waiting_parts: "#854F0B",
  awaiting_parts: "#854F0B",
  complete: "#475569",
  completed: "#475569",
  open: "#64748B",
};

const TASK_SHORT: Record<string, string> = {
  in_progress: "WRK",
  waiting_parts: "PTS",
  awaiting_parts: "PTS",
  complete: "RDY",
  completed: "RDY",
  open: "IN",
};

type Props = {
  bayNumber: number;
  occupied: boolean;
  unitLabel: string;
  status: string | null;
};

export function ShopBayFloorSvg({ bayNumber, occupied, unitLabel, status }: Props) {
  const cab = CAB_BY_STATUS[status ?? ""] ?? "#14314F";
  const taskColor = cab;
  const taskShort = TASK_SHORT[status ?? ""] ?? "WO";
  const unit = (unitLabel || "—").slice(0, 8);
  const aria = occupied ? `Bay ${bayNumber} · ${unitLabel}` : `Bay ${bayNumber} · open`;

  return (
    <svg
      width="100%"
      viewBox="0 0 300 330"
      role="img"
      aria-label={aria}
      data-testid={`shop-bay-floor-${bayNumber}`}
      style={{ display: "block" } satisfies CSSProperties}
    >
      <rect x="0" y="0" width="300" height="330" rx="8" fill="#465770" />
      <path d="M18 0v330M282 0v330" stroke="#F2C230" strokeWidth="5" strokeDasharray="18 12" />
      <rect x="40" y="318" width="220" height="12" fill="#22303F" />
      <path d="M60 324h180" stroke="#5B6B7E" strokeWidth="2" strokeDasharray="6 6" />
      <text
        x="150"
        y="314"
        textAnchor="middle"
        fontFamily="Barlow Semi Condensed, Inter, sans-serif"
        fontWeight="700"
        fontSize="11"
        fill="#9FB0C4"
        letterSpacing="3"
      >
        OVERHEAD DOOR
      </text>

      {occupied ? (
        <g>
          <ellipse cx="150" cy="160" rx="62" ry="138" fill="#1A2533" opacity=".28" />
          <rect x="128" y="18" width="7" height="186" rx="2" fill="#1B2533" />
          <rect x="165" y="18" width="7" height="186" rx="2" fill="#1B2533" />
          <rect x="128" y="40" width="44" height="5" fill="#1B2533" />
          <rect x="128" y="82" width="44" height="5" fill="#1B2533" />
          <rect x="100" y="28" width="28" height="28" rx="5" fill="#141B26" />
          <rect x="172" y="28" width="28" height="28" rx="5" fill="#141B26" />
          <rect x="100" y="70" width="28" height="28" rx="5" fill="#141B26" />
          <rect x="172" y="70" width="28" height="28" rx="5" fill="#141B26" />
          <path d="M114 30v24M114 72v24M186 30v24M186 72v24" stroke="#3A4658" strokeWidth="2" />
          <rect x="102" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
          <rect x="176" y="18" width="22" height="6" rx="2" fill="#2C3A4E" />
          <circle cx="150" cy="64" r="20" fill="#5D6B7D" stroke="#3A4658" strokeWidth="3" />
          <path d="M150 44v14" stroke="#2C3A4E" strokeWidth="5" />
          <rect x="96" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
          <rect x="188" y="150" width="16" height="48" rx="8" fill="#C9D2DC" stroke="#8C99AA" strokeWidth="1.5" />
          <path d="M98 160h12M98 186h12M190 160h12M190 186h12" stroke="#8C99AA" strokeWidth="1.5" />
          <rect x="111" y="104" width="78" height="58" rx="12" fill={cab} />
          <rect x="119" y="110" width="62" height="40" rx="8" fill="#FFFFFF" opacity=".14" />
          <text
            x="150"
            y="137"
            textAnchor="middle"
            fontFamily="Barlow Semi Condensed, Inter, sans-serif"
            fontWeight="800"
            fontSize="22"
            fill="#FFFFFF"
          >
            {unit}
          </text>
          <rect x="113" y="160" width="74" height="40" rx="6" fill={cab} />
          <rect x="132" y="168" width="36" height="12" rx="3" fill="#FFFFFF" opacity=".2" />
          <rect x="98" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
          <rect x="187" y="198" width="15" height="7" rx="2" fill="#2C3A4E" />
          {/* Default aero hood (board isAero) */}
          <path d="M116 200h68l-4 14h-60z" fill="#A9C8E3" />
          <rect x="104" y="232" width="13" height="30" rx="4" fill="#141B26" />
          <rect x="183" y="232" width="13" height="30" rx="4" fill="#141B26" />
          <path d="M120 214h60l-3 64c-1 7-6 10-12 10h-30c-6 0-11-3-12-10z" fill={cab} />
          <path d="M150 218v66" stroke="#FFFFFF" strokeOpacity=".25" strokeWidth="2" />
          <rect x="128" y="286" width="44" height="7" rx="3" fill="#D3DBE5" />
          <rect x="124" y="276" width="10" height="5" rx="2" fill="#FDE68A" />
          <rect x="166" y="276" width="10" height="5" rx="2" fill="#FDE68A" />
          <g transform="translate(232 40)">
            <circle cx="0" cy="0" r="17" fill={taskColor} stroke="#FFFFFF" strokeWidth="2.5" />
            <text
              x="0"
              y="5"
              textAnchor="middle"
              fontFamily="Barlow Semi Condensed, Inter, sans-serif"
              fontWeight="800"
              fontSize="13"
              fill="#FFFFFF"
            >
              {taskShort}
            </text>
          </g>
        </g>
      ) : (
        <g>
          <rect
            x="70"
            y="60"
            width="160"
            height="210"
            rx="14"
            fill="none"
            stroke="#9FB0C4"
            strokeWidth="2"
            strokeDasharray="8 8"
          />
          <text
            x="150"
            y="170"
            textAnchor="middle"
            fontFamily="Barlow Semi Condensed, Inter, sans-serif"
            fontWeight="700"
            fontSize="18"
            fill="#C9D3DF"
          >
            OPEN BAY
          </text>
        </g>
      )}
    </svg>
  );
}
