import { createRng } from './random.js';
import { generateEvents } from './events.js';
import { Stage } from './stage.js';
import { NODES, KM_PER_UNIT, routeLength } from './network.js';
import { TRUCK_TYPES } from './trucks.js';
import { generateIncidents, FACTORY_REPAIR, SUPPLIER_DAYS_OFF, STORM_SPEED } from './incidents.js';
import { UPGRADES, UPGRADE_COST } from './upgrades.js';

const TRUCK_SPACING_KM = 13.5; // gap between trucks of one convoy (leaving the depot or queuing)
const BANKRUPT_DAYS = 3;       // days in a row below €0 before the company goes bust
const STEPS_PER_DAY = 24;      // trucks move in fixed one-hour steps, whatever the frame rate
export const STAR_GOALS = { two: { profit: 5000 }, three: { profit: 10000, service: 0.8 } };

export class Simulation {
  constructor({ nodes = NODES, seed = 1, startCash = 12000, salePrice = 30, rawCost = 8,
                demandSpread = 0.4, maxDays = 60 } = {}) {
    Object.assign(this, { seed, startCash, salePrice, rawCost, demandSpread, maxDays });

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

    for (const s of this.stages) s.init(this.expectedDemand(s));

    this.rng = createRng(seed);
    this.events = generateEvents(this.rng, maxDays);
    // Separate random stream, so incidents never change the customer demand of a seed
    const routes = this.stages.filter((s) => s.upstream).map((s) => s.id);
    this.incidents = generateIncidents(createRng(seed ^ 0x5bd1e995), maxDays, routes);
    this.nextIncidentId = this.incidents.length;
    this.repairCosts = 0;
    this.upgradeCosts = 0;
    this.daysInDebt = 0;
    this.bankrupt = false;
    this.deliveryLog = []; // deliveries/production since the UI last asked, for pop-ups
    this.hour = 0;         // hours simulated so far (whole number, so the simulation never drifts)
    this.time = 0;         // the same in days: hour / 24
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

  // Normal daily demand a building serves: its own customers, or the sum of the shops below it
  expectedDemand(s) {
    if (s.type === 'shop') return s.demandMean * (s.upgrades.expansion ? 1.25 : 1);
    return s.downstreams.reduce((sum, d) => sum + this.expectedDemand(d), 0);
  }

  get profit() {
    return this.cash - this.startCash;
  }

  // 0 stars if bankrupt; 1 for surviving; 2 for €5k profit; 3 for €10k profit and 80% service
  get stars() {
    if (this.bankrupt) return 0;
    if (this.profit >= STAR_GOALS.three.profit && this.serviceLevel >= STAR_GOALS.three.service) return 3;
    if (this.profit >= STAR_GOALS.two.profit) return 2;
    return 1;
  }

  buyUpgrade(stage, key) {
    const upgrade = UPGRADES[key];
    if (!upgrade || !upgrade.for.includes(stage.type) || stage.upgrades[key] || this.cash < UPGRADE_COST) return false;
    stage.upgrades[key] = true;
    this.cash -= UPGRADE_COST;
    this.upgradeCosts += UPGRADE_COST;
    // More customers: the shop and everything above it now expect more demand
    if (key === 'expansion') for (const s of this.stages) s.expectedDemand = this.expectedDemand(s);
    return true;
  }

  get serviceLevel() {
    return this.totalDemand ? this.totalSold / this.totalDemand : 1;
  }

  get isOver() {
    return this.bankrupt || this.day >= this.maxDays;
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
    return this.incidentsOn(day).some((i) => ['supplier', 'overworked', 'factory'].includes(i.kind) && i.target === stageId);
  }

  isStorm(day = this.day) {
    return this.incidentsOn(day).some((i) => i.kind === 'storm');
  }

  // Roadworks blocking the road to this stage on this day (or null)
  roadworksOn(stageId, day = this.day) {
    return this.incidentsOn(day).find((i) => i.kind === 'roadworks' && i.target === stageId) ?? null;
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
    const multiplier = (this.eventOn(day)?.multiplier ?? 1) * (shop.upgrades.expansion ? 1.25 : 1);
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
    const load = truck.loadDays * to.upstream.loadFactor;
    // One loading bay: each truck of a convoy leaves a little after the one before
    const spacing = TRUCK_SPACING_KM / truck.speed;
    let left = qty;
    let cost = 0;
    for (let i = 0; left > 0; i++) {
      const units = Math.min(truck.capacity, left);
      left -= units;
      // km = distance driven so far; arrivedAt is set when it reaches the building
      to.inTransit.push({ qty: units, truck: truck.id, sentOn: day,
                          departAt: day + load + i * spacing, km: 0, arrivedAt: null });
      cost += truck.tripCost * to.upstream.tripCostFactor;
    }
    to.transportCost += cost;
    return cost;
  }

  // Called every frame with the current time (day + fraction): unloads trucks the
  // moment they arrive, so stock changes when a truck reaches a building, not at the next day
  //
  // Fixed timestep: trucks always move in exact one-hour steps, so the result never depends
  // on how many frames the computer draws. The 3D view smooths the movement between steps.
  advanceTo(time) {
    const targetHour = Math.floor(time * STEPS_PER_DAY + 1e-9);
    while (this.hour < targetHour) {
      const t0 = this.hour / STEPS_PER_DAY;
      const t1 = (this.hour + 1) / STEPS_PER_DAY;
      this.moveTrucks(t0, t1, Math.floor(this.hour / STEPS_PER_DAY));
      this.hour++;
      this.time = this.hour / STEPS_PER_DAY;
      for (const s of this.stages) this.deliveryLog.push(...s.receive(this.time));
    }
  }

  // Drives every truck from time t0 to t1. Storms halve the speed; trucks that have not
  // passed a roadworks yet stop at it and queue behind each other.
  moveTrucks(t0, t1, day) {
    const stormFactor = this.isStorm(day) ? STORM_SPEED : 1;
    for (const stage of this.stages) {
      if (!stage.inTransit.length) continue;
      const works = this.roadworksOn(stage.id, day);
      const blockKm = works ? works.at * stage.distance : Infinity;
      let queueEnd = blockKm + TRUCK_SPACING_KM; // the first truck can drive up to the works
      // Leading trucks first, so the ones behind queue up behind them
      const trucks = [...stage.inTransit].sort((a, b) => b.km - a.km);
      for (const s of trucks) {
        if (s.arrivedAt !== null) continue;
        s.v = 0; // speed used by the 3D view to smooth movement; 0 while loading or stopped
        const start = Math.max(t0, s.departAt);
        if (start >= t1) continue; // still loading at the depot
        const speed = TRUCK_TYPES[s.truck].speed * stormFactor;
        let km = s.km + speed * (t1 - start);
        let stopped = false;
        if (s.km <= blockKm) {
          const stopAt = Math.max(s.km, queueEnd - TRUCK_SPACING_KM);
          if (km > stopAt) { km = stopAt; stopped = true; }
          queueEnd = km;
        }
        if (!stopped) s.v = speed;
        if (km >= stage.distance) {
          s.arrivedAt = start + (stage.distance - s.km) / speed;
          km = stage.distance;
        }
        s.km = km;
      }
    }
  }

  // Rough day a truck will arrive, for the building panel
  eta(stage, s) {
    const start = Math.max(this.time, s.departAt);
    const speed = TRUCK_TYPES[s.truck].speed * (this.isStorm() ? STORM_SPEED : 1);
    let at = start + (stage.distance - s.km) / speed;
    const works = this.roadworksOn(stage.id);
    if (works && s.km <= works.at * stage.distance) at += works.endDay + 1 - this.time;
    return Math.floor(at);
  }

  // Supplier: shipping too much in a short time means the workers need days off
  checkSupplierWorkload(day) {
    const sup = this.supplier;
    if (sup.workload <= sup.workLimit || this.isBroken(sup.id, day + 1)) return;
    this.incidents.push({ id: this.nextIncidentId++, kind: 'overworked', target: sup.id,
                          startDay: day + 1, endDay: day + SUPPLIER_DAYS_OFF });
    sup.recentShipped = [];
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

    this.checkSupplierWorkload(day);

    let holding = 0;
    for (const s of this.stages) holding += s.addDailyCost();
    const purchases = this.supplier.lastShipped * this.rawCost;
    this.cash += sold * this.salePrice - purchases - holding - transport;

    // Bankruptcy: cash below zero for several days in a row ends the game
    this.daysInDebt = this.cash < 0 ? this.daysInDebt + 1 : 0;
    if (this.daysInDebt >= BANKRUPT_DAYS) this.bankrupt = true;

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
