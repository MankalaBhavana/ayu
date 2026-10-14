import { act } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createRoot } from "react-dom/client";
import AddPatientPage from "./AddPatientPage";
import { printViaIframe } from "../lib/printViaIframe";
import { PRINT_BRAND_HEADER_DATA_URI } from "../lib/printBrand";

vi.mock("../lib/printViaIframe", () => ({ printViaIframe: vi.fn() }));

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

function mockLocalStorage() {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  });
}

describe("AddPatientPage", () => {
  test("renders patient registration and document upload sections", async () => {
    mockLocalStorage();
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/patients/next-id")) {
        return jsonResponse({ patient_id: "HSP1001" });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 1, department_name: "General" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ doctor_name: "Dr. Rao", department: "General", consultation_fee: 200, review_fee: 150 }] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AddPatientPage
          onCreate={vi.fn(async () => null)}
          selectedPatient={null}
          ocrLanguage="en"
          setNotice={vi.fn()}
        />
      );
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Patient Registration");
    expect(container.textContent).toContain("Primary Mobile");
    expect(container.textContent).toContain("Register Patient");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("submits patient registration form with valid details", async () => {
    mockLocalStorage();
    const onCreateMock = vi.fn(async () => ({ patient_id: "HSP1002" }));
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/patients/next-id")) {
        return jsonResponse({ patient_id: "HSP1002" });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 1, department_name: "General Medicine" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ doctor_name: "Dr. Arjun Mehta", department: "General Medicine", consultation_fee: 500, review_fee: 300 }] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <AddPatientPage
          onCreate={onCreateMock}
          selectedPatient={null}
          ocrLanguage="en"
          setNotice={vi.fn()}
        />
      );
      await flush();
      await flush();
      await flush();
    });

    const firstNameInput = container.querySelector('input[placeholder="Enter first name"]') as HTMLInputElement | null;
    const lastNameInput = container.querySelector('input[placeholder="Enter last name"]') as HTMLInputElement | null;
    const dobInput = container.querySelector('input[type="date"]') as HTMLInputElement | null;
    const addressInput = container.querySelector('input[placeholder="Enter complete address"]') as HTMLInputElement | null;
    const genderSelect = Array.from(container.querySelectorAll("select")).find((s) => s.innerHTML.includes("Select gender")) as HTMLSelectElement | null;
    const mobileInput = container.querySelector('input[placeholder="Mobile number"]') as HTMLInputElement | null;
    const registerButton = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent?.includes("Register Patient"));

    await act(async () => {
      if (firstNameInput) fireEvent.change(firstNameInput, { target: { value: "Asha" } });
      if (lastNameInput) fireEvent.change(lastNameInput, { target: { value: "Menon" } });
      if (dobInput) fireEvent.change(dobInput, { target: { value: "1995-05-15" } });
      if (genderSelect) fireEvent.change(genderSelect, { target: { value: "Female" } });
      if (addressInput) fireEvent.change(addressInput, { target: { value: "123 MG Road" } });
      if (mobileInput) fireEvent.change(mobileInput, { target: { value: "9999999999" } });
      if (registerButton) fireEvent.click(registerButton);
      await flush();
      await flush();
      await flush();
    });

    expect(onCreateMock).toHaveBeenCalledTimes(1);
    expect(onCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Asha",
        last_name: "Menon",
        phone: "9999999999",
        address: "123 MG Road",
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );

    const printSlipButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Print Slip"));
    expect(printSlipButton).toBeDefined();
    await act(async () => {
      fireEvent.click(printSlipButton as HTMLButtonElement);
      await flush();
    });
    const printHtml = vi.mocked(printViaIframe).mock.calls[vi.mocked(printViaIframe).mock.calls.length - 1]?.[0] || "";
    const parsedPrintHtml = new DOMParser().parseFromString(printHtml, "text/html");
    expect(parsedPrintHtml.querySelector(".registration-slip-header img")?.getAttribute("src")).toBe(PRINT_BRAND_HEADER_DATA_URI);
    expect(parsedPrintHtml.querySelector(".registration-slip-title")?.textContent).toContain("Ayu Polyclinic");
    expect(parsedPrintHtml.querySelector(".registration-slip-header")?.getAttribute("style")).toContain("gap: 6px");
    expect(parsedPrintHtml.querySelector(".registration-slip-title")?.getAttribute("style")).toContain("text-align: left");
    expect(printViaIframe).toHaveBeenCalledWith(
      expect.stringContaining('class="registration-slip-header"'),
      "__hospai_registration_token_slip_print__",
      expect.objectContaining({ preserveDocumentHeader: true, suppressBrowserHeadersAndFooters: true, footerAtBottom: true, includeFooter: false })
    );

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
