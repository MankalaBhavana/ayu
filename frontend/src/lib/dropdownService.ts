import { useState, useEffect } from "react";
import { apiFetch } from "./api";

export interface DropdownOption {
  id: number;
  category: string;
  value: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
}

let dropdownCache: Record<string, DropdownOption[]> | null = null;
let pendingFetch: Promise<Record<string, DropdownOption[]>> | null = null;

export async function fetchAllDropdowns(forceRefresh = false): Promise<Record<string, DropdownOption[]>> {
  if (!forceRefresh && dropdownCache) {
    return dropdownCache;
  }
  if (pendingFetch && !forceRefresh) {
    return pendingFetch;
  }

  pendingFetch = (async () => {
    try {
      const data = await apiFetch("/api/config/dropdowns?active_only=true");
      dropdownCache = data || {};
      return dropdownCache!;
    } catch (err) {
      console.warn("Failed to load centralized dropdown configurations, using local fallbacks", err);
      return dropdownCache || {};
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

export async function fetchDropdownsByCategory(category: string, activeOnly = true): Promise<DropdownOption[]> {
  try {
    const data = await apiFetch(`/api/config/dropdowns?category=${encodeURIComponent(category)}&active_only=${activeOnly}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`Failed to fetch dropdown category ${category}:`, err);
    return [];
  }
}

export async function createDropdownOption(payload: {
  category: string;
  value: string;
  label?: string;
  sort_order?: number;
}): Promise<DropdownOption> {
  const result = await apiFetch("/api/config/dropdowns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  dropdownCache = null; // Invalidate cache
  window.dispatchEvent(new CustomEvent("ayu-dropdowns-updated", { detail: { category: payload.category } }));
  return result;
}

export async function updateDropdownOption(
  id: number,
  payload: Partial<DropdownOption>
): Promise<DropdownOption> {
  const result = await apiFetch(`/api/config/dropdowns/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  dropdownCache = null;
  window.dispatchEvent(new CustomEvent("ayu-dropdowns-updated", { detail: { id } }));
  return result;
}

export async function deleteDropdownOption(id: number): Promise<{ id: number; action: string; message: string }> {
  const result = await apiFetch(`/api/config/dropdowns/${id}`, {
    method: "DELETE",
  });
  dropdownCache = null;
  window.dispatchEvent(new CustomEvent("ayu-dropdowns-updated", { detail: { id } }));
  return result;
}

export function useDropdownOptions(
  category: string,
  fallbackOptions: { value: string; label: string }[] = []
): { options: { value: string; label: string }[]; loading: boolean; reload: () => void } {
  const [options, setOptions] = useState<{ value: string; label: string }[]>(fallbackOptions);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const all = await fetchAllDropdowns();
      const catList = all[category];
      if (catList && catList.length > 0) {
        setOptions(catList.map((o) => ({ value: o.value, label: o.label || o.value })));
      } else {
        setOptions(fallbackOptions);
      }
    } catch {
      setOptions(fallbackOptions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const handleUpdate = (e: any) => {
      if (!e.detail?.category || e.detail.category === category) {
        fetchAllDropdowns(true).then(() => load());
      }
    };
    window.addEventListener("ayu-dropdowns-updated", handleUpdate);
    return () => window.removeEventListener("ayu-dropdowns-updated", handleUpdate);
  }, [category]);

  return { options, loading, reload: () => fetchAllDropdowns(true).then(load) };
}
