export function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
}

// Bullwhip ratio = variance of a stage's orders / variance of customer demand.
// 1 means orders are as stable as demand; above 1 means the stage amplifies swings.
export function bullwhipRatio(history, stageId) {
  const demandVar = variance(history.map((h) => h.demand));
  if (demandVar === 0) return 0;
  return variance(history.map((h) => h[stageId].ordered)) / demandVar;
}