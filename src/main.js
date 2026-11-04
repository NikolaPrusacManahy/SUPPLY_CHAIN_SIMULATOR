import './style.css';
import { Simulation, STAR_GOALS, BANKRUPT_DAYS } from './sim/simulation.js';
import { bullwhipRatio } from './sim/stats.js';
import { GameLoop } from './game/game-loop.js';
import { Hud } from './ui/hud.js';
import { BuildingPanel } from './ui/building-panel.js';
import { Charts } from './ui/charts.js';
import { World3D } from './render/world3d.js';
import { Alerts } from './ui/alerts.js';
import { StartScreen } from './ui/start-screen.js';
import { Tutorial } from './ui/tutorial.js';
import { describeIncident, FACTORY_REPAIR } from './sim/incidents.js';
import { DIFFICULTIES } from './sim/difficulty.js';

const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

// A fixed seed can be given in the address bar (e.g. ?seed=42) to replay the same game
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
let difficulty = 'normal'; // chosen on the start screen
const createSimulation = () => new Simulation({
  seed: urlSeed > 0 ? urlSeed : Math.floor(Math.random() * 1_000_000),
  difficulty,
});

const messageEl = document.querySelector('#message');
const pauseBanner = document.querySelector('#pause-banner');
let sim = createSimulation();
let selectedId = null;
let autoPause = true; // pause when a new problem starts or cash drops below €0

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
  // Space pauses and resumes, except while typing a number in the panel
  if (e.code === 'Space' && !e.target.closest?.('input, select, textarea')) {
    e.preventDefault();
    if (!e.repeat) togglePlay();
  }
});

// A clicked button keeps keyboard focus, and Space would click it again: drop the focus instead
document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());

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
    if (deliveries.length) {
      panel.update(sim);
      alerts.update(sim); // a truck arriving can clear a "runs out soon" warning
    }
    world.render(sim, progress);
  },
});

// --- Pausing -------------------------------------------------------------
function play() {
  if (sim.isOver || startScreen.open) return;
  if (tutorial.open) tutorial.close({ fromPlay: true });
  loop.play();
  hud.setPlaying(true);
  pauseBanner.hidden = true;
}

// Pauses the game and says why in a banner at the top of the screen
function pauseGame(reason = 'Paused') {
  loop.pause();
  hud.setPlaying(false);
  if (sim.isOver) {
    pauseBanner.hidden = true;
    return;
  }
  pauseBanner.innerHTML = `<span>⏸ ${reason}</span><button data-continue>Continue (Space)</button>`;
  pauseBanner.querySelector('[data-continue]').addEventListener('click', play);
  pauseBanner.hidden = false;
}

function togglePlay() {
  if (loop.running) pauseGame();
  else play();
}

const hud = new Hud(document.querySelector('#hud'), {
  onPlayPause: togglePlay,
  onAutoPause: (on) => { autoPause = on; },
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
  if (sim.isOver) {
    pauseGame();
    showSummary();
    return;
  }
  checkAutoPause();
}

// A factory breakdown always pauses, because it needs a decision (pay or wait).
// Other new problems and the first day in debt pause only when auto-pause is on.
function checkAutoPause() {
  const fresh = sim.newIncidents;
  const factory = fresh.find((i) => i.kind === 'factory');
  if (factory) {
    pauseGame(`Factory breakdown on day ${sim.day}: pay €${FACTORY_REPAIR.cost.toLocaleString('en-IE')} to repair it in ${FACTORY_REPAIR.paidDays} day, or wait ${FACTORY_REPAIR.unpaidDays} days`);
    selectStage('factory');
    return;
  }
  if (!autoPause) return;
  const reasons = fresh.map((i) => describeIncident(i, (id) => sim.stage(id).name));
  if (sim.daysInDebt === 1) reasons.push(`cash is below €0 (${BANKRUPT_DAYS} days in debt = bankrupt)`);
  if (reasons.length) pauseGame(`Day ${sim.day}: ${reasons.join(' · ')}`);
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
    `<dt>${label}</dt><dd class="${plus ? 'plus' : ''}">${value === 0 ? '' : plus ? '+' : '−'}${euro.format(value)}</dd>`;
  const ratios = sim.stages.filter((s) => !s.infinite)
    .map((s) => `${s.name} ${bullwhipRatio(sim.history, s).toFixed(1)}`).join(' · ');

  messageEl.innerHTML = `
    <h2>${sim.bankrupt ? `Bankrupt on day ${sim.day}` : `Day ${sim.maxDays}: results`}</h2>
    <p class="muted result-level">${sim.level.name} · seed ${sim.seed}</p>
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
    <div class="result-buttons">
      <button class="primary" data-again>Play again</button>
      <button data-menu>Change difficulty</button>
    </div>`;
  messageEl.querySelector('[data-again]').addEventListener('click', restart);
  messageEl.querySelector('[data-menu]').addEventListener('click', () => {
    messageEl.innerHTML = '';
    pauseBanner.hidden = true;
    startScreen.show();
  });
}

function restart() {
  loop.reset();
  sim = createSimulation();
  messageEl.innerHTML = '';
  if (selectedId) panel.show(sim.stage(selectedId), sim);
  render();
  pauseGame('New game ready: press Play or Space to start');
}

// --- Start screen and tutorial ---------------------------------------------
const tutorial = new Tutorial(document.querySelector('#tutorial'), {
  select: selectStage,
  tab: (tab) => panel.setTab(tab),
  home: () => world.resetView(),
  onClose: () => pauseGame('Press Play or Space to start the first day'),
});

const startScreen = new StartScreen(document.querySelector('#start'), {
  onStart: ({ tutorial: withTutorial, autoPause: on, difficulty: level }) => {
    autoPause = on;
    hud.setAutoPause(on);
    startScreen.hide();
    // The game behind the start screen was made on Normal: start a fresh one on the chosen level
    difficulty = level;
    loop.reset();
    sim = createSimulation();
    messageEl.innerHTML = '';
    selectStage(null);
    render();
    if (withTutorial) tutorial.start();
    else play();
  },
});

hud.setAutoPause(autoPause);
render();
