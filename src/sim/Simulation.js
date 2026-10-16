import { createRng } from './random.js';

export class Simulation {
  // stages ordered downstream -> upstream: retailer first, supplier last
  constructor({ stages, demandMean = 20, demandSpread = 5, seed = 1,
                startCash = 5000, salePrice = 10, rawCost = 4, maxDays = 60 }) {
    this.stages = stages;
    stages.forEach((s, i) => {
      s.downstream = stages[i - 1] ?? null;
      s.upstream = stages[i + 1] ?? null;
    });
    Object.assign(this, { demandMean, demandSpread, seed,
                          salePrice, rawCost, maxDays });
    this.rng = createRng(seed);
    this.day = 0;
    this.cash = startCash;
    this.lastDemand = 0;
    this.totalDemand = 0;
    this.totalSold = 0;
    this.history = [];
  }

  get serviceLevel() {
    return this.totalDemand ? this.totalSold / this.totalDemand : 1;
  }

  get isOver() {
    return this.day >= this.maxDays;
  }

  customerDemand() {
    const offset = (this.rng() * 2 - 1) * this.demandSpread;
    return Math.max(0, Math.round(this.demandMean + offset));
  }

  step(playerOrders = {}) {
    const day = ++this.day;
    const demand = this.customerDemand();

    for (const s of this.stages) s.receiveShipments(day);

    this.stages[0].incomingOrder = demand;
    for (const s of this.stages) {
      s.fulfil(day);
      if (s.upstream) s.placeOrder(playerOrders[s.id] ?? s.autoOrderQty());
    }

    const retailer = this.stages[0];
    const supplier = this.stages[this.stages.length - 1];
    const sold = retailer.lastShipped;

    let dayCost = 0;
    for (const s of this.stages) dayCost += s.addDailyCost();
    const revenue = sold * this.salePrice;
    const purchases = supplier.lastShipped * this.rawCost;
    this.cash += revenue - purchases - dayCost;

    this.lastDemand = demand;
    this.totalDemand += demand;
    this.totalSold += sold;

    const snapshot = { day, demand, sold, cash: this.cash };
    for (const s of this.stages) {
      snapshot[s.id] = { stock: s.stock, backlog: s.backlog,
                         ordered: s.lastOrder, shipped: s.lastShipped };
    }
    this.history.push(snapshot);
    return snapshot;
  }
}