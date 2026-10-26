import type { User } from "../types";
import { ADMIN_PERMISSIONS, MODULE_PERMISSIONS } from "./constants";

export const IST_TIMEZONE = "Asia/Kolkata";

export function parseTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Handle RFC 1123 formats (from Flask jsonify / HTTP headers) natively before custom logic
  if (trimmed.includes(",") && (trimmed.includes("GMT") || trimmed.includes("UTC"))) {
    const nativeParsed = new Date(trimmed);
    if (!Number.isNaN(nativeParsed.getTime())) return nativeParsed;
  }

  let normalized = trimmed.replace(" ", "T");
  // Check if string has explicit timezone offset like Z, +05:30, -04:00, etc.
  const hasOffset = /([zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(normalized);
  if (!hasOffset) {
    if (!normalized.includes("T")) {
      // Date-only string like YYYY-MM-DD
      const dateParts = normalized.split(/[-/]/);
      if (dateParts.length === 3 && dateParts[0].length === 4) {
        normalized = `${dateParts[0]}-${dateParts[1].padStart(2, "0")}-${dateParts[2].padStart(2, "0")}T00:00:00+05:30`;
      } else {
        const fallback = new Date(trimmed);
        if (!Number.isNaN(fallback.getTime())) return fallback;
      }
    } else {
      // Naive timestamp without timezone: in this hospital system it represents IST
      normalized = `${normalized}+05:30`;
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return parsed;
}

function getISTDateKeyFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

function getISTDateTimeKeyFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const second = parts.find((part) => part.type === "second")?.value;
  if (!year || !month || !day || !hour || !minute || !second) return "";
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "-";
  const parsed = parseTimestamp(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function calculateAgeFromDob(dob: string): string {
  if (!dob) return "";
  const clean = dob.trim().split("T")[0]; // remove time if present
  let birthYear = 0;
  let birthMonth = 0;
  let birthDay = 0;

  if (clean.includes("-")) {
    const parts = clean.split("-");
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        birthYear = parseInt(parts[0], 10);
        birthMonth = parseInt(parts[1], 10);
        birthDay = parseInt(parts[2], 10);
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY
        birthYear = parseInt(parts[2], 10);
        birthMonth = parseInt(parts[1], 10);
        birthDay = parseInt(parts[0], 10);
      }
    }
  } else if (clean.includes("/")) {
    const parts = clean.split("/");
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        // YYYY/MM/DD
        birthYear = parseInt(parts[0], 10);
        birthMonth = parseInt(parts[1], 10);
        birthDay = parseInt(parts[2], 10);
      } else if (parts[2].length === 4) {
        birthYear = parseInt(parts[2], 10);
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        if (p0 > 12) {
          // DD/MM/YYYY
          birthDay = p0;
          birthMonth = p1;
        } else {
          // MM/DD/YYYY
          birthMonth = p0;
          birthDay = p1;
        }
      }
    }
  }

  if (!birthYear || !birthMonth || !birthDay || Number.isNaN(birthYear) || Number.isNaN(birthMonth) || Number.isNaN(birthDay)) {
    const parsed = new Date(dob);
    if (!Number.isNaN(parsed.getTime())) {
      birthYear = parsed.getFullYear();
      birthMonth = parsed.getMonth() + 1;
      birthDay = parsed.getDate();
    } else {
      return "";
    }
  }

  const today = new Date();
  if (birthYear < 1900 || birthYear > today.getFullYear()) return "";

  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  if (Number.isNaN(birthDate.getTime())) return "";

  // Reject future birthdates
  if (birthDate > today) return "";

  let age = today.getFullYear() - birthYear;
  const monthDiff = today.getMonth() - (birthMonth - 1);
  const dayDiff = today.getDate() - birthDay;
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  if (age < 0 || age > 130) return "";
  return String(age);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const parsed = parseTimestamp(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
}

export function formatDateTimeIST(value?: string | null): string {
  if (!value) return "-";
  const parsed = parseTimestamp(value);
  if (!parsed) return "-";
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
  return `${formatted} IST`;
}

export function getISTDateKey(value?: string | null): string {
  if (!value) return "";
  const parsed = parseTimestamp(value);
  if (!parsed) return "";
  return getISTDateKeyFromDate(parsed);
}

export function getISTDateTimeKey(value?: string | null): string {
  if (!value) return "";
  const parsed = parseTimestamp(value);
  if (!parsed) return "";
  return getISTDateTimeKeyFromDate(parsed);
}

export function getRelativeDateLabelIST(value?: string | null): string {
  if (!value) return "Unknown Date";
  const parsed = parseTimestamp(value);
  if (!parsed) return "Unknown Date";

  const key = getISTDateKeyFromDate(parsed);
  const now = new Date();
  const todayKey = getISTDateKeyFromDate(now);
  const yesterdayKey = getISTDateKeyFromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function formatDateIST(value?: string | null): string {
  if (!value) return "Unknown Date";
  const parsed = parseTimestamp(value);
  if (!parsed) return "Unknown Date";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(parsed);
}

export function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = parseTimestamp(value);
  return parsed ? parsed.getTime() : 0;
}

export function stripUploadTimestampPrefix(fileName?: string | null): string {
  if (!fileName) return "";
  return fileName.replace(/^\d{8}_\d{6}_/, "");
}

export function resolvePermissions(user: User | null): string[] {
  if (!user) return [];
  if (Array.isArray(user?.permissions) && user.permissions.length > 0) {
    return user.permissions;
  }
  if (user?.user_type === "admin") {
    return ADMIN_PERMISSIONS;
  }
  const modules = Array.isArray(user?.module_access) && user.module_access.length > 0 ? user.module_access : [];
  const permissions = new Set<string>();
  for (const moduleName of modules) {
    for (const permission of MODULE_PERMISSIONS[moduleName] || []) {
      permissions.add(permission);
    }
  }
  return Array.from(permissions);
}

export const filterInteger = (val: string): string => val.replace(/[^0-9]/g, "");

export const filterDecimal = (val: string): string => {
  let v = val.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) {
    v = parts[0] + "." + parts.slice(1).join("");
  }
  return v;
};
