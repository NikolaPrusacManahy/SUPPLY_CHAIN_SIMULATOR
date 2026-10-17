import { createRng } from './random.js';
import { generateEvents } from './events.js';
import { Stage } from './stage.js';
import { NODES, KM_PER_UNIT, routeLength } from './network.js';
import { travelDays } from './trucks.js';

export class Simulation {
  constructor({ nodes = NODES, seed = 1, startCash = 5000, salePrice = 25, rawCost = 8,
                demandSpread = 0.4, maxDays = 60 } = {}) {
    Object.assign(this, { seed, salePrice, rawCost, demandSpread, maxDays });

    this.stages = nodes.map((n) => new Stage({
      ...n,
      distance: n.route ? routeLength(n.route) * KM_PER_UNIT : 0,
    }));
    this.byId = new Map(this.stages.map((s) => [s.id, s]));
    for (const n of nodes) {
      if (!n.upstream) continue;
      const stage = this.byId.get(n.id);
      stage.upstream = this.byId.get(n.upstream);
      stage.upstream.downstreams.push(stage);
    }
    this.shops = this.stages.filter((s) => s.type === 'shop');
    this.supplier = this.stages.find((s) => s.infinite);

    // Each day is processed from the shops back to the supplier,
    // so an order placed today can be shipped by the building upstream today.
    const depth = (s) => (s.upstream ? depth(s.upstream) + 1 : 0);
    this.processOrder = [...this.stages].sort((a, b) => depth(b) - depth(a));

    const expected = (s) => (s.type === 'shop' ? s.demandMean
      : s.downstreams.reduce((sum, d) => sum + expected(d), 0));
    for (const s of this.stages) s.init(expected(s));

    this.rng = createRng(seed);
    this.events = generateEvents(this.rng, maxDays);
    this.day = 0;
    this.cash = startCash;
    this.lastDemand = 0;
    this.lastTransport = 0;
    this.totalDemand = 0;
    this.totalSold = 0;
    this.totalTransport = 0;
    this.history = [];
  }

  stage(id) {
    return this.byId.get(id);
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

  customerDemand(shop, day) {
    const multiplier = this.eventOn(day)?.multiplier ?? 1;
    const offset = (this.rng() * 2 - 1) * this.demandSpread * shop.demandMean;
    return Math.max(0, Math.round(shop.demandMean * multiplier + offset));
  }

  // Sends goods as one or more trucks of the route's chosen type. Returns the trip cost.
  dispatch(to, qty, day) {
    const truck = to.truckType;
    const arrivesOn = day + travelDays(to.distance, to.truck);
    let left = qty;
    let cost = 0;
    for (let i = 0; left > 0; i++) {
      const load = Math.min(truck.capacity, left);
      left -= load;
      to.inTransit.push({ qty: load, truck: truck.id, departedOn: day, arrivesOn, convoyIndex: i });
      cost += truck.tripCost;
    }
    to.transportCost += cost;
    return cost;
  }

  step() {
    const day = ++this.day;
    for (const s of this.stages) s.receive(day);

    let demand = 0;
    let sold = 0;
    let transport = 0;
    for (const s of this.processOrder) {
      if (s.type === 'shop') {
        const d = this.customerDemand(s, day);
        s.sell(d);
        s.observeDemand(d);
        demand += d;
        sold += s.lastSold;
      } else {
        const plan = s.allocate();
        s.observeDemand(s.lastDemand);
        for (const p of plan) transport += this.dispatch(p.to, p.qty, day);
      }
      if (s.upstream) s.placeOrder(s.orderQty());
    }

    let holding = 0;
    for (const s of this.stages) holding += s.addDailyCost();
    const purchases = this.supplier.lastShipped * this.rawCost;
    this.cash += sold * this.salePrice - purchases - holding - transport;

    this.lastDemand = demand;
    this.lastTransport = transport;
    this.totalDemand += demand;
    this.totalSold += sold;
    this.totalTransport += transport;

    const snapshot = { day, demand, sold, cash: this.cash, transport,
                       event: this.eventOn(day)?.name ?? null };
    for (const s of this.stages) {
      snapshot[s.id] = { stock: s.stock, backlog: s.backlog, ordered: s.lastOrder,
                         shipped: s.lastShipped, sold: s.lastSold, lost: s.lastLost,
                         demand: s.lastDemand };
    }
    this.history.push(snapshot);
    return snapshot;
  }
}