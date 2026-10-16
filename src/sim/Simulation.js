import { createRng } from './random.js';
import { generateEvents } from './events.js';

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
    this.events = generateEvents(this.rng, maxDays);
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

  eventOn(day) {
    return this.events.find((e) => day >= e.startDay && day <= e.endDay) ?? null;
  }

  get currentEvent() {
    return this.eventOn(this.day);
  }

  customerDemand(day) {
    const multiplier = this.eventOn(day)?.multiplier ?? 1;
    const offset = (this.rng() * 2 - 1) * this.demandSpread;
    return Math.max(0, Math.round(this.demandMean * multiplier + offset));
  }

  step(playerOrders = {}) {
    const day = ++this.day;
    const demand = this.customerDemand(day);

    for (const s of this.stages) s.receiveShipments(day);

    this.stages[0].incomingOrder = demand;
    for (const s of this.stages) {
      s.fulfil(day);
      s.observeDemand(s.incomingOrder);
      if (s.upstream) s.placeOrder(playerOrders[s.id] ?? s.autoOrderQty());
    }

    const retailer = this.stages[0];
    const supplier = this.stages[this.stages.length - 1];
    const sold = retailer.lastShipped;

    let dayCost = 0;
    for (const s of this.stages) dayCost += s.addDailyCost();
    this.cash += sold * this.salePrice - supplier.lastShipped * this.rawCost - dayCost;

    this.lastDemand = demand;
    this.totalDemand += demand;
    this.totalSold += sold;

    const snapshot = { day, demand, sold, cash: this.cash,
                       event: this.eventOn(day)?.name ?? null };
    for (const s of this.stages) {
      snapshot[s.id] = { stock: s.stock, backlog: s.backlog,
                         ordered: s.lastOrder, shipped: s.lastShipped };
    }
    this.history.push(snapshot);
    return snapshot;
  }
}
