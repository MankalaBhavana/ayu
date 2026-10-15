import { useEffect, useState } from "react";
import { apiFetch } from "./api";

/**
 * Single source of truth for clinical departments (department_master), managed
 * from OP Desk → Manage Departments and HRMS → Departments. Every department
 * dropdown should read from here and subscribe to changes so a department added
 * or deleted anywhere shows up everywhere without a page reload.
 */

export const DEPARTMENTS_UPDATED_EVENT = "ayu-departments-updated";
const DEPARTMENTS_STORAGE_KEY = "ayu-departments-updated-at";

export type DepartmentRecord = {
  id: number;
  department_name?: string;
  [key: string]: unknown;
};

export async function fetchDepartments(): Promise<DepartmentRecord[]> {
  const data = await apiFetch<{ departments?: DepartmentRecord[] }>("/api/registration/departments");
  return data?.departments || [];
}

export function toDepartmentNames(records: DepartmentRecord[]): string[] {
  return Array.from(new Set(records.map((d) => (d.department_name || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export async function fetchDepartmentNames(): Promise<string[]> {
  return toDepartmentNames(await fetchDepartments());
}

/** Call after creating, renaming or deleting a department. */
export function notifyDepartmentsChanged(): void {
  window.dispatchEvent(new CustomEvent(DEPARTMENTS_UPDATED_EVENT));
  try {
    // Fires the "storage" event in other open tabs of the app.
    localStorage.setItem(DEPARTMENTS_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode etc.) — same-tab updates still work.
  }
}

/** Runs `callback` whenever departments change in this tab or another tab. Returns an unsubscribe function. */
export function onDepartmentsChanged(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === DEPARTMENTS_STORAGE_KEY) callback();
  };
  window.addEventListener(DEPARTMENTS_UPDATED_EVENT, callback);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(DEPARTMENTS_UPDATED_EVENT, callback);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Sorted department names that stay in sync with Manage Departments. */
export function useDepartmentNames(): { departments: string[]; loading: boolean; reload: () => Promise<void> } {
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      setDepartments(await fetchDepartmentNames());
    } catch {
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    return onDepartmentsChanged(() => void reload());
  }, []);

  return { departments, loading, reload };
}
