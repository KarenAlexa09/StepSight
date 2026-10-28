import type { Kind, Motion } from "../lib/manual";

const INK = "#141414";
const ARROW: Record<string, string> = {
  up: "M28 44 V14 M20 22 L28 13 L36 22",
  down: "M28 12 V42 M20 34 L28 43 L36 34",
  left: "M44 28 H14 M22 20 L13 28 L22 36",
  right: "M12 28 H42 M34 20 L43 28 L34 36",
};

export default function ActionIcon({ motion, kind }: { motion?: Motion; kind: Kind }) {
  const type = motion?.type ?? "none";
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "connect" && (
        <>
          <rect x="24" y="6" width="28" height="14" rx="3" fill="#3B82D6" />
          <rect x="4" y="36" width="28" height="14" rx="3" fill="#E2574C" />
          <path d="M26 33 C32 29 36 27 38 24" strokeDasharray="4 4" />
          <path d="M33 22 L40 23 L38 30" />
        </>
      )}
      {type === "move" && (
        <>
          <rect x="16" y="20" width="24" height="16" rx="3" fill="#E2574C" opacity="0.35" strokeDasharray="3 3" />
          <path d={ARROW[motion?.direction ?? ""] ?? ARROW.right} />
        </>
      )}
      {type === "remove" && (
        <>
          <rect x="10" y="26" width="26" height="16" rx="3" fill="#E2574C" />
          <path d="M30 22 L46 8 M40 8 H46 V14" />
        </>
      )}
      {type === "none" && kind === "find" && (
        <>
          <circle cx="24" cy="24" r="12" fill="#E4FF3A" />
          <path d="M33 33 L47 47" />
        </>
      )}
      {type === "none" && kind !== "find" && (
        <>
          <rect x="10" y="18" width="36" height="22" rx="4" fill="#E4FF3A" />
          <path d="M20 29 L26 35 L37 23" />
        </>
      )}
    </svg>
  );
}
