import { formatDateIST, formatDateTimeIST, getISTDateKey, resolvePermissions, stripUploadTimestampPrefix } from "./format";

describe("resolvePermissions", () => {
  test("returns explicit user permissions when provided", () => {
    const permissions = resolvePermissions({
      username: "u1",
      permissions: ["patients.read", "billing.read"],
    });
    expect(permissions).toEqual(["patients.read", "billing.read"]);
  });

  test("returns full admin permissions for admin users", () => {
    const permissions = resolvePermissions({
      username: "admin1",
      user_type: "admin",
    });
    expect(permissions).toContain("employees.read");
    expect(permissions).toContain("admin.use");
  });

  test("maps module access to normal user permissions", () => {
    const permissions = resolvePermissions({
      username: "u2",
      user_type: "normal",
      module_access: ["patients", "billing"],
    });
    expect(permissions).toContain("patients.read");
    expect(permissions).toContain("patients.write");
    expect(permissions).toContain("billing.read");
    expect(permissions).toContain("billing.write");
    expect(permissions).not.toContain("employees.read");
  });

  test("denies access by default for normal users with missing module access", () => {
    const permissions = resolvePermissions({
      username: "u3",
      user_type: "normal",
    });
    expect(permissions).toEqual([]);
  });

  test("denies access by default for normal users with empty module access", () => {
    const permissions = resolvePermissions({
      username: "u4",
      user_type: "normal",
      module_access: [],
    });
    expect(permissions).toEqual([]);
  });

  test("does not grant permissions for unknown modules", () => {
    const permissions = resolvePermissions({
      username: "u5",
      user_type: "normal",
      module_access: ["unknown_module"],
    } as any);
    expect(permissions).toEqual([]);
  });

  test("returns empty permissions for missing user", () => {
    const permissions = resolvePermissions(null);
    expect(permissions).toEqual([]);
  });
});

describe("format helpers", () => {
  test("strips generated upload timestamp prefix", () => {
    expect(stripUploadTimestampPrefix("20260218_101530_report.pdf")).toBe("report.pdf");
    expect(stripUploadTimestampPrefix("report.pdf")).toBe("report.pdf");
  });

  test("returns safe fallback for invalid IST date values", () => {
    expect(formatDateIST(undefined)).toBe("Unknown Date");
    expect(formatDateIST("not-a-date")).toBe("Unknown Date");
  });

  test("converts explicit UTC ISO timestamp (Z) to IST (+05:30)", () => {
    // 06:15:00 UTC = 11:45:00 IST
    const formatted = formatDateTimeIST("2026-10-26T06:15:00Z");
    expect(formatted).toBe("26 Oct 2026, 11:45:00 am IST");
  });

  test("converts explicit UTC offset (+00:00) to IST (+05:30)", () => {
    const formatted = formatDateTimeIST("2026-10-26T06:15:00+00:00");
    expect(formatted).toBe("26 Oct 2026, 11:45:00 am IST");
  });

  test("converts RFC 1123 GMT string to IST", () => {
    const formatted = formatDateTimeIST("Mon, 26 Oct 2026 06:15:00 GMT");
    expect(formatted).toBe("26 Oct 2026, 11:45:00 am IST");
  });

  test("preserves naive IST database timestamp without adding +5:30 again", () => {
    // 12:15:17 stored as local IST in DB should remain 12:15:17 in IST
    const formatted = formatDateTimeIST("2026-10-20 12:15:17");
    expect(formatted).toBe("20 Oct 2026, 12:15:17 pm IST");
  });

  test("preserves naive date key on same day for evening times", () => {
    // 20:30:00 in IST is 8:30 PM on Oct 20, must not flip to Oct 21
    expect(getISTDateKey("2026-10-20 20:30:00")).toBe("2026-10-20");
  });
});

