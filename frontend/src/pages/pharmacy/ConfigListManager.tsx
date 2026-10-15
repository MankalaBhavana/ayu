import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input } from "../../components/ui";
import { reportError } from "../../lib/api";
import { createDropdownOption, deleteDropdownOption, fetchDropdownsByCategory } from "../../lib/dropdownService";
import type { DropdownOption } from "../../lib/dropdownService";
import type { Notice } from "../../types";

type Props = {
  /** Shared dropdown category, e.g. "dosage_forms" or "storage_locations". */
  category: string;
  title: string;
  /** What the list feeds, shown under the title. */
  description: string;
  itemNoun: string;
  placeholder: string;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
};

/**
 * Add / remove entries of a shared dropdown list from Pharmacy → Settings.
 * Changes broadcast "ayu-dropdowns-updated", so every field using the list refreshes.
 */
export default function ConfigListManager({ category, title, description, itemNoun, placeholder, setNotice }: Props) {
  const [items, setItems] = useState<DropdownOption[]>([]);
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const rows = await fetchDropdownsByCategory(category, true);
    setItems([...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)));
  };

  useEffect(() => {
    void load();
    const handleUpdate = () => void load();
    window.addEventListener("ayu-dropdowns-updated", handleUpdate);
    return () => window.removeEventListener("ayu-dropdowns-updated", handleUpdate);
  }, [category]);

  const handleAdd = async () => {
    const value = newValue.trim();
    if (!value) {
      setNotice({ type: "warning", message: `Enter a ${itemNoun} name.` });
      return;
    }
    if (items.some((f) => f.value.toLowerCase() === value.toLowerCase() || f.label.toLowerCase() === value.toLowerCase())) {
      setNotice({ type: "warning", message: `"${value}" is already configured.` });
      return;
    }
    setSaving(true);
    try {
      await createDropdownOption({ category, value, label: value, sort_order: items.length + 1 });
      setNewValue("");
      setNotice({ type: "success", message: `"${value}" added to ${title}.` });
    } catch (err) {
      reportError(setNotice, err as any, `Failed to add ${itemNoun}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (item: DropdownOption) => {
    if (!window.confirm(`Remove "${item.label}"? Records that already use it keep their current value.`)) return;
    try {
      await deleteDropdownOption(item.id);
      setNotice({ type: "success", message: `"${item.label}" removed from ${title}.` });
    } catch (err) {
      reportError(setNotice, err as any, `Failed to remove ${itemNoun}`);
    }
  };

  return (
    <div style={{ background: "#ffffff", borderRadius: "10px", padding: "1.5rem", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{title}</h3>
      <p style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", color: "#64748b" }}>{description}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}
      >
        <div style={{ flex: "1 1 280px", maxWidth: "420px" }}>
          <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder={placeholder} aria-label={`New ${itemNoun}`} />
        </div>
        <Button type="submit" className="primary" style={{ background: "#00828a", borderColor: "#00828a", fontWeight: 700 }} disabled={saving}>
          {saving ? "Adding..." : `+ Add ${itemNoun.charAt(0).toUpperCase()}${itemNoun.slice(1)}`}
        </Button>
      </form>
      {items.length === 0 ? (
        <div style={{ padding: "1rem", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px" }}>
          Nothing configured yet. Add one above.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontWeight: 600, color: "#334155", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}
            >
              <span>✓ {item.label || item.value}</span>
              <button
                type="button"
                onClick={() => void handleRemove(item)}
                title={`Remove ${item.label || item.value}`}
                aria-label={`Remove ${item.label || item.value}`}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
