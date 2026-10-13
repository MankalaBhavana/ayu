import { act } from "react";
import { createRoot } from "react-dom/client";
import OpQueuePage from "./OpQueuePage";

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

describe("OpQueuePage", () => {
  test("renders OP queue dashboard and board columns", async () => {
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 1,
              patient_id: "PT-001",
              patient_name: "Asha Sharma",
              visit_type: "OP",
              appointment_date: "2026-06-10 09:30:00",
              status: "checked_in",
              token_no: 12,
              doctor_name: "Dr. Kumar",
              department: "General",
              age: "30",
              gender: "F",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 1, department_name: "General" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ id: 1, doctor_name: "Dr. Kumar", department: "General" }] });
      }
      if (requestUrl.includes("/api/op/summary")) {
        return jsonResponse({
          date: "2026-06-10",
          total_appointments: 1,
          follow_ups: 0,
          active_queue: 1,
          no_shows: 0,
          reminders_sent: 0,
          available_doctors: 1,
        });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OpQueuePage setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("OP Queue Management");
    expect(container.textContent).toContain("Asha Sharma");
    expect(container.textContent).toContain("Doctors");
    expect(container.textContent).toContain("Waiting");
    expect(container.textContent).toContain("Clear");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("shows same-day future appointments as In Queue", async () => {
    const futureAppointmentDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) {
        return jsonResponse({
          appointments: [
            {
              id: 2,
              patient_id: "PT-002",
              patient_name: "Ravi Nair",
              visit_type: "OP",
              appointment_date: futureAppointmentDate,
              status: "scheduled",
              token_no: 13,
              doctor_name: "Dr. Singh",
              department: "Orthopaedics",
              age: "40",
              gender: "M",
            },
          ],
        });
      }
      if (requestUrl.includes("/api/registration/departments")) {
        return jsonResponse({ departments: [{ id: 2, department_name: "Orthopaedics" }] });
      }
      if (requestUrl.includes("/api/op/doctor-schedules")) {
        return jsonResponse({ schedules: [{ id: 2, doctor_name: "Dr. Singh", department: "Orthopaedics" }] });
      }
      if (requestUrl.includes("/api/op/summary")) {
        return jsonResponse({
          date: futureAppointmentDate.slice(0, 10),
          total_appointments: 1,
          follow_ups: 0,
          active_queue: 1,
          no_shows: 0,
          reminders_sent: 0,
          available_doctors: 1,
        });
      }
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OpQueuePage setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Waiting");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("shows active same-day re-visits when no appointment is returned by the API", async () => {
    localStorage.setItem("hospai_op_queue", JSON.stringify([
      {
        token: "RA-123456",
        uhid: "PT-003",
        name: "Mira Patel",
        ageGender: "42 / F",
        visitType: "Re-visit",
        arrivedAt: "10:15 AM",
        status: "In Queue",
        mobile: "9876543210",
        createdAt: `${new Date().toLocaleDateString("en-CA")}T10:15:00.000Z`,
        doctor: "Dr. Rao",
        department: "Cardiology",
      },
    ]));
    global.fetch = vi.fn((url: string) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/api/appointments")) return jsonResponse({ appointments: [] });
      if (requestUrl.includes("/api/registration/departments")) return jsonResponse({ departments: [] });
      if (requestUrl.includes("/api/op/doctor-schedules")) return jsonResponse({ schedules: [] });
      if (requestUrl.includes("/api/op/summary")) return jsonResponse({});
      return jsonResponse({});
    }) as any;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<OpQueuePage setNotice={vi.fn()} />);
      await flush();
      await flush();
      await flush();
    });

    expect(container.textContent).toContain("Mira Patel");
    expect(container.textContent).toContain("RA-123456");
    expect(container.textContent).toContain("Re-visit");

    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.removeItem("hospai_op_queue");
  });
});
