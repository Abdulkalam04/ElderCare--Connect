import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
export const RiskInputSchema = z
  .object({
    age: z.number().int().min(18).max(125),
    bpSystolic: z.number().int().min(50).max(300),
    bpDiastolic: z.number().int().min(30).max(200),
    sugarLevel: z.number().int().min(20).max(800),
    heartRate: z.number().int().min(20).max(250),
    activityLevel: z.enum(["low", "moderate", "high"]),
    weight: z.number().min(20).max(400).optional(),
    oxygenLevel: z.number().int().min(50).max(100).optional(),
    wellnessData: z.string().trim().max(1000).optional(),
    sourceMode: z.enum(["manual", "latest_vitals"]).default("manual"),
    sourceVitalIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .refine((value) => value.bpSystolic > value.bpDiastolic, {
    message: "Systolic blood pressure must be higher than diastolic blood pressure.",
    path: ["bpSystolic"],
  });
export type RiskInput = z.infer<typeof RiskInputSchema>;
export type RiskAssessment = Database["public"]["Tables"]["health_risk_assessments"]["Row"];
export type RiskTrend = "no_previous" | "increased" | "improved" | "stable";
export type RiskComparison = {
  previous_assessment_id: string | null;
  previous_score: number | null;
  score_delta: number | null;
  trend: RiskTrend;
  new_warning_flags: string[];
  resolved_warning_flags: string[];
};
export type RiskScreening = {
  risk_level: "low" | "medium" | "high";
  risk_score: number;
  warning_flags: string[];
  urgent: boolean;
};
export type RiskFallbackText = {
  summary: string;
  recommendations: string;
};
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function calculateHealthRiskScreening(data: RiskInput): RiskScreening {
  let score = 5;
  const flags: string[] = [];
  let urgent = false;
  if (data.age >= 80) score += 15;
  else if (data.age >= 65) score += 10;
  else if (data.age >= 55) score += 5;
  if (data.bpSystolic >= 180 || data.bpDiastolic >= 120) {
    score += 40;
    urgent = true;
    flags.push("Very high blood pressure reading");
  } else if (data.bpSystolic >= 160 || data.bpDiastolic >= 100) {
    score += 25;
    flags.push("High blood pressure reading");
  } else if (data.bpSystolic >= 140 || data.bpDiastolic >= 90) {
    score += 15;
    flags.push("Elevated blood pressure reading");
  } else if (data.bpSystolic >= 130 || data.bpDiastolic >= 80) {
    score += 8;
    flags.push("Blood pressure is above the usual target range");
  }
  if (data.bpSystolic < 80 || data.bpDiastolic < 50) {
    score += 40;
    urgent = true;
    flags.push("Very low blood pressure reading");
  } else if (data.bpSystolic < 90 || data.bpDiastolic < 60) {
    score += 20;
    flags.push("Low blood pressure reading");
  }
  if (data.sugarLevel < 54) {
    score += 40;
    urgent = true;
    flags.push("Very low blood sugar reading");
  } else if (data.sugarLevel < 70) {
    score += 20;
    flags.push("Low blood sugar reading");
  } else if (data.sugarLevel >= 300) {
    score += 40;
    urgent = true;
    flags.push("Very high blood sugar reading");
  } else if (data.sugarLevel >= 200) {
    score += 25;
    flags.push("High blood sugar reading");
  } else if (data.sugarLevel >= 126) {
    score += 15;
    flags.push("Fasting blood sugar is above the usual range");
  } else if (data.sugarLevel >= 100) {
    score += 8;
    flags.push("Fasting blood sugar is slightly elevated");
  }
  if (data.heartRate < 40 || data.heartRate > 130) {
    score += 40;
    urgent = true;
    flags.push(
      data.heartRate < 40 ? "Very slow heart-rate reading" : "Very fast heart-rate reading",
    );
  } else if (data.heartRate < 50 || data.heartRate > 100) {
    score += 18;
    flags.push(data.heartRate < 50 ? "Slow heart-rate reading" : "Fast heart-rate reading");
  } else if (data.heartRate > 90) {
    score += 6;
  }
  if (data.oxygenLevel !== undefined) {
    if (data.oxygenLevel < 90) {
      score += 45;
      urgent = true;
      flags.push("Very low oxygen saturation reading");
    } else if (data.oxygenLevel < 92) {
      score += 30;
      flags.push("Low oxygen saturation reading");
    } else if (data.oxygenLevel < 95) {
      score += 15;
      flags.push("Oxygen saturation is below the usual range");
    }
  }
  if (data.activityLevel === "low") {
    score += 10;
    flags.push("Low daily activity level");
  } else if (data.activityLevel === "high") {
    score -= 3;
  }
  const riskScore = clamp(Math.round(score), 5, 100);
  const riskLevel: RiskScreening["risk_level"] =
    urgent || riskScore >= 60 ? "high" : riskScore >= 25 ? "medium" : "low";
  return {
    risk_level: riskLevel,
    risk_score: riskScore,
    warning_flags: [...new Set(flags)],
    urgent,
  };
}
export function getHealthRiskFallbackText(screening: RiskScreening): RiskFallbackText {
  if (screening.urgent) {
    return {
      summary:
        "One or more readings are in a range that should be checked promptly. Repeat the measurement if it is safe to do so and seek urgent medical help when symptoms are severe or the reading remains abnormal.",
      recommendations: [
        "Do not rely on this screening result alone.",
        "Repeat the reading with the device positioned correctly, unless delaying care could be unsafe.",
        "If there is chest pain, severe breathing difficulty, fainting, new confusion, weakness on one side, or another severe symptom, use SOS or call emergency services now.",
        "Contact a doctor promptly about the abnormal reading.",
      ].join("\n"),
    };
  }
  if (screening.risk_level === "high") {
    return {
      summary:
        "Several readings need timely medical review. This is a screening result and not a diagnosis.",
      recommendations: [
        "Recheck unusual measurements and record the result.",
        "Arrange a medical review soon, especially if the readings remain abnormal.",
        "Continue prescribed medicines unless a clinician tells you otherwise.",
      ].join("\n"),
    };
  }
  if (screening.risk_level === "medium") {
    return {
      summary:
        "Some readings are outside the usual range or other risk factors are present. Continue monitoring and discuss repeated abnormalities with a healthcare professional.",
      recommendations: [
        "Monitor the readings regularly and note any symptoms.",
        "Stay hydrated, eat regularly, and follow the care plan provided by the doctor.",
        "Contact a healthcare professional if values remain abnormal or symptoms develop.",
      ].join("\n"),
    };
  }
  return {
    summary:
      "The entered readings do not show a major warning in this basic screening. Continue routine monitoring because a normal result does not rule out illness.",
    recommendations: [
      "Continue regular monitoring and routine medical checkups.",
      "Keep taking prescribed medicines as directed.",
      "Maintain suitable activity, hydration, nutrition, and sleep.",
    ].join("\n"),
  };
}
export function compareHealthRiskWithPrevious(
  screening: RiskScreening,
  previous: Pick<RiskAssessment, "id" | "risk_score" | "warning_flags"> | null,
): RiskComparison {
  if (!previous || previous.risk_score === null) {
    return {
      previous_assessment_id: previous?.id ?? null,
      previous_score: previous?.risk_score ?? null,
      score_delta: null,
      trend: "no_previous",
      new_warning_flags: screening.warning_flags,
      resolved_warning_flags: [],
    };
  }
  const previousFlags = new Set(previous.warning_flags ?? []);
  const currentFlags = new Set(screening.warning_flags);
  const delta = screening.risk_score - previous.risk_score;
  return {
    previous_assessment_id: previous.id,
    previous_score: previous.risk_score,
    score_delta: delta,
    trend: delta >= 5 ? "increased" : delta <= -5 ? "improved" : "stable",
    new_warning_flags: screening.warning_flags.filter((flag) => !previousFlags.has(flag)),
    resolved_warning_flags: [...previousFlags].filter((flag) => !currentFlags.has(flag)),
  };
}
