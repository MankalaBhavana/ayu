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
  // An offset can only follow a time ("...T10:00+05:30"); a bare date such as
  // "2026-10-31" must not have its "-31" mistaken for a UTC offset.
  const hasOffset = /T.*([zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(normalized);
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
    hourCycle: "h23",
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

// ---------------------------------------------------------------------------
// IST helpers. The HIMS always works in Asia/Kolkata regardless of the
// device/browser timezone. Never use toISOString() for a calendar date (it is
// UTC, i.e. "yesterday" between 00:00 and 05:30 IST) and never call
// toLocale*String() without timeZone: IST_TIMEZONE.
// ---------------------------------------------------------------------------

/** Accepts an API timestamp string, a Date, or epoch milliseconds. */
export type DateInput = string | number | Date | null | undefined;

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseTimestamp(String(value));
}

/** "YYYY-MM-DD" of the given instant (default: now) in IST. */
export function toISTDateKey(value: DateInput = new Date()): string {
  const d = toDate(value);
  return d ? getISTDateKeyFromDate(d) : "";
}

/** Today's date in IST as "YYYY-MM-DD" (use for date inputs, filters, payloads). */
export function todayIST(): string {
  return getISTDateKeyFromDate(new Date());
}

/** Current month in IST as "YYYY-MM". */
export function currentMonthIST(): string {
  return todayIST().slice(0, 7);
}

/** Adds whole calendar days to a "YYYY-MM-DD" key (timezone independent). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** IST date key `days` days from today (negative for the past). */
export function istDateKeyOffset(days: number): string {
  return addDaysToDateKey(todayIST(), days);
}

/** Current instant as ISO-8601 with an explicit +05:30 offset, for API payloads. */
export function nowISTISOString(): string {
  return `${getISTDateTimeKeyFromDate(new Date()).replace(" ", "T")}+05:30`;
}

/** "YYYY-MM-DDTHH:mm" in IST, for <input type="datetime-local"> values. */
export function toISTDateTimeLocal(value: DateInput): string {
  const d = toDate(value);
  return d ? getISTDateTimeKeyFromDate(d).slice(0, 16).replace(" ", "T") : "";
}

/** Whole IST calendar days from `from` to `to` (null if either is invalid). */
export function diffISTCalendarDays(from: DateInput, to: DateInput): number | null {
  const a = toISTDateKey(from);
  const b = toISTDateKey(to);
  if (!a || !b) return null;
  const utc = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/**
 * When an appointment actually happened, for display and sorting. Older
 * walk-in bookings were saved with a date only (00:00 IST); for those, use the
 * record's creation time if it is on the same IST day instead of "12:00 am".
 */
export function resolveAppointmentAt(appointmentDate?: string | null, createdAt?: string | null): string | null {
  if (!appointmentDate) return createdAt || null;
  const key = getISTDateTimeKey(appointmentDate);
  const isMidnight = key.endsWith(" 00:00:00");
  if (isMidnight && createdAt && toISTDateKey(createdAt) === key.slice(0, 10)) return createdAt;
  return appointmentDate;
}

/** Hour (0-23) of the instant in IST. */
export function getISTHour(value: DateInput = new Date()): number {
  const d = toDate(value);
  if (!d) return 0;
  return Number(getISTDateTimeKeyFromDate(d).slice(11, 13));
}

/**
 * Formats a timestamp in IST. Drop-in replacement for
 * `new Date(x).toLocaleString(locale, options)`; `fallback` is returned for
 * empty or unparseable input.
 */
export function formatIST(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale: string = "en-IN",
  fallback = "-",
): string {
  const d = toDate(value);
  if (!d) return fallback;
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: IST_TIMEZONE }).format(d);
}

/** IST date only, e.g. 31/10/2026 (en-IN) - replacement for toLocaleDateString(). */
export function formatDateOnlyIST(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
  locale: string = "en-IN",
  fallback = "-",
): string {
  return formatIST(value, options, locale, fallback);
}

/** IST time only, e.g. 02:30 pm - replacement for toLocaleTimeString(). */
export function formatTimeIST(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: true },
  locale: string = "en-IN",
  fallback = "-",
): string {
  return formatIST(value, options, locale, fallback);
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

  // "Today" is the IST calendar date, expressed as a local Date for comparison.
  const today = new Date(`${todayIST()}T00:00:00`);
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
