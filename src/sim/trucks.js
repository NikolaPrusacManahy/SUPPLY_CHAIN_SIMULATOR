// Truck types the player can choose per delivery route.
// speed = km per day. Cost is per trip, whether the truck is full or not.
export const TRUCK_TYPES = {
  van:   { id: 'van',   name: 'Van',       speed: 200, capacity: 15,  tripCost: 15 },
  box:   { id: 'box',   name: 'Box truck', speed: 100, capacity: 40,  tripCost: 30 },
  lorry: { id: 'lorry', name: 'Lorry',     speed: 60,  capacity: 100, tripCost: 55 },
};

// Whole days a trip takes (goods are unloaded at the start of the next day)
export function travelDays(distanceKm, truckId) {
  return Math.max(1, Math.ceil(distanceKm / TRUCK_TYPES[truckId].speed));
}
