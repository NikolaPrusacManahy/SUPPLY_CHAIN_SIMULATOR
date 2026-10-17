import { TRUCK_TYPES, travelDays } from './trucks.js';

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

    this.upstream = null;
    this.downstreams = [];
    this.expectedDemand = demand;
    this.forecast = demand;
    this.stock = 0;
    this.manualQty = 20;

    this.inTransit = [];   // trucks heading here: { qty, truck, departedOn, arrivesOn, convoyIndex }
    this.processing = [];  // factory only: { qty, readyOn }
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
    this.stock = this.infinite ? 0 : this.targetFor(expectedDemand);
  }

  get truckType() {
    return TRUCK_TYPES[this.truck];
  }

  // Days from placing an order to having the goods in stock
  get leadTime() {
    return this.upstream ? travelDays(this.distance, this.truck) + this.processingDays : 0;
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

  receive(day) {
    const arrived = this.inTransit.filter((s) => s.arrivesOn <= day);
    this.inTransit = this.inTransit.filter((s) => s.arrivesOn > day);
    for (const s of arrived) {
      if (this.processingDays > 0) {
        this.processing.push({ qty: s.qty, readyOn: day + this.processingDays });
      } else {
        this.stock += s.qty;
        this.onOrder -= s.qty;
      }
    }
    const ready = this.processing.filter((p) => p.readyOn <= day);
    this.processing = this.processing.filter((p) => p.readyOn > day);
    for (const p of ready) {
      this.stock += p.qty;
      this.onOrder -= p.qty;
    }
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
    const available = this.infinite ? total : Math.min(this.stock, total);
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
    return plan.filter((p) => p.qty > 0);
  }

  // Exponential smoothing: forecast moves a fraction (alpha) toward today's demand
  observeDemand(qty) {
    this.forecast = this.alpha * qty + (1 - this.alpha) * this.forecast;
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
    const cost = this.stock * this.holdingCost + shortage * this.shortageCost;
    this.totalCost += cost;
    return cost;
  }
}