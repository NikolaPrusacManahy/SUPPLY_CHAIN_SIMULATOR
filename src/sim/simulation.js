import { createRng } from './random.js';
import { generateEvents } from './events.js';
import { Stage } from './stage.js';
import { NODES, KM_PER_UNIT, routeLength } from './network.js';

const TRUCK_SPACING_KM = 13.5; // gap between trucks of one convoy as they leave the depot
import { tripTimes } from './trucks.js';
import { generateIncidents, FACTORY_REPAIR } from './incidents.js';

export class Simulation {
  constructor({ nodes = NODES, seed = 1, startCash = 12000, salePrice = 30, rawCost = 8,
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
    // Separate random stream, so incidents never change the customer demand of a seed
    this.incidents = generateIncidents(createRng(seed ^ 0x5bd1e995), maxDays);
    this.repairCosts = 0;
    this.deliveryLog = []; // deliveries/production since the UI last asked, for pop-ups
    this.time = 0;         // current time in days, including the fraction of the day
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

  incidentsOn(day) {
    return this.incidents.filter((i) => day >= i.startDay && day <= i.endDay);
  }

  get activeIncidents() {
    return this.incidentsOn(this.day);
  }

  // Incidents that started today (used to alert the player)
  get newIncidents() {
    return this.incidents.filter((i) => i.startDay === this.day);
  }

  isBroken(stageId, day = this.day) {
    return this.incidentsOn(day).some((i) => i.kind !== 'trucks' && i.target === stageId);
  }

  truckAvailable(truckId, day = this.day) {
    return !this.incidentsOn(day).some((i) => i.kind === 'trucks' && i.target === truckId);
  }

  // Pay to get a broken factory fixed: it works again after one more day
  payRepair(incident) {
    if (incident.kind !== 'factory' || incident.paid || incident.endDay < this.day) return false;
    incident.paid = true;
    incident.endDay = Math.min(incident.endDay, this.day + FACTORY_REPAIR.paidDays);
    this.cash -= FACTORY_REPAIR.cost;
    this.repairCosts += FACTORY_REPAIR.cost;
    return true;
  }

  customerDemand(shop, day) {
    const multiplier = this.eventOn(day)?.multiplier ?? 1;
    const offset = (this.rng() * 2 - 1) * this.demandSpread * shop.demandMean;
    return Math.max(0, Math.round(shop.demandMean * multiplier + offset));
  }

  // Sends goods as one or more trucks of the route's chosen type. Returns the trip cost.
  // If that truck type is out of service the goods wait at the depot instead.
  dispatch(to, qty, day) {
    if (!this.truckAvailable(to.truck, day)) {
      to.waiting += qty;
      return 0;
    }
    const truck = to.truckType;
    const { load, drive } = tripTimes(to.distance, to.truck);
    // One loading bay: each truck of a convoy leaves a little after the one before
    const spacing = TRUCK_SPACING_KM / truck.speed;
    let left = qty;
    let cost = 0;
    for (let i = 0; left > 0; i++) {
      const units = Math.min(truck.capacity, left);
      left -= units;
      const departAt = day + load + i * spacing; // loaded, then leaves
      const driveEnd = departAt + drive;          // reaches the destination; goods are added then
      to.inTransit.push({ qty: units, truck: truck.id, sentOn: day, departAt, driveEnd });
      cost += truck.tripCost;
    }
    to.transportCost += cost;
    return cost;
  }

  // Called every frame with the current time (day + fraction): unloads trucks the
  // moment they arrive, so stock changes when a truck reaches a building, not at the next day
  advanceTo(time) {
    this.time = Math.max(this.time, time);
    for (const s of this.stages) this.deliveryLog.push(...s.receive(this.time));
  }

  // Units being loaded onto trucks that have not left yet
  loadingOut(stage) {
    let total = 0;
    for (const d of stage.downstreams) {
      for (const s of d.inTransit) if (s.departAt > this.time) total += s.qty;
    }
    return total;
  }

  // What the player sees at a building: goods count as still there until their truck drives off
  onHand(stage) {
    return stage.stock + this.loadingOut(stage);
  }

  // Deliveries since the last call (the UI shows them as pop-ups)
  takeDeliveries() {
    const log = this.deliveryLog;
    this.deliveryLog = [];
    return log;
  }

  step() {
    const day = ++this.day;
    for (const s of this.stages) s.broken = this.isBroken(s.id, day);
    this.advanceTo(day); // catch up on anything that arrived since the last frame

    let demand = 0;
    let sold = 0;
    let transport = 0;

    // Goods held back by a truck outage leave as soon as the route's truck type is available.
    // Switching the route to another truck type gets them moving again.
    for (const s of this.stages) {
      if (s.waiting > 0 && this.truckAvailable(s.truck, day)) {
        const qty = s.waiting;
        s.waiting = 0;
        transport += this.dispatch(s, qty, day);
      }
    }
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
