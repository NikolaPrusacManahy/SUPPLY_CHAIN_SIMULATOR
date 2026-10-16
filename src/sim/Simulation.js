import { createRng } from './random.js';

export class Simulation {
  // stages must be ordered downstream -> upstream: retailer first, supplier last
  constructor({ stages, demandMean = 20, demandSpread = 5, seed = 1 }) {
    this.stages = stages;
    stages.forEach((s, i) => {
      s.downstream = stages[i - 1] ?? null;
      s.upstream = stages[i + 1] ?? null;
    });
    this.demandMean = demandMean;
    this.demandSpread = demandSpread;
    this.rng = createRng(seed);
    this.day = 0;
    this.history = [];
  }

  customerDemand() {
    const offset = (this.rng() * 2 - 1) * this.demandSpread;
    return Math.max(0, Math.round(this.demandMean + offset));
  }

  // playerOrders: { stageId: qty } overrides the auto rule for that stage today
  step(playerOrders = {}) {
    const day = ++this.day;
    const demand = this.customerDemand();

    for (const s of this.stages) s.receiveShipments(day);

    this.stages[0].incomingOrder = demand;
    for (const s of this.stages) {
      s.fulfil(day);
      if (s.upstream) s.placeOrder(playerOrders[s.id] ?? s.autoOrderQty());
    }

    const snapshot = { day, demand };
    for (const s of this.stages) {
      s.addDailyCost();
      snapshot[s.id] = {
        stock: s.stock, backlog: s.backlog,
        ordered: s.lastOrder, shipped: s.lastShipped,
      };
    }
    this.history.push(snapshot);
    return snapshot;
  }
}