import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import ReadmitPage from "./ReadmitPage";

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

describe("ReadmitPage", () => {
  test("renders revisit doctor fields and removes allergies field", async () => {
    mockLocalStorage();
    const patient = {
      patient_id: "UHID-1001",
      name: "Asha",
      last_name: "Nair",
      age: 34,
      gender: "Female",
      phone: "9876543210",
      allergies: "Peanuts",
      created_at: "2026-07-10T10:00:00.000Z",
    };

    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/patients")) {
        if (requestUrl.includes("/api/patients/")) {
          return jsonResponse({ patient });
        }
        return jsonResponse({ patients: [patient] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ doctor_name: "Dr. Shah", department: "Cardiology" }] });
      }
      if (requestUrl.includes("/api/patients/UHID-1001/documents")) {
        return jsonResponse({ documents: [] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ReadmitPage onSelect={vi.fn()} setNotice={vi.fn()} ocrLanguage="en" />);
      await flush();
      await flush();
    });

    fireEvent.click(container.querySelector("button") as HTMLButtonElement);
    await act(async () => {
      await flush();
    });

    expect(container.textContent).toContain("Doctor Name");
    expect(container.textContent).toContain("Doctor Department");
    expect(container.textContent).toContain("Review Fee");
    expect(container.textContent).not.toContain("Allergies");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("shows 'Patient is already in queue' and disables Confirm Re-visit when patient is in active queue", async () => {
    mockLocalStorage();
    const patient = {
      patient_id: "UHID-2002",
      name: "Rohan",
      last_name: "Verma",
      age: 40,
      gender: "Male",
      phone: "9876543222",
      created_at: "2026-10-15T10:00:00.000Z",
    };

    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/patients/UHID-2002")) {
        return jsonResponse({ patient });
      }
      if (requestUrl.includes("/api/patients")) {
        return jsonResponse({ patients: [patient] });
      }
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 99,
              patient_id: "UHID-2002",
              token_no: 5,
              status: "scheduled",
              doctor_name: "Dr. Shah",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ doctor_name: "Dr. Shah", department: "Cardiology", review_fee: 300 }] });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ department_name: "Cardiology" }] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ReadmitPage onSelect={vi.fn()} setNotice={vi.fn()} ocrLanguage="en" />);
      await flush();
      await flush();
    });

    // Row shows In Queue badge
    expect(container.textContent).toContain("In Queue");

    // Click row or button to expand
    const revisitBtn = container.querySelector("button") as HTMLButtonElement;
    fireEvent.click(revisitBtn);
    await act(async () => {
      await flush();
      await flush();
    });

    // Form displays warning that patient is already in queue
    expect(container.textContent).toContain("Patient is already in queue");
    expect(container.textContent).toContain("Token #5");

    // Confirm button is disabled with text "Patient is already in queue"
    const confirmBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Patient is already in queue")
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn.disabled).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
