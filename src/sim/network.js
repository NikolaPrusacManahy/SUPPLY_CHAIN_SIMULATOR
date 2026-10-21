// Map and network data, shared by the simulation (distances) and the 3D world (positions).
// Positions are [x, z] on the ground in world units. 1 unit = KM_PER_UNIT km.
export const KM_PER_UNIT = 3;

export const NODES = [
  // Supplier and factory are far out west; long roads make the truck choice matter
  { id: 'supplier', name: 'Supplier', type: 'supplier', pos: [-120, -50] },
  {
    id: 'factory', name: 'Factory', type: 'factory', pos: [-60, -50],
    upstream: 'supplier', route: [[-120, -50], [-60, -50]], // 180 km
    truck: 'lorry', processingDays: 1, // raw material takes a day to turn into products
  },
  {
    id: 'warehouse', name: 'Warehouse', type: 'warehouse', pos: [0, 5],
    upstream: 'factory', route: [[-60, -50], [-60, 5], [0, 5]], // 345 km
    truck: 'lorry',
  },
  {
    id: 'north', name: 'Northgate Shop', type: 'shop', pos: [30, -30],
    upstream: 'warehouse', route: [[0, 5], [0, -30], [30, -30]],
    truck: 'box', demand: 8,
  },
  {
    id: 'east', name: 'Riverside Shop', type: 'shop', pos: [35, 10],
    upstream: 'warehouse', route: [[0, 5], [35, 5], [35, 10]],
    truck: 'box', demand: 6,
  },
  {
    id: 'south', name: 'Hillcrest Shop', type: 'shop', pos: [20, 45],
    upstream: 'warehouse', route: [[0, 5], [0, 45], [20, 45]],
    truck: 'box', demand: 10,
  },
];

export function routeLength(route) {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  }
  return total;
}
