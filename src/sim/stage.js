import { TRUCK_TYPES, travelDays } from './trucks.js';

const SHOP_START_DAYS = 7.5; // shops open with about a week of stock
const STORAGE = { factory: 300, warehouse: 300, shop: 100 }; // units before overflow costs apply
const OVERFLOW_COST = 1; // per unit per day above the storage limit (10x normal)
const SUPPLIER_CAPACITY = 60;     // units a day
const SUPPLIER_WORK_LIMIT = 260;  // units shipped in 5 days before the workers need days off
const OUTLIER_LIMIT = 3;   // forecasts ignore anything above 3x the normal daily demand

// One building in the network: supplier, factory, warehouse or shop.
export class Stage {
  constructor({ id, name, type, distance = 0, truck = 'box', processingDays = 0, demand = 0,
                safetyDays = 1, holdingCost = 0.1, policy = 'forecast', alpha = 0.25 }) {
    Object.assign(this, { id, name, type, distance, truck, processingDays,
                          safetyDays, holdingCost, policy, alpha });
    this.infinite = type === 'supplier'; // unlimited raw material
    this.lostSales = type === 'shop';    // customers leave; businesses wait (backlog)
    this.shortageCost = this.lostSales ? 3 : 1;
    this.demandMean = demand;            // customer demand (shops only)
    this.broken = false;                 // set each day by the simulation (supplier/factory incidents)
    this.upgrades = {};                  // upgrade key -> true once bought
    this.recentShipped = [];             // supplier: units shipped on each of the last 5 days

    this.upstream = null;
    this.downstreams = [];
    this.expectedDemand = demand;
    this.forecast = demand;
    this.stock = 0;
    this.manualQty = 20;

    this.inTransit = [];   // trucks heading here: { qty, truck, sentOn, departAt, km, arrivedAt }
    this.waiting = 0;      // units ready to send here but stuck at the depot (truck type out of service)
    this.processing = [];  // factory only: { qty, readyAt }
    this.onOrder = 0;      // ordered upstream, not in stock yet
    this.owed = new Map();     // downstream id -> units ordered but not shipped yet (backlog)
    this.incoming = new Map(); // downstream id -> today's order

    this.lastOrder = 0;
    this.lastShipped = 0;
    this.lastSold = 0;
    this.lastLost = 0;
    this.lastDemand = 0;
    this.totalCost = 0;     // holding + shortage
    this.transportCost = 0; // trips paid for deliveries to this building
  }

  // Called once the network is linked and expected demand is known
  init(expectedDemand) {
    this.expectedDemand = expectedDemand;
    this.forecast = expectedDemand;
    this.manualQty = Math.round(expectedDemand);
    // Factory and warehouse start empty, so every unit has to come from the supplier.
    // Shops start with a few days of stock to sell while the first deliveries are on the way.
    this.stock = this.type === 'shop' ? Math.round(expectedDemand * SHOP_START_DAYS) : 0;
  }

  // Supplier: most it can ship per day (More workers upgrade: +50%)
  get dailyCapacity() {
    if (!this.infinite) return Infinity;
    return SUPPLIER_CAPACITY * (this.upgrades.workers ? 1.5 : 1);
  }

  // Supplier: units it can ship in 5 days before the workers need days off
  get workLimit() {
    return SUPPLIER_WORK_LIMIT * (this.upgrades.workers ? 1.5 : 1);
  }

  get workload() {
    return this.recentShipped.reduce((a, b) => a + b, 0);
  }

  // Storage space before the expensive overflow cost applies (Bigger storage: x2)
  get storageLimit() {
    const base = STORAGE[this.type] ?? Infinity;
    return base * (this.upgrades.storage ? 2 : 1);
  }

  // Loading dock: trucks leaving this building load 4x faster and trips cost 25% less
  get loadFactor() {
    return this.upgrades.dock ? 0.25 : 1;
  }

  get tripCostFactor() {
    return this.upgrades.dock ? 0.75 : 1;
  }

  get truckType() {
    return TRUCK_TYPES[this.truck];
  }

  // Days from placing an order to having the goods in stock
  get leadTime() {
    return this.upstream
      ? travelDays(this.distance, this.truck, this.upstream.loadFactor) + this.processingDays
      : 0;
  }

  targetFor(demand) {
    return Math.round(demand * (this.leadTime + 1 + this.safetyDays));
  }

  // forecast follows recent demand; the other policies use the fixed expected demand
  get targetStock() {
    return this.targetFor(this.policy === 'forecast' ? this.forecast : this.expectedDemand);
  }

  get backlog() {
    let total = 0;
    for (const qty of this.owed.values()) total += qty;
    return total;
  }

  get inventoryPosition() {
    return this.stock + this.onOrder - this.backlog;
  }

  get inTransitTotal() {
    return this.inTransit.reduce((sum, s) => sum + s.qty, 0);
  }

  // Unloads every truck that has reached this building (the simulation moves the trucks
  // and sets arrivedAt) and finishes production that is ready. Returns events for pop-ups.
  receive(time) {
    const events = [];
    const arrived = this.inTransit.filter((s) => s.arrivedAt !== null && s.arrivedAt <= time);
    this.inTransit = this.inTransit.filter((s) => !arrived.includes(s));
    for (const s of arrived) {
      if (this.processingDays > 0) {
        // Raw material: production starts when the truck arrives
        this.processing.push({ qty: s.qty, readyAt: s.arrivedAt + this.processingDays });
        events.push({ stageId: this.id, kind: 'raw', qty: s.qty });
      } else {
        this.stock += s.qty;
        this.onOrder -= s.qty;
        events.push({ stageId: this.id, kind: 'delivered', qty: s.qty });
      }
    }
    if (this.broken) return events; // a broken factory stops producing; goods wait in the queue
    const ready = this.processing.filter((p) => p.readyAt <= time);
    this.processing = this.processing.filter((p) => p.readyAt > time);
    for (const p of ready) {
      this.stock += p.qty;
      this.onOrder -= p.qty;
      events.push({ stageId: this.id, kind: 'produced', qty: p.qty });
    }
    return events;
  }

  // Shops: serve today's customers
  sell(demand) {
    const sold = Math.min(this.stock, demand);
    this.stock -= sold;
    this.lastDemand = demand;
    this.lastSold = sold;
    this.lastLost = demand - sold;
  }

  // Warehouse/factory/supplier: decide how much each downstream building gets today.
  // When stock is short it is shared in proportion to what each one is owed.
  allocate() {
    const owedNow = this.downstreams.map((d) => [d, (this.owed.get(d.id) ?? 0) + (this.incoming.get(d.id) ?? 0)]);
    this.lastDemand = [...this.incoming.values()].reduce((a, b) => a + b, 0);
    this.incoming.clear();

    const total = owedNow.reduce((sum, [, qty]) => sum + qty, 0);
    let available = this.infinite ? Math.min(total, this.dailyCapacity) : Math.min(this.stock, total);
    if (this.infinite && this.broken) available = 0; // damaged supplier ships nothing
    const plan = owedNow.map(([d, owed]) => ({ to: d, owed, qty: total ? Math.floor((available * owed) / total) : 0 }));

    // Hand out units lost to rounding, biggest remaining need first
    let left = available - plan.reduce((sum, p) => sum + p.qty, 0);
    plan.sort((a, b) => (b.owed - b.qty) - (a.owed - a.qty));
    for (const p of plan) {
      if (left <= 0) break;
      if (p.qty < p.owed) { p.qty++; left--; }
    }

    for (const p of plan) this.owed.set(p.to.id, p.owed - p.qty);
    if (!this.infinite) this.stock -= available;
    this.lastShipped = available;
    if (this.infinite) {
      this.recentShipped.push(available);
      if (this.recentShipped.length > 5) this.recentShipped.shift();
    }
    return plan.filter((p) => p.qty > 0);
  }

  // Exponential smoothing: forecast moves a fraction (alpha) toward today's demand
  // One-off orders far above normal (like everyone filling up on day 1) are capped,
  // the way a manager would ignore an outlier, so they don't snowball up the chain.
  observeDemand(qty) {
    const capped = Math.min(qty, this.expectedDemand * OUTLIER_LIMIT);
    this.forecast = this.alpha * capped + (1 - this.alpha) * this.forecast;
  }

  orderQty() {
    if (this.policy === 'manual') return Math.max(0, Math.floor(this.manualQty) || 0);
    const need = this.targetStock - this.inventoryPosition;
    if (need <= 0) return 0;
    // Full trucks: wait until stock runs low, then order whole truckloads only
    if (this.policy === 'fulltruck') {
      const cap = this.truckType.capacity;
      return Math.ceil(need / cap) * cap;
    }
    return need;
  }

  placeOrder(qty) {
    this.lastOrder = qty;
    this.onOrder += qty;
    this.upstream.incoming.set(this.id, qty);
  }

  addDailyCost() {
    if (this.infinite) return 0;
    const shortage = this.lostSales ? this.lastLost : this.backlog;
    const normal = Math.min(this.stock, this.storageLimit);
    const overflow = this.stock - normal;
    const cost = normal * this.holdingCost + overflow * OVERFLOW_COST + shortage * this.shortageCost;
    this.totalCost += cost;
    return cost;
  }
}
