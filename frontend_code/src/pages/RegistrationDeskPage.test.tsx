import { act } from "react";
import { createRoot } from "react-dom/client";
import RegistrationDeskPage from "./RegistrationDeskPage";

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

describe("RegistrationDeskPage", () => {
  test("renders appointment in desk with department dropdown and doctor autocomplete", async () => {
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 1,
              token_no: 7,
              patient_name: "Ravi Kumar",
              visit_type: "OP",
              department: "Cardiology",
              doctor_name: "Dr. Mehta",
              appointment_date: "2026-03-09T09:30:00",
              status: "scheduled",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 1, department_name: "Cardiology" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ id: 1, doctor_name: "Dr. Mehta" }] });
      }
      if (requestUrl.includes("/api/registration/consents")) {
        return jsonResponse({ consents: [] });
      }
      if (requestUrl.includes("/api/registration/insurance")) {
        return jsonResponse({ verifications: [] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RegistrationDeskPage mode="appointment-in" selectedPatient={null} setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Patient Search & Appointment Intake");
    expect(container.textContent).toContain("Schedule Appointment");
    expect(container.textContent).toContain("Token #7");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

test("shows an empty-departments fallback when no departments are returned", async () => {
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({ appointments: [] });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [] });
      }
      if (requestUrl.includes("/api/registration/consents")) {
        return jsonResponse({ consents: [] });
      }
      if (requestUrl.includes("/api/registration/insurance")) {
        return jsonResponse({ verifications: [] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RegistrationDeskPage mode="appointment-in" selectedPatient={null} setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("No Departments Available");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
  test("renders appointment out desk with completion actions", async () => {
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 2,
              token_no: 8,
              patient_name: "Sita Rai",
              visit_type: "OP",
              department: "Neurology",
              doctor_name: "Dr. Sharma",
              appointment_date: "2026-03-09T11:00:00",
              status: "checked_in",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 2, department_name: "Neurology" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ id: 2, doctor_name: "Dr. Sharma" }] });
      }
      if (requestUrl.includes("/api/registration/consents")) {
        return jsonResponse({ consents: [] });
      }
      if (requestUrl.includes("/api/registration/insurance")) {
        return jsonResponse({ verifications: [] });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<RegistrationDeskPage mode="appointment-out" selectedPatient={null} setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Token #8");
    expect(container.textContent).toContain("Complete");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
