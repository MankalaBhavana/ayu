import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import OpPage from "./OpPage";

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

describe("OpPage", () => {
  test("renders OP desk scheduling and queue controls", async () => {
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/op/summary")) {
        return jsonResponse({
          total_appointments: 4,
          follow_ups: 1,
          active_queue: 2,
          no_shows: 1,
          reminders_sent: 3,
          available_doctors: 2,
        });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({
          schedules: [
            {
              id: 1,
              doctor_name: "Dr. Mehta",
              department: "Cardiology",
              schedule_date: "2026-03-04",
              start_time: "09:00",
              end_time: "13:00",
              slot_capacity: 8,
              status: "available",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 11,
              patient_name: "Ravi Kumar",
              visit_type: "OP",
              department: "Cardiology",
              doctor_name: "Dr. Mehta",
              appointment_date: "2026-03-04 09:30:00",
              status: "scheduled",
              token_no: 3,
              appointment_kind: "follow_up",
              reminder_sent_at: "2026-03-04T08:00:00",
              no_show_marked: 0,
            },
          ],
        });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({
          departments: [
            { id: 1, department_name: "Cardiology" },
            { id: 2, department_name: "Pediatrics" },
          ],
        });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OpPage setNotice={vi.fn()} canEdit={true} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("OP Desk");
    expect(container.textContent).toContain("Manage Departments");
    expect(container.textContent).toContain("Cardiology");
    expect(container.textContent).toContain("Pediatrics");
    expect(container.textContent).toContain("Doctor Schedule");
    expect(container.textContent).not.toContain("Reminders Sent");
    expect(container.querySelector('input[aria-label="Doctor name"]')).toBeTruthy();

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("allows adding a department and triggers reload", async () => {
    let departments = [{ id: 1, department_name: "Cardiology" }];
    const postMock = vi.fn().mockImplementation(() => jsonResponse({ success: true }));

    global.fetch = vi.fn((url: string, options?: any) => {
      const requestUrl = String(url);
      const method = options?.method || "GET";

      if (requestUrl.includes("/api/op/summary")) {
        return jsonResponse({
          total_appointments: 0,
          follow_ups: 0,
          active_queue: 0,
          no_shows: 0,
        });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [] });
      }
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({ appointments: [] });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        if (method === "POST") {
          const body = JSON.parse(options.body);
          departments.push({ id: departments.length + 1, department_name: body.department_name });
          postMock();
          return jsonResponse({ success: true });
        }
        return jsonResponse({ departments });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OpPage setNotice={vi.fn()} canEdit={true} />);
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Cardiology");
    expect(container.textContent).not.toContain("Neurology");

    const input = container.querySelector('input[aria-label="Department name"]') as HTMLInputElement;
    const form = input.closest("form") as HTMLFormElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "Neurology" } });
      await flush();
    });

    await act(async () => {
      fireEvent.submit(form);
      await flush();
      await flush();
      await flush();
    });

    expect(postMock).toHaveBeenCalled();
    expect(container.textContent).toContain("Neurology");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
