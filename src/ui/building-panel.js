import { TRUCK_TYPES, travelDays } from '../sim/trucks.js';
import { describeIncident, FACTORY_REPAIR } from '../sim/incidents.js';

const fmt = (n) => Math.round(n).toLocaleString('en-IE');
const euro = (n) => `€${fmt(n)}`;
const units = (n) => `${fmt(n)} ${n === 1 ? 'unit' : 'units'}`;

const POLICIES = {
  forecast: 'Orders what recent demand suggests. Reacts fast, but can overreact and cause the bullwhip effect.',
  basestock: 'Tops stock up to a fixed level every day. Steady, but sends many part-full trucks.',
  fulltruck: 'Waits until stock is low, then orders whole truckloads only. Cheapest transport, more stock to store.',
  manual: 'You decide how much is ordered every day.',
};

const UPGRADES = [
  ['Bigger storage', 'Hold more stock at this building.'],
  ['Loading dock', 'Load and unload trucks faster.'],
  ['Own truck fleet', 'Buy trucks instead of paying per trip.'],
];

// Side panel for the selected building: Overview, Manage and Upgrade tabs.
// The structure is built once per selection; update() only changes text, so inputs keep focus.
export class BuildingPanel {
  constructor(root, { onClose, onRepair }) {
    this.root = root;
    this.onClose = onClose;
    this.onRepair = onRepair;
    this.statusKey = '';
    this.stage = null;
    this.tab = 'overview';
  }

  show(stage, sim) {
    this.stage = stage;
    this.statusKey = '';
    this.root.hidden = false;
    const hasManage = !stage.infinite;
    if (!hasManage) this.tab = 'overview';

    this.root.innerHTML = `
      <header class="panel-head">
        <div>
          <h2>${stage.name}</h2>
          <p class="muted">${this.subtitle(stage)}</p>
        </div>
        <button class="icon" data-close aria-label="Close">&times;</button>
      </header>
      <nav class="tabs">
        <button data-tab="overview">Overview</button>
        ${hasManage ? '<button data-tab="manage">Manage</button>' : ''}
        <button data-tab="upgrade">Upgrade</button>
      </nav>
      <div class="status" data-f="status" hidden></div>
      <section data-page="overview">${this.overviewHtml(stage)}</section>
      ${hasManage ? `<section data-page="manage">${this.manageHtml(stage)}</section>` : ''}
      <section data-page="upgrade">${this.upgradeHtml()}</section>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.onClose());
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
    }
    if (hasManage) this.bindManage(stage);
    this.setTab(this.tab);
    this.update(sim);
  }

  hide() {
    this.stage = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  subtitle(stage) {
    switch (stage.type) {
      case 'supplier': return `Produces raw material, up to ${stage.dailyCapacity} units a day`;
      case 'factory': return `Turns raw material into products in ${stage.processingDays} day`;
      case 'warehouse': return 'Supplies all three shops';
      default: return `Sells to local customers (about ${stage.demandMean} a day)`;
    }
  }

  setTab(tab) {
    this.tab = tab;
    for (const btn of this.root.querySelectorAll('[data-tab]')) btn.classList.toggle('active', btn.dataset.tab === tab);
    for (const page of this.root.querySelectorAll('[data-page]')) page.hidden = page.dataset.page !== tab;
  }

  overviewHtml(stage) {
    if (stage.infinite) {
      return `<dl>
        <dt>Production per day</dt><dd>${stage.dailyCapacity} units</dd>
        <dt>Shipped today</dt><dd data-f="shipped"></dd>
        <dt>Still owed to the factory</dt><dd data-f="backlog"></dd>
      </dl>
      <p class="muted">Raw material is paid for when it leaves the supplier.</p>`;
    }
    const shopRows = stage.type === 'shop'
      ? '<dt>Customers today</dt><dd data-f="demand"></dd><dt>Sold today</dt><dd data-f="sold"></dd><dt>Lost sales today</dt><dd data-f="lost"></dd>'
      : '<dt>Orders received today</dt><dd data-f="demand"></dd><dt>Shipped today</dt><dd data-f="shipped"></dd><dt>Still owed (backlog)</dt><dd data-f="backlog"></dd>';
    return `
      <div class="big-stat"><span class="muted">Stock</span><strong data-f="stock"></strong></div>
      <svg class="spark" data-f="spark" viewBox="0 0 200 40" preserveAspectRatio="none"><polyline /></svg>
      <dl>
        ${shopRows}
        ${stage.downstreams.length ? '<dt>Being loaded onto trucks</dt><dd data-f="loading"></dd>' : ''}
        ${stage.processingDays ? '<dt>In production</dt><dd data-f="making"></dd>' : ''}
        <dt>Forecast per day</dt><dd data-f="forecast"></dd>
        <dt>On order</dt><dd data-f="onorder"></dd>
        <dt>Delivery time</dt><dd data-f="lead"></dd>
        <dt>Storage and shortage costs</dt><dd data-f="cost"></dd>
        <dt>Transport costs</dt><dd data-f="transport"></dd>
      </dl>
      <h3>Incoming</h3>
      <ul class="incoming" data-f="incoming"></ul>`;
  }

  manageHtml(stage) {
    const options = Object.entries({
      forecast: 'Auto: forecast', basestock: 'Auto: fixed target', fulltruck: 'Auto: full trucks', manual: 'Manual',
    }).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    const trucks = Object.values(TRUCK_TYPES).map((t) => `
      <button class="truck-option" data-truck="${t.id}">
        <strong>${t.name}</strong>
        <span>${t.capacity} units · ${travelDays(stage.distance, t.id)} day trip · €${t.tripCost} per trip</span>
        <span class="muted">€${(t.tripCost / t.capacity).toFixed(2)} per unit when full · loading ${t.loadDays} day</span>
        <span class="out-of-service" data-truck-status="${t.id}" hidden>Out of service</span>
      </button>`).join('');
    return `
      <h3>Ordering</h3>
      <select data-policy>${options}</select>
      <p class="muted" data-policy-help></p>
      <label class="row">Daily order <input type="number" min="0" step="1" data-qty /></label>
      <h3>Delivered by</h3>
      <p class="muted">From ${stage.upstream.name}, ${Math.round(stage.distance)} km. Applies to the next delivery.</p>
      <div class="truck-options">${trucks}</div>`;
  }

  upgradeHtml() {
    return UPGRADES.map(([name, text]) => `
      <div class="upgrade locked">
        <div><strong>${name}</strong><p class="muted">${text}</p></div>
        <span class="badge">Coming soon</span>
      </div>`).join('');
  }

  bindManage(stage) {
    const policy = this.root.querySelector('[data-policy]');
    const help = this.root.querySelector('[data-policy-help]');
    const qty = this.root.querySelector('[data-qty]');
    const syncPolicy = () => {
      help.textContent = POLICIES[stage.policy];
      qty.disabled = stage.policy !== 'manual';
    };
    policy.value = stage.policy;
    qty.value = stage.manualQty;
    syncPolicy();
    policy.addEventListener('change', () => { stage.policy = policy.value; syncPolicy(); });
    qty.addEventListener('input', () => { stage.manualQty = Math.max(0, Math.floor(Number(qty.value)) || 0); });

    const truckButtons = this.root.querySelectorAll('[data-truck]');
    const syncTruck = () => truckButtons.forEach((b) => b.classList.toggle('active', b.dataset.truck === stage.truck));
    truckButtons.forEach((b) => b.addEventListener('click', () => { stage.truck = b.dataset.truck; syncTruck(); }));
    syncTruck();
  }

  // Warning box with the building's current problem, and a repair button for the factory
  updateStatus(sim) {
    const incident = sim.activeIncidents.find((i) => i.target === this.stage.id);
    const box = this.root.querySelector('[data-f="status"]');
    const key = incident ? `${incident.id}:${incident.paid}:${incident.endDay}` : '';
    if (key === this.statusKey) return;
    this.statusKey = key;
    box.hidden = !incident;
    if (!incident) return;
    box.innerHTML = `<strong>${incident.paid ? '🔧' : '🔥'} ${describeIncident(incident)}</strong>
      <span>Back to normal on day ${incident.endDay + 1}.</span>`;
    if (incident.kind === 'factory' && !incident.paid) {
      const btn = document.createElement('button');
      btn.textContent = `Pay €${FACTORY_REPAIR.cost} to repair in ${FACTORY_REPAIR.paidDays} day`;
      btn.addEventListener('click', () => this.onRepair(incident));
      box.append(btn);
    }
  }

  update(sim) {
    const stage = this.stage;
    if (!stage) return;
    const set = (key, text) => {
      const el = this.root.querySelector(`[data-f="${key}"]`);
      if (el) el.textContent = text;
    };
    set('shipped', fmt(stage.lastShipped));
    set('backlog', fmt(stage.backlog));
    this.updateStatus(sim);
    if (stage.infinite) return;

    for (const el of this.root.querySelectorAll('[data-truck-status]')) {
      el.hidden = sim.truckAvailable(el.dataset.truckStatus);
    }

    set('stock', fmt(sim.onHand(stage)));
    set('loading', fmt(sim.loadingOut(stage)));
    set('making', fmt(stage.processing.reduce((sum, p) => sum + p.qty, 0)));

    set('demand', fmt(stage.lastDemand));
    set('sold', fmt(stage.lastSold));
    set('lost', fmt(stage.lastLost));
    set('backlog', fmt(stage.backlog));
    set('forecast', stage.forecast.toFixed(1));
    set('onorder', fmt(stage.onOrder));
    set('lead', `${stage.leadTime} days`);
    set('cost', euro(stage.totalCost));
    set('transport', euro(stage.transportCost));

    const lost = this.root.querySelector('[data-f="lost"]');
    if (lost) lost.classList.toggle('negative', stage.lastLost > 0);

    // Trucks on the way, grouped by arrival day, truck type and whether they have left yet
    const groups = new Map();
    for (const s of stage.inTransit) {
      const phase = sim.time < s.departAt ? 'loading' : 'on the road';
      const day = Math.floor(s.driveEnd); // arrives during this day
      const key = `${day}|${s.truck}|${phase}`;
      const g = groups.get(key) ?? { day, truck: s.truck, qty: 0, count: 0, phase };
      g.qty += s.qty;
      g.count += 1;
      groups.set(key, g);
    }
    const list = [];
    if (stage.waiting > 0) {
      list.push(`<li class="warn">Waiting at ${stage.upstream.name} · ${units(stage.waiting)} · ${stage.truckType.plural} out of service. Switch truck type to send them now.</li>`);
    }
    for (const g of [...groups.values()].sort((a, b) => a.day - b.day)) {
      list.push(`<li>${g.count} × ${TRUCK_TYPES[g.truck].name} · ${units(g.qty)} · ${g.phase} · arrives day ${g.day}</li>`);
    }
    for (const p of stage.processing) list.push(`<li>In production · ${units(p.qty)} · ready day ${Math.floor(p.readyAt)}</li>`);
    this.root.querySelector('[data-f="incoming"]').innerHTML = list.join('') || '<li class="muted">Nothing on the way</li>';

    // Stock over the last 30 days
    const points = sim.history.slice(-30).map((h) => h[stage.id].stock);
    const max = Math.max(1, ...points);
    const step = points.length > 1 ? 200 / (points.length - 1) : 0;
    this.root.querySelector('[data-f="spark"] polyline').setAttribute('points',
      points.map((v, i) => `${(i * step).toFixed(1)},${(38 - (v / max) * 36).toFixed(1)}`).join(' '));
  }
}
