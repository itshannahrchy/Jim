// Calorie maths kept in code (not left to the model) so it is consistent.

export const SAFE_MIN_KCAL = 1200;
export const ASSUMED_WEIGHT_KG = 60;

const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Turns "30s", "35-44", "early 40s", "38" into a representative age. */
export function ageFromBracket(bracket: string | null | undefined): number | null {
  if (!bracket) return null;
  const s = bracket.toLowerCase();
  const range = s.match(/(\d{2})\s*[-–to]+\s*(\d{2})/);
  if (range) return Math.round((+range[1] + +range[2]) / 2);
  const decade = s.match(/(\d)0\s*'?s/);
  if (decade) {
    const base = +decade[1] * 10;
    if (s.includes("early")) return base + 2;
    if (s.includes("late")) return base + 8;
    if (s.includes("mid")) return base + 5;
    return base + 5;
  }
  const plain = s.match(/\b(\d{2})\b/);
  return plain ? +plain[1] : null;
}

/** Mifflin-St Jeor (female) × activity factor. Null if inputs are missing. */
export function maintenanceKcal(p: {
  weight_kg?: number | null;
  height_cm?: number | null;
  age_bracket?: string | null;
  activity_level?: string | null;
}): number | null {
  const age = ageFromBracket(p.age_bracket);
  if (!p.weight_kg || !p.height_cm || !age) return null;
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * age - 161;
  const factor = ACTIVITY_FACTORS[p.activity_level ?? "moderate"] ?? 1.55;
  return Math.round((bmr * factor) / 10) * 10;
}

/** calories ≈ MET × weight_kg × hours */
export function metCalories(met: number, weightKg: number, durationMin: number): number {
  return Math.round(met * weightKg * (durationMin / 60));
}
