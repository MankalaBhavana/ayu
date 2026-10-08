import type { CSSProperties } from "react";

export type HospitalBrandVariant = "sidebar" | "screen" | "print" | "collapsed" | "header";

export type HospitalBrandProps = {
  variant?: HospitalBrandVariant;
  emblemSize?: number;
  className?: string;
  showSubtitle?: boolean;
  textColor?: string;
  hospitalColor?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

export const HOSPITAL_BRAND_CONFIG = {
  name: "Sri Raksha",
  sub: "HOSPITAL",
  emblemSrc: "/logo_emblem.png",
  colors: {
    sidebarText: "#ffffff",
    sidebarHospital: "#e11d48", // Highly readable crimson red on navy sidebar
    screenText: "#062f56",      // Dark navy on light backgrounds
    screenHospital: "#dc2626",  // Red on light backgrounds
  },
};

const EMBLEM_SIZE_BY_VARIANT: Record<HospitalBrandVariant, number> = {
  sidebar: 56,
  collapsed: 48,
  print: 48,
  screen: 44,
  header: 44,
};

const VISUALLY_HIDDEN_STYLE: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  border: 0,
};

function BrandEmblem({ size }: { size: number }) {
  return (
    <img
      src={HOSPITAL_BRAND_CONFIG.emblemSrc}
      alt="Sri Raksha Hospital emblem"
      style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block" }}
      loading="eager"
      decoding="sync"
    />
  );
}

export default function HospitalBrand({
  variant = "sidebar",
  emblemSize,
  className = "",
  showSubtitle = true,
  textColor,
  hospitalColor,
  style,
  onClick,
}: HospitalBrandProps) {
  const isSidebar = variant === "sidebar";
  const isPrint = variant === "print";
  const size = emblemSize ?? EMBLEM_SIZE_BY_VARIANT[variant];

  if (variant === "collapsed") {
    return (
      <div
        className={`hospital-brand-container hospital-brand-collapsed ${className}`}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", padding: "8px 0", ...style }}
        onClick={onClick}
        title="Sri Raksha Hospital"
        aria-label="Sri Raksha Hospital"
      >
        <BrandEmblem size={size} />
        <span style={VISUALLY_HIDDEN_STYLE}>Sri Raksha Hospital</span>
      </div>
    );
  }

  const resolvedTextColor = textColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarText : HOSPITAL_BRAND_CONFIG.colors.screenText);
  const resolvedHospitalColor = hospitalColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarHospital : HOSPITAL_BRAND_CONFIG.colors.screenHospital);

  return (
    <div
      className={`hospital-brand-container hospital-brand-${variant} ${className}`}
      style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, ...style }}
      onClick={onClick}
    >
      <BrandEmblem size={size} />
      <div className="hospital-brand-titles" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, lineHeight: 1.15 }}>
        <span
          className="hospital-brand-name"
          style={{
            fontSize: isSidebar ? "22px" : isPrint ? "20px" : "18px",
            fontWeight: 700,
            color: resolvedTextColor,
            fontFamily: "inherit",
            letterSpacing: "-0.015em",
            whiteSpace: "nowrap",
            margin: 0,
            padding: 0,
          }}
        >
          {HOSPITAL_BRAND_CONFIG.name}
        </span>
        {showSubtitle && (
          <span
            className="hospital-brand-sub"
            style={{
              fontSize: isSidebar ? "11.5px" : isPrint ? "10.5px" : "10px",
              fontWeight: 800,
              color: resolvedHospitalColor,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              margin: "2px 0 0",
              padding: 0,
            }}
          >
            {HOSPITAL_BRAND_CONFIG.sub}
          </span>
        )}
      </div>
    </div>
  );
}
