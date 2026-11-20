// Core math, 1e7 scientific notation rule, crit multi-exponent, cost acceleration, rampage scaling

export const SCI_THRESHOLD = 1e7;

export function formatNum(value) {
  if (!Number.isFinite(value)) return "INF";
  const abs = Math.abs(value);
  if (abs > SCI_THRESHOLD) {
    return value.toExponential(2);
  }
  if (abs > 0 && abs < 0.01) {
    return value.toFixed(3);
  }
  if (Number.isInteger(value) || abs >= 100) {
    return Math.round(value).toLocaleString("en-US");
  }
  return Number(value.toFixed(2)).toLocaleString("en-US");
}

// Base crit multiplier is 1.5 (150%).
// For k crits triggered in a single damage calculation: Multiplier = 1.5^(1.06^k)
export function calcCritMultiplier(critHits) {
  if (critHits <= 0) return 1.0;
  const exponent = Math.pow(1.06, critHits);
  return Math.pow(1.5, exponent);
}

// Roll crit hits for a single damage calculation when critRate can exceed 1.0 (100%).
// Example: 4.0 (400%) -> up to 4 hits; fractional part rolls probabilistically.
export function rollCritHits(critRate) {
  if (critRate <= 0) return 0;
  const maxHits = Math.ceil(critRate);
  let hits = 0;
  for (let i = 0; i < maxHits; i++) {
    const remaining = critRate - i;
    const prob = remaining >= 1 ? 1 : remaining;
    if (Math.random() < prob) {
      hits += 1;
    }
  }
  return hits;
}

// Accelerating cost multiplier:
// Base increase per level is +0.01, and every 5 levels adds +0.1.
export function getAcceleratedMultiplier(level, baseRate = 1.15, mitigation = 0) {
  const lv = Math.max(0, level);
  const stepGain = Math.max(0.002, 0.01 - mitigation);
  const milestoneBonus = Math.floor(lv / 5) * 0.1;
  return baseRate + lv * stepGain + milestoneBonus;
}

export function calcAcceleratedCost(baseCost, level, baseRate = 1.15, mitigation = 0) {
  let cost = baseCost;
  for (let i = 0; i < level; i++) {
    const mult = getAcceleratedMultiplier(i, baseRate, mitigation);
    cost *= mult;
  }
  return Math.max(1, Math.round(cost));
}

// Rampage Wave score multiplier: HP^((Rampage Level / 20) + 1)
// Guard against extreme overflow in JS float while preserving exponential feel
export function calcRampageScoreMultiplier(enemyHp, rampageLevel) {
  if (rampageLevel <= 0) return 1;
  const exp = rampageLevel / 20 + 1;
  const safeHp = Math.max(2, enemyHp);
  const log10Val = exp * Math.log10(safeHp);
  if (log10Val > 300) {
    // Represent large powers cleanly as scientific value
    const mantissa = Math.pow(10, log10Val - Math.floor(log10Val));
    return mantissa * Math.pow(10, Math.min(300, Math.floor(log10Val)));
  }
  return Math.pow(safeHp, exp);
}
