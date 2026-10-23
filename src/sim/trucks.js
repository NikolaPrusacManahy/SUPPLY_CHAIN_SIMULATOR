// Truck types the player can choose per delivery route.
// speed = km per day, loadDays = time spent loading at the depot before leaving.
// Cost is per trip, whether the truck is full or not.
export const TRUCK_TYPES = {
  van:   { id: 'van',   name: 'Van',       plural: 'Vans',        speed: 200, capacity: 15,  tripCost: 15, loadDays: 0.25 },
  box:   { id: 'box',   name: 'Box truck', plural: 'Box trucks',  speed: 100, capacity: 40,  tripCost: 30, loadDays: 0.5 },
  lorry: { id: 'lorry', name: 'Lorry',     plural: 'Lorries',     speed: 60,  capacity: 100, tripCost: 55, loadDays: 1 },
};

// Loading and driving time for one trip, in days
export function tripTimes(distanceKm, truckId) {
  const truck = TRUCK_TYPES[truckId];
  return { load: truck.loadDays, drive: distanceKm / truck.speed };
}

// Whole days from sending goods to having them in stock
// (a truck that arrives during a day is unloaded at the start of the next one)
// loadFactor < 1 when the sending building has a loading dock
export function travelDays(distanceKm, truckId, loadFactor = 1) {
  const { load, drive } = tripTimes(distanceKm, truckId);
  return Math.max(1, Math.ceil(load * loadFactor + drive));
}
