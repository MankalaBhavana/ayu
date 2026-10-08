import type { Dispatch, SetStateAction } from "react";
import type { Notice } from "../types";
import PharmacyInventoryStock from "./pharmacy/PharmacyInventoryStock";
import PharmacyPurchasesGrn from "./pharmacy/PharmacyPurchasesGrn";

type Props = {
  view: "inventory" | "purchases";
  initialTab?: string;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate?: (pageId: string) => void;
};

export default function PharmacyInventoryPage({ view, setNotice, onNavigate = () => {} }: Props) {
  if (view === "purchases") {
    return <PharmacyPurchasesGrn setNotice={setNotice} onNavigate={onNavigate} />;
  }
  return <PharmacyInventoryStock setNotice={setNotice} onNavigate={onNavigate} />;
}
