import { ENCOUNTER_TRANSITIONS } from "../src/encounters/encounter-state";
describe("encounter state machine", () => {
  it("supports the normal clinic path", () => {
    expect(ENCOUNTER_TRANSITIONS.REGISTERED).toContain("WAITING_TRIAGE");
    expect(ENCOUNTER_TRANSITIONS.WAITING_TRIAGE).toContain("IN_TRIAGE");
    expect(ENCOUNTER_TRANSITIONS.IN_TRIAGE).toContain("WAITING_DOCTOR");
    expect(ENCOUNTER_TRANSITIONS.WAITING_DOCTOR).toContain("IN_CONSULTATION");
    expect(ENCOUNTER_TRANSITIONS.IN_CONSULTATION).toContain("COMPLETED");
  });
  it("makes terminal states terminal", () => {
    expect(ENCOUNTER_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ENCOUNTER_TRANSITIONS.CANCELLED).toEqual([]);
  });
});
