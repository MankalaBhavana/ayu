import type { Dispatch, SetStateAction } from "react";
import type { Notice } from "../types";
import PharmacyOverview from "./pharmacy/PharmacyOverview";
import PharmacyOpDispense from "./pharmacy/PharmacyOpDispense";
import PharmacyIpDispense from "./pharmacy/PharmacyIpDispense";
import PharmacyReports from "./pharmacy/PharmacyReports";

type Props = {
  view: "overview" | "prescriptions" | "dispense" | "reports" | "ward-indents" | "emar";
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate?: (pageId: string) => void;
};

export default function PharmacyOperationsPage({ view, setNotice, onNavigate = () => {} }: Props) {
  if (view === "reports") {
    return <PharmacyReports setNotice={setNotice} onNavigate={onNavigate} />;
  }
  if (view === "ward-indents" || view === "emar") {
    return <PharmacyIpDispense setNotice={setNotice} onNavigate={onNavigate} />;
  }
  if (view === "dispense") {
    return <PharmacyOpDispense setNotice={setNotice} onNavigate={onNavigate} />;
  }
  return <PharmacyOverview setNotice={setNotice} onNavigate={onNavigate} />;
}
