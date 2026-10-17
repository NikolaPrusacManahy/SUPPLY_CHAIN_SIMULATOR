export function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
}

// Bullwhip ratio = variance of a building's orders / variance of the demand it serves.
// Shops are compared with their own customers; other buildings with all customers combined.
// 1 means orders are as stable as demand; above 1 means the building amplifies swings.
export function bullwhipRatio(history, stage) {
  const demand = history.map((h) => (stage.type === 'shop' ? h[stage.id].demand : h.demand));
  const demandVar = variance(demand);
  if (demandVar === 0) return 0;
  return variance(history.map((h) => h[stage.id].ordered)) / demandVar;
}