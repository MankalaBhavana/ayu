import { useEffect, useState } from "react";
import { apiFetch } from "./api";

/** Pharmacy invoice / label header details, saved from Pharmacy → Settings → Print & Label. */
export type PharmacyPrintSettings = {
  pharmacy_name: string;
  address_line: string;
  dl_number: string;
  gstin: string;
};

export const DEFAULT_PHARMACY_NAME = "AYU POLYCLINIC & EMERGENCY CLINIC";
export const PHARMACY_SETTINGS_UPDATED_EVENT = "ayu-pharmacy-settings-updated";

const EMPTY_SETTINGS: PharmacyPrintSettings = { pharmacy_name: "", address_line: "", dl_number: "", gstin: "" };

export async function fetchPharmacySettings(): Promise<PharmacyPrintSettings> {
  const data = await apiFetch<Partial<PharmacyPrintSettings>>("/api/pharmacy/settings");
  return { ...EMPTY_SETTINGS, ...(data || {}) };
}

export async function savePharmacySettings(settings: PharmacyPrintSettings): Promise<PharmacyPrintSettings> {
  const saved = await apiFetch<PharmacyPrintSettings>("/api/pharmacy/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
  window.dispatchEvent(new CustomEvent(PHARMACY_SETTINGS_UPDATED_EVENT));
  return { ...EMPTY_SETTINGS, ...(saved || {}) };
}

/** Saved print settings; stays current when they are changed in Settings. */
export function usePharmacySettings(): PharmacyPrintSettings {
  const [settings, setSettings] = useState<PharmacyPrintSettings>(EMPTY_SETTINGS);
  useEffect(() => {
    const load = () => {
      fetchPharmacySettings().then(setSettings).catch(() => setSettings(EMPTY_SETTINGS));
    };
    load();
    window.addEventListener(PHARMACY_SETTINGS_UPDATED_EVENT, load);
    return () => window.removeEventListener(PHARMACY_SETTINGS_UPDATED_EVENT, load);
  }, []);
  return settings;
}

/** Header lines for pharmacy invoices; only the details that were filled in. */
export function pharmacyHeaderLines(settings: PharmacyPrintSettings): string[] {
  const licence = [
    settings.dl_number ? `DL No: ${settings.dl_number}` : "",
    settings.gstin ? `GSTIN: ${settings.gstin}` : "",
  ].filter(Boolean).join(" · ");
  return [settings.pharmacy_name || DEFAULT_PHARMACY_NAME, settings.address_line, licence].filter(Boolean);
}
