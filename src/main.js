import './style.css';
import { Stage } from './sim/Stage.js';
import { Simulation } from './sim/Simulation.js';
import { bullwhipRatio } from './sim/stats.js';
import { GameLoop } from './game/GameLoop.js';
import { Hud } from './ui/Hud.js';
import { StagePanels } from './ui/StagePanels.js';
import { Charts } from './ui/Charts.js';

const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

function createSimulation() {
  const stages = [
    new Stage({ id: 'retailer',  name: 'Retailer',  stock: 40, leadTime: 2, targetStock: 60, lostSales: true }),
    new Stage({ id: 'warehouse', name: 'Warehouse', stock: 60, leadTime: 2, targetStock: 60 }),
    new Stage({ id: 'factory',   name: 'Factory',   stock: 80, leadTime: 3, targetStock: 80 }),
    new Stage({ id: 'supplier',  name: 'Supplier',  infinite: true }),
  ];
  const seed = Math.floor(Math.random() * 1_000_000);
  return new Simulation({ stages, seed, maxDays: 60 });
}

const chainEl = document.querySelector('#chain');
const messageEl = document.querySelector('#message');

let sim = createSimulation();
let panels = new StagePanels(chainEl, sim.stages);

const stageNames = Object.fromEntries(sim.stages.map((s) => [s.id, s.name]));
const charts = new Charts(document.querySelector('#charts'), stageNames);

const loop = new GameLoop({ onTick: tick });

const hud = new Hud(document.querySelector('#hud'), {
  onPlayPause: () => {
    if (sim.isOver) return;
    if (loop.running) loop.pause();
    else loop.play();
    hud.setPlaying(loop.running);
  },
  onSpeed: (speed) => loop.setSpeed(speed),
  onRestart: restart,
});

function tick() {
  sim.step(panels.getPlayerOrders());
  render();
  if (sim.isOver) {
    loop.pause();
    hud.setPlaying(false);
    showSummary();
  }
}

function render() {
  hud.update(sim);
  panels.update(sim);
  charts.update(sim.history);
}

function showSummary() {
  const totalCost = sim.stages.reduce((sum, s) => sum + s.totalCost, 0);
  const ratios = sim.stages
    .filter((s) => !s.infinite)
    .map((s) => `<li>${s.name}: <strong>${bullwhipRatio(sim.history, s.id).toFixed(2)}</strong></li>`)
    .join('');

  messageEl.innerHTML = `
    <h2>Game over after ${sim.maxDays} days</h2>
    <p>Final cash: <strong>${euro.format(sim.cash)}</strong></p>
    <p>Service level: <strong>${Math.round(sim.serviceLevel * 100)}%</strong></p>
    <p>Total holding and shortage costs: <strong>${euro.format(totalCost)}</strong></p>
    <p>Bullwhip ratio (order variance ÷ demand variance, 1.00 = no amplification):</p>
    <ul>${ratios}</ul>
    <p class="muted">Press Restart to play again.</p>`;
}

function restart() {
  loop.pause();
  hud.setPlaying(false);
  sim = createSimulation();
  panels = new StagePanels(chainEl, sim.stages);
  messageEl.innerHTML = '';
  render();
}

render();