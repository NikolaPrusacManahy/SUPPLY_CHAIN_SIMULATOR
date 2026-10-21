import { TRUCK_TYPES } from './trucks.js';

// Things that go wrong during a game. They are generated from the game seed,
// so the same seed always brings the same troubles.
export const FACTORY_REPAIR = { cost: 800, paidDays: 1, unpaidDays: 5 };

// Picks `count` start days spread over the game (one per slot), between day 6 and maxDays - 5
function spreadDays(rng, maxDays, count, length) {
  const first = 6;
  const slot = Math.floor((maxDays - 5 - first) / count);
  return Array.from({ length: count }, (_, i) => first + i * slot + Math.floor(rng() * Math.max(1, slot - length)));
}

export function generateIncidents(rng, maxDays) {
  const incidents = [];
  let id = 0;

  for (const start of spreadDays(rng, maxDays, 2, 3)) {
    const days = 1 + Math.floor(rng() * 3); // repaired by itself in 1-3 days
    incidents.push({ id: id++, kind: 'supplier', target: 'supplier', startDay: start, endDay: start + days - 1 });
  }

  for (const start of spreadDays(rng, maxDays, 2, FACTORY_REPAIR.unpaidDays)) {
    incidents.push({ id: id++, kind: 'factory', target: 'factory', startDay: start,
                     endDay: start + FACTORY_REPAIR.unpaidDays - 1, paid: false });
  }

  const types = Object.keys(TRUCK_TYPES);
  for (const start of spreadDays(rng, maxDays, 2, 4)) {
    const truck = types[Math.floor(rng() * types.length)];
    const days = 2 + Math.floor(rng() * 3); // out of service for 2-4 days
    incidents.push({ id: id++, kind: 'trucks', target: truck, startDay: start, endDay: start + days - 1 });
  }

  return incidents.sort((a, b) => a.startDay - b.startDay);
}

export function describeIncident(incident) {
  switch (incident.kind) {
    case 'supplier': return 'Supplier damaged: no raw material is shipped';
    case 'factory': return incident.paid ? 'Factory repair in progress' : 'Factory breakdown: production stopped';
    default: return `${TRUCK_TYPES[incident.target].plural} out of service: deliveries wait at the depot`;
  }
}
