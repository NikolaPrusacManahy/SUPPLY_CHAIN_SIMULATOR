import { TRUCK_TYPES } from './trucks.js';

// Things that go wrong during a game. They are generated from the game seed,
// so the same seed always brings the same troubles.
export const FACTORY_REPAIR = { cost: 2000, paidDays: 1, unpaidDays: 10 };
export const SUPPLIER_DAYS_OFF = 6;     // when the supplier's workers are overworked
export const ROADWORKS_DAYS = 7;
export const STORM_SPEED = 0.5;         // trucks drive at half speed in a storm

// Picks `count` start days spread over the game (one per slot), between day 6 and maxDays - 5
function spreadDays(rng, maxDays, count, length) {
  const first = 6;
  const slot = Math.floor((maxDays - 5 - first) / count);
  return Array.from({ length: count }, (_, i) => first + i * slot + Math.floor(rng() * Math.max(1, slot - length)));
}

// routes: stage ids that have a road from their upstream building
export function generateIncidents(rng, maxDays, routes) {
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
  for (const start of spreadDays(rng, maxDays, 2, 9)) {
    const truck = types[Math.floor(rng() * types.length)];
    const days = 7 + Math.floor(rng() * 3); // out of service for 7-9 days
    incidents.push({ id: id++, kind: 'trucks', target: truck, startDay: start, endDay: start + days - 1 });
  }

  for (const start of spreadDays(rng, maxDays, 2, 3)) {
    const days = 2 + Math.floor(rng() * 2); // storms last 2-3 days
    incidents.push({ id: id++, kind: 'storm', target: null, startDay: start, endDay: start + days - 1 });
  }

  // Roadworks: rare, once per game, somewhere in the middle of one road
  const [start] = spreadDays(rng, maxDays, 1, ROADWORKS_DAYS);
  const route = routes[Math.floor(rng() * routes.length)];
  incidents.push({ id: id++, kind: 'roadworks', target: route, at: 0.35 + rng() * 0.3,
                   startDay: start, endDay: start + ROADWORKS_DAYS - 1 });

  return incidents.sort((a, b) => a.startDay - b.startDay);
}

export const INCIDENT_ICONS = { supplier: '🔥', overworked: '😓', factory: '🔥', trucks: '🚚', storm: '⛈️', roadworks: '🚧' };

export function describeIncident(incident, stageName = (id) => id) {
  switch (incident.kind) {
    case 'supplier': return 'Supplier damaged: no raw material is shipped';
    case 'overworked': return 'Supplier workers overworked: days off, nothing is shipped';
    case 'factory': return incident.paid ? 'Factory repair in progress' : 'Factory breakdown: production stopped';
    case 'trucks': return `${TRUCK_TYPES[incident.target].plural} out of service: deliveries wait at the depot`;
    case 'storm': return 'Storm: all trucks drive at half speed';
    default: return `Roadworks on the road to ${stageName(incident.target)}: trucks queue at the works`;
  }
}
