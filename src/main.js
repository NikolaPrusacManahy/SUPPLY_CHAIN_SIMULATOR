import './style.css';
import { Simulation, STAR_GOALS } from './sim/simulation.js';
import { bullwhipRatio } from './sim/stats.js';
import { GameLoop } from './game/game-loop.js';
import { Hud } from './ui/hud.js';
import { BuildingPanel } from './ui/building-panel.js';
import { Charts } from './ui/charts.js';
import { World3D } from './render/world3d.js';
import { Alerts } from './ui/alerts.js';

const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

// A fixed seed can be given in the address bar (e.g. ?seed=42) to replay the same game
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
const createSimulation = () => new Simulation({
  seed: urlSeed > 0 ? urlSeed : Math.floor(Math.random() * 1_000_000),
});

const messageEl = document.querySelector('#message');
let sim = createSimulation();
let selectedId = null;

const world = new World3D(document.querySelector('#world'), { onSelect: selectStage });
const panel = new BuildingPanel(document.querySelector('#panel'), {
  onClose: () => selectStage(null),
  onRepair: payRepair,
  onBuy: buyUpgrade,
});
const alerts = new Alerts(document.querySelector('#alerts'), {
  onRepair: payRepair,
  onFocus: selectStage,
});

function payRepair(incident) {
  if (sim.payRepair(incident)) render();
}

function buyUpgrade(stage, key) {
  if (!sim.buyUpgrade(stage, key)) return;
  panel.show(stage, sim); // redraw: truck times and costs may have changed
  render();
}
const charts = new Charts(document.querySelector('#charts'));

// Selecting from the 3D world or closing the panel keeps both in sync
function selectStage(id) {
  selectedId = id;
  world.select(id);
  if (id) panel.show(sim.stage(id), sim);
  else panel.hide();
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    selectStage(null);
    world.resetView();
  }
});

const loop = new GameLoop({
  onTick: tick,
  onFrame: (progress) => {
    // Unload trucks the moment they arrive, then show what was delivered
    sim.advanceTo(sim.day + progress);
    const deliveries = sim.takeDeliveries();
    for (const d of deliveries) {
      const text = d.kind === 'raw' ? `+${d.qty} raw` : d.kind === 'produced' ? `+${d.qty} made` : `+${d.qty}`;
      world.popup(d.stageId, text, d.kind);
    }
    if (deliveries.length) panel.update(sim);
    world.render(sim, progress);
  },
});

const hud = new Hud(document.querySelector('#hud'), {
  onPlayPause: () => {
    if (sim.isOver) return;
    if (loop.running) loop.pause();
    else loop.play();
    hud.setPlaying(loop.running);
  },
  onSpeed: (speed) => loop.setSpeed(speed),
  onRestart: restart,
  onReports: () => {
    const shown = charts.toggle();
    document.querySelector('#stage').classList.toggle('reports-open', shown);
    charts.update(sim);
    return shown;
  },
});

function tick() {
  sim.step();
  render();
  // A factory breakdown needs a decision (pay or wait), so pause and show the factory
  if (sim.newIncidents.some((i) => i.kind === 'factory')) {
    loop.pause();
    hud.setPlaying(false);
    selectStage('factory');
  }
  if (sim.isOver) {
    loop.pause();
    hud.setPlaying(false);
    showSummary();
  }
}

function render() {
  hud.update(sim);
  alerts.update(sim);
  panel.update(sim);
  charts.update(sim);
}

// One piece of advice, based on what went worst
function resultTip(costs) {
  const overworked = sim.incidents.filter((i) => i.kind === 'overworked').length;
  if (sim.bankrupt) return 'Cash stayed below €0 for 3 days. Keep an eye on transport, repairs and upgrades early in the game, before the shops are selling.';
  if (overworked > 0) return `The supplier's workers needed days off ${overworked} time${overworked > 1 ? 's' : ''}. Steadier, smaller orders from the factory keep their workload down.`;
  if (sim.serviceLevel < STAR_GOALS.three.service) return `Shops could only serve ${Math.round(sim.serviceLevel * 100)}% of their customers. Order earlier, and switch truck types when one is out of service.`;
  if (costs.transport > costs.storage) return 'Transport was your biggest cost. Fuller trucks (Auto: full trucks) cut the cost per unit.';
  return 'Storage was your biggest cost. Too much stock was sitting in buildings: lower the orders or buy bigger storage.';
}

// End screen: stars, money breakdown and a tip
function showSummary() {
  const raw = sim.history.reduce((sum, h) => sum + h.supplier.shipped, 0) * sim.rawCost;
  const costs = {
    sales: sim.totalSold * sim.salePrice,
    raw,
    transport: sim.totalTransport,
    storage: sim.stages.reduce((sum, s) => sum + s.totalCost, 0),
    repairs: sim.repairCosts,
    upgrades: sim.upgradeCosts,
  };
  const stars = [1, 2, 3].map((n) => `<span class="${n <= sim.stars ? 'on' : ''}">★</span>`).join('');
  const row = (label, value, plus = false) =>
    `<dt>${label}</dt><dd class="${plus ? 'plus' : ''}">${plus ? '+' : '−'}${euro.format(value)}</dd>`;
  const ratios = sim.stages.filter((s) => !s.infinite)
    .map((s) => `${s.name} ${bullwhipRatio(sim.history, s).toFixed(1)}`).join(' · ');

  messageEl.innerHTML = `
    <h2>${sim.bankrupt ? `Bankrupt on day ${sim.day}` : `Day ${sim.maxDays}: results`}</h2>
    <div class="stars">${stars}</div>
    <div class="result-main">
      <div><span class="muted">Profit</span><strong class="${sim.profit < 0 ? 'negative' : ''}">${euro.format(sim.profit)}</strong></div>
      <div><span class="muted">Service</span><strong>${Math.round(sim.serviceLevel * 100)}%</strong></div>
    </div>
    <dl class="breakdown">
      ${row('Sales', costs.sales, true)}
      ${row('Raw material', costs.raw)}
      ${row('Transport', costs.transport)}
      ${row('Storage and lost sales', costs.storage)}
      ${row('Repairs', costs.repairs)}
      ${row('Upgrades', costs.upgrades)}
    </dl>
    <p class="tip">${resultTip(costs)}</p>
    <p class="muted goals">★ survive 60 days · ★★ €${STAR_GOALS.two.profit.toLocaleString('en-IE')} profit ·
      ★★★ €${STAR_GOALS.three.profit.toLocaleString('en-IE')} profit and ${STAR_GOALS.three.service * 100}% service</p>
    <p class="muted goals">Bullwhip ratio (1.0 = orders as steady as demand): ${ratios}</p>
    <button data-again>Play again</button>`;
  messageEl.querySelector('[data-again]').addEventListener('click', restart);
}

function restart() {
  loop.pause();
  loop.reset();
  hud.setPlaying(false);
  sim = createSimulation();
  messageEl.innerHTML = '';
  if (selectedId) panel.show(sim.stage(selectedId), sim);
  render();
}

render();
