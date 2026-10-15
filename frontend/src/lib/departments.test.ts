import { describe, expect, test, vi } from "vitest";
import { notifyDepartmentsChanged, onDepartmentsChanged, toDepartmentNames } from "./departments";

describe("shared department list", () => {
  test("notifies subscribers when departments change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = onDepartmentsChanged(listener);

    notifyDepartmentsChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notifyDepartmentsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("normalises department records into sorted, unique names", () => {
    expect(
      toDepartmentNames([
        { id: 3, department_name: " Orthopaedics " },
        { id: 1, department_name: "Cardiology" },
        { id: 2, department_name: "" },
        { id: 4, department_name: "Cardiology" },
      ])
    ).toEqual(["Cardiology", "Orthopaedics"]);
  });
});
