// Difficulty levels chosen on the start screen. Normal is the balanced game from Sessions 4 and 5.
// incidents = how many of each problem a game has; workLimit scales the supplier's workload limit;
// daysOff = how long the supplier's overworked workers stay at home;
// warnDays = how many days ahead storms, roadworks, demand events and empty shops are announced.
export const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Easy', startCash: 15000, workLimit: 1.1, daysOff: 3, warnDays: 3,
    incidents: { supplier: 1, factory: 1, trucks: 1, storm: 1, roadworks: 1 },
    summary: '€15,000 to start, fewer problems, shorter supplier days off, 3 days of warning',
  },
  normal: {
    id: 'normal', name: 'Normal', startCash: 12000, workLimit: 1, daysOff: 6, warnDays: 2,
    incidents: { supplier: 2, factory: 2, trucks: 2, storm: 2, roadworks: 1 },
    summary: '€12,000 to start, the balanced game, 2 days of warning',
  },
  hard: {
    id: 'hard', name: 'Hard', startCash: 10000, workLimit: 0.9, daysOff: 6, warnDays: 1,
    incidents: { supplier: 3, factory: 3, trucks: 3, storm: 3, roadworks: 2 },
    summary: '€10,000 to start, more problems, a tighter supplier, 1 day of warning',
  },
};
