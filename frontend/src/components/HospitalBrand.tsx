import { useState, useEffect } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

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
  hospaiLogoSrc: "/hospai_login_logo.png",
  colors: {
    sidebarText: "#ffffff",
    sidebarHospital: "#ffffff", // Clean white on navy sidebar
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

  // Primary logo is 'hospai'; flipping/toggling displays 'ayu'
  const [activeLogo, setActiveLogo] = useState<"hospai" | "ayu">(() => {
    try {
      const saved = localStorage.getItem("ayu_sidebar_active_logo");
      return saved === "ayu" ? "ayu" : "hospai";
    } catch {
      return "hospai";
    }
  });

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<"hospai" | "ayu">;
      if (customEvent.detail && (customEvent.detail === "hospai" || customEvent.detail === "ayu")) {
        setActiveLogo(customEvent.detail);
      }
    };
    window.addEventListener("ayu-sidebar-logo-toggled", handleSync);
    return () => window.removeEventListener("ayu-sidebar-logo-toggled", handleSync);
  }, []);

  const toggleLogo = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const next = activeLogo === "hospai" ? "ayu" : "hospai";
    setActiveLogo(next);
    try {
      localStorage.setItem("ayu_sidebar_active_logo", next);
    } catch {
      // ignore storage failure
    }
    window.dispatchEvent(new CustomEvent("ayu-sidebar-logo-toggled", { detail: next }));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleLogo(e);
    }
  };

  if (variant === "collapsed") {
    return (
      <div
        className={`hospital-brand-container hospital-brand-collapsed ${className}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          padding: "8px 0",
          cursor: "pointer",
          ...style,
        }}
        onClick={(e) => {
          toggleLogo(e);
          onClick?.();
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        title={`Active logo: ${activeLogo === "hospai" ? "HospAI" : "Ayu Polyclinic"}. Click to toggle.`}
        aria-label={`Active logo: ${activeLogo === "hospai" ? "HospAI" : "Ayu Polyclinic"}. Click to toggle.`}
      >
        {activeLogo === "hospai" ? (
          <img
            src={HOSPITAL_BRAND_CONFIG.hospaiLogoSrc}
            alt="HospAI"
            style={{
              width: size,
              height: size,
              objectFit: "contain",
              filter: "drop-shadow(0 0 1px rgba(255, 255, 255, 0.45)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))",
            }}
          />
        ) : (
          <BrandEmblem size={size} isSidebar={true} />
        )}
        <span style={VISUALLY_HIDDEN_STYLE}>Ayu Polyclinic</span>
      </div>
    );
  }

  const resolvedTextColor = textColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarText : HOSPITAL_BRAND_CONFIG.colors.screenText);
  const resolvedHospitalColor = hospitalColor || (isSidebar ? HOSPITAL_BRAND_CONFIG.colors.sidebarHospital : HOSPITAL_BRAND_CONFIG.colors.screenHospital);

  // In non-sidebar contexts (screen header, print export), keep standard Ayu branding
  if (!isSidebar) {
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
              fontSize: isPrint ? "22px" : "20px",
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
                fontSize: isPrint ? "11px" : "10px",
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

  // Sidebar branding with 3D flip / toggle between HospAI (primary) and Ayu Polyclinic
  const isAyu = activeLogo === "ayu";

  return (
    <div
      className={`hospital-brand-sidebar-wrapper ${className}`}
      style={{
        width: "100%",
        padding: "0.25rem 0.5rem",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        className="hospital-brand-flip-card"
        onClick={(e) => {
          toggleLogo(e);
          onClick?.();
        }}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        title={isAyu ? "Showing Ayu Polyclinic · Click to flip to HospAI" : "Showing HospAI · Click to flip to Ayu Polyclinic"}
        aria-label={isAyu ? "Showing Ayu Polyclinic logo. Click to flip to HospAI." : "Showing HospAI logo. Click to flip to Ayu Polyclinic."}
      >
        <div className={`hospital-brand-flipper ${isAyu ? "flipped" : ""}`}>
          {/* Front Face: HospAI official logo */}
          <div className="hospital-brand-face hospital-brand-front">
            <div className="hospital-brand-hospai-box">
              <img
                src={HOSPITAL_BRAND_CONFIG.hospaiLogoSrc}
                alt="HospAI - AI-Driven Healthcare Optimization"
                className="hospital-brand-hospai-img"
              />
            </div>
            <button
              type="button"
              className="hospital-brand-toggle-btn"
              onClick={toggleLogo}
              title="Flip logo to Ayu Polyclinic"
              aria-label="Flip logo to Ayu Polyclinic"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Back Face: Existing Ayu Polyclinic logo */}
          <div className="hospital-brand-face hospital-brand-back">
            <div className="hospital-brand-ayu-box">
              <BrandEmblem size={size} isSidebar={true} />
              <div className="hospital-brand-titles">
                <span className="hospital-brand-name">{HOSPITAL_BRAND_CONFIG.name}</span>
                {showSubtitle && (
                  <span className="hospital-brand-sub">{HOSPITAL_BRAND_CONFIG.sub}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="hospital-brand-toggle-btn"
              onClick={toggleLogo}
              title="Flip logo to HospAI"
              aria-label="Flip logo to HospAI"
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
