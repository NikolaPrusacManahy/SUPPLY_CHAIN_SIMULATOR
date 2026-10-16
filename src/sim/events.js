const EVENT_TYPES = [
  { name: 'Holiday rush', multiplier: 1.8, duration: 6 },
  { name: 'Viral product spike', multiplier: 2.5, duration: 3 },
  { name: 'Local recession', multiplier: 0.6, duration: 7 },
];

// Splits the game into equal slots and places one random event in each,
// so events never overlap and never start in the first 5 days.
export function generateEvents(rng, maxDays, count = 3) {
  const events = [];
  const slot = Math.floor(maxDays / count);
  for (let i = 0; i < count; i++) {
    const type = EVENT_TYPES[Math.floor(rng() * EVENT_TYPES.length)];
    const room = Math.max(1, slot - type.duration - 5);
    const startDay = i * slot + 5 + Math.floor(rng() * room);
    events.push({ ...type, startDay, endDay: startDay + type.duration - 1 });
  }
  return events;
}
