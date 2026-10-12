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
  name: "Ayu",
  sub: "POLYCLINIC",
  emblemSrc: "/logo_emblem.png?v=20261012-v5",
  colors: {
    sidebarText: "#ffffff",
    sidebarHospital: "#e11d48", // Highly readable crimson red on navy sidebar
    screenText: "#062f56",      // Dark navy on light backgrounds
    screenHospital: "#dc2626",  // Red on light backgrounds
  },
};

const EMBLEM_SIZE_BY_VARIANT: Record<HospitalBrandVariant, number> = {
  sidebar: 58,
  collapsed: 44,
  print: 52,
  screen: 48,
  header: 48,
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

function BrandEmblem({ size, isSidebar }: { size: number; isSidebar?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      <img
        src={HOSPITAL_BRAND_CONFIG.emblemSrc}
        alt="Ayu Polyclinic emblem"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          backgroundColor: "transparent",
          background: "transparent",
          border: "none",
          boxShadow: "none",
          filter: isSidebar
            ? "drop-shadow(0 0 1px rgba(255, 255, 255, 0.45)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))"
            : undefined,
        }}
        loading="eager"
        decoding="sync"
      />
    </div>
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
        title="Ayu Polyclinic"
        aria-label="Ayu Polyclinic"
      >
        <BrandEmblem size={size} isSidebar={true} />
        <span style={VISUALLY_HIDDEN_STYLE}>Ayu Polyclinic</span>
      </div>
    );
  }

  const resolvedTextColor = textColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarText : HOSPITAL_BRAND_CONFIG.colors.screenText);
  const resolvedHospitalColor = hospitalColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarHospital : HOSPITAL_BRAND_CONFIG.colors.screenHospital);

  return (
    <div
      className={`hospital-brand-container hospital-brand-${variant} ${className}`}
      style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, ...style }}
      onClick={onClick}
    >
      <BrandEmblem size={size} isSidebar={isSidebar} />
      <div className="hospital-brand-titles" style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, lineHeight: 1.12 }}>
        <span
          className="hospital-brand-name"
          style={{
            fontSize: isSidebar ? "26px" : isPrint ? "22px" : "20px",
            fontWeight: 800,
            color: resolvedTextColor,
            fontFamily: "inherit",
            letterSpacing: "-0.02em",
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
              fontSize: isSidebar ? "12px" : isPrint ? "11px" : "10px",
              fontWeight: 800,
              color: resolvedHospitalColor,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              margin: "3px 0 0",
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
