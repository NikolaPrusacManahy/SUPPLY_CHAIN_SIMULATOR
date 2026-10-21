import './style.css';
import { Simulation } from './sim/simulation.js';
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
});
const alerts = new Alerts(document.querySelector('#alerts'), {
  onRepair: payRepair,
  onFocus: selectStage,
});

function payRepair(incident) {
  if (sim.payRepair(incident)) render();
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

function showSummary() {
  const storage = sim.stages.reduce((sum, s) => sum + s.totalCost, 0);
  const ratios = sim.stages
    .filter((s) => !s.infinite)
    .map((s) => `<li>${s.name}: <strong>${bullwhipRatio(sim.history, s).toFixed(2)}</strong></li>`)
    .join('');

  messageEl.innerHTML = `
    <h2>Game over after ${sim.maxDays} days</h2>
    <p>Final cash: <strong>${euro.format(sim.cash)}</strong></p>
    <p>Service level: <strong>${Math.round(sim.serviceLevel * 100)}%</strong></p>
    <p>Transport costs: <strong>${euro.format(sim.totalTransport)}</strong> ·
       Storage and shortage costs: <strong>${euro.format(storage)}</strong> ·
       Repairs: <strong>${euro.format(sim.repairCosts)}</strong></p>
    <p>Bullwhip ratio (order variance ÷ demand variance, 1.00 = orders as steady as demand):</p>
    <ul>${ratios}</ul>
    <p class="muted">Press Restart to play again.</p>`;
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
