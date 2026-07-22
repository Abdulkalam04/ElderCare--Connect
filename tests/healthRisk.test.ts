import { describe, expect, it } from "vitest";
import {
  RiskInputSchema,
  calculateHealthRiskScreening,
  compareHealthRiskWithPrevious,
  getHealthRiskFallbackText,
  type RiskInput,
} from "@/lib/healthRisk";
const baseInput: RiskInput = {
  age: 45,
  bpSystolic: 118,
  bpDiastolic: 75,
  sugarLevel: 90,
  heartRate: 72,
  activityLevel: "moderate",
  oxygenLevel: 98,
  sourceMode: "manual",
  sourceVitalIds: [],
};
describe("health-risk screening", () => {
  it("returns a low-risk result for readings in the normal range", () => {
    const result = calculateHealthRiskScreening(baseInput);
    expect(result).toMatchObject({
      risk_level: "low",
      risk_score: 5,
      urgent: false,
      warning_flags: [],
    });
  });
  it("returns a medium-risk result when several non-urgent factors are present", () => {
    const result = calculateHealthRiskScreening({
      ...baseInput,
      age: 68,
      bpSystolic: 135,
      bpDiastolic: 82,
      sugarLevel: 105,
    });
    expect(result.risk_level).toBe("medium");
    expect(result.urgent).toBe(false);
    expect(result.warning_flags).toContain("Blood pressure is above the usual target range");
    expect(result.warning_flags).toContain("Fasting blood sugar is slightly elevated");
  });
  it("marks critical readings as urgent and high risk", () => {
    const result = calculateHealthRiskScreening({
      ...baseInput,
      age: 70,
      bpSystolic: 185,
      bpDiastolic: 125,
      sugarLevel: 320,
      heartRate: 135,
      activityLevel: "low",
      oxygenLevel: 88,
    });
    expect(result.risk_level).toBe("high");
    expect(result.risk_score).toBe(100);
    expect(result.urgent).toBe(true);
    expect(result.warning_flags).toEqual(
      expect.arrayContaining([
        "Very high blood pressure reading",
        "Very high blood sugar reading",
        "Very fast heart-rate reading",
        "Very low oxygen saturation reading",
      ]),
    );
  });
  it("does not duplicate warning flags", () => {
    const result = calculateHealthRiskScreening({
      ...baseInput,
      bpSystolic: 180,
      bpDiastolic: 120,
      activityLevel: "low",
    });
    expect(new Set(result.warning_flags).size).toBe(result.warning_flags.length);
  });
  it("rejects a systolic reading that is not above the diastolic reading", () => {
    const parsed = RiskInputSchema.safeParse({
      ...baseInput,
      bpSystolic: 70,
      bpDiastolic: 80,
    });
    expect(parsed.success).toBe(false);
  });
  it.each([
    [{ age: 80 }, "low"],
    [{ age: 60 }, "low"],
    [{ bpSystolic: 165, bpDiastolic: 100 }, "medium"],
    [{ bpSystolic: 145, bpDiastolic: 90 }, "low"],
    [{ bpSystolic: 75, bpDiastolic: 45 }, "high"],
    [{ bpSystolic: 85, bpDiastolic: 55 }, "medium"],
    [{ sugarLevel: 50 }, "high"],
    [{ sugarLevel: 65 }, "medium"],
    [{ sugarLevel: 220 }, "medium"],
    [{ sugarLevel: 130 }, "low"],
    [{ heartRate: 35 }, "high"],
    [{ heartRate: 45 }, "low"],
    [{ heartRate: 105 }, "low"],
    [{ heartRate: 95 }, "low"],
    [{ oxygenLevel: 91 }, "medium"],
    [{ oxygenLevel: 94 }, "low"],
    [{ activityLevel: "high" as const }, "low"],
  ])("covers screening boundary branch %o", (changes, expectedLevel) => {
    const result = calculateHealthRiskScreening({ ...baseInput, ...changes });
    expect(result.risk_level).toBe(expectedLevel);
  });
  it("covers fallback wording for high, medium, and low non-urgent results", () => {
    expect(
      getHealthRiskFallbackText({
        risk_level: "high",
        risk_score: 70,
        warning_flags: [],
        urgent: false,
      }).summary,
    ).toContain("timely medical review");
    expect(
      getHealthRiskFallbackText({
        risk_level: "medium",
        risk_score: 35,
        warning_flags: [],
        urgent: false,
      }).summary,
    ).toContain("outside the usual range");
    expect(
      getHealthRiskFallbackText({
        risk_level: "low",
        risk_score: 5,
        warning_flags: [],
        urgent: false,
      }).summary,
    ).toContain("do not show a major warning");
  });
  it("uses the urgent fallback wording for critical readings", () => {
    const text = getHealthRiskFallbackText({
      risk_level: "high",
      risk_score: 95,
      warning_flags: ["Very low oxygen saturation reading"],
      urgent: true,
    });
    expect(text.summary).toContain("checked promptly");
    expect(text.recommendations).toContain("use SOS or call emergency services now");
  });
});
describe("health-risk comparison", () => {
  it("marks the first screening as having no previous result", () => {
    const comparison = compareHealthRiskWithPrevious(
      {
        risk_level: "medium",
        risk_score: 35,
        warning_flags: ["High blood pressure reading"],
        urgent: false,
      },
      null,
    );
    expect(comparison.trend).toBe("no_previous");
    expect(comparison.new_warning_flags).toEqual(["High blood pressure reading"]);
  });
  it("detects an increased score and newly added warning flags", () => {
    const comparison = compareHealthRiskWithPrevious(
      {
        risk_level: "high",
        risk_score: 65,
        warning_flags: ["High blood pressure reading", "Low oxygen saturation reading"],
        urgent: false,
      },
      {
        id: "previous-id",
        risk_score: 35,
        warning_flags: ["High blood pressure reading"],
      },
    );
    expect(comparison.trend).toBe("increased");
    expect(comparison.score_delta).toBe(30);
    expect(comparison.new_warning_flags).toEqual(["Low oxygen saturation reading"]);
  });
  it("marks small score changes as stable and handles a previous null score", () => {
    const stable = compareHealthRiskWithPrevious(
      { risk_level: "medium", risk_score: 34, warning_flags: [], urgent: false },
      { id: "previous-id", risk_score: 31, warning_flags: null },
    );
    expect(stable.trend).toBe("stable");
    const missingScore = compareHealthRiskWithPrevious(
      { risk_level: "low", risk_score: 10, warning_flags: [], urgent: false },
      { id: "previous-id", risk_score: null, warning_flags: [] },
    );
    expect(missingScore.trend).toBe("no_previous");
    expect(missingScore.previous_assessment_id).toBe("previous-id");
  });
  it("detects improved scores and resolved warning flags", () => {
    const comparison = compareHealthRiskWithPrevious(
      {
        risk_level: "low",
        risk_score: 10,
        warning_flags: [],
        urgent: false,
      },
      {
        id: "previous-id",
        risk_score: 45,
        warning_flags: ["High blood pressure reading"],
      },
    );
    expect(comparison.trend).toBe("improved");
    expect(comparison.resolved_warning_flags).toEqual(["High blood pressure reading"]);
  });
});
