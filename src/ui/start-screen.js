import { STAR_GOALS } from '../sim/simulation.js';
import { DIFFICULTIES } from '../sim/difficulty.js';

const eur = (n) => `€${n.toLocaleString('en-IE')}`;

// Title screen shown before the first game: goal, what to watch out for, controls,
// difficulty, the auto-pause option, and a choice to start straight away or with the tutorial.
export class StartScreen {
  constructor(root, { onStart }) {
    this.root = root;
    root.innerHTML = `
      <div class="start-card">
        <h1>Supply Chain Simulator</h1>
        <p class="tagline">Run a whole supply chain for 60 days, from raw material to the shop shelf.</p>

        <div class="start-goal">
          <strong>Your goal</strong>
          <p>Trucks carry raw material from the supplier to the factory, products to the warehouse and
            goods to three shops. Keep the shops stocked, keep costs down and stay out of debt.</p>
          <p class="start-stars">★ survive 60 days · ★★ ${eur(STAR_GOALS.two.profit)} profit ·
            ★★★ ${eur(STAR_GOALS.three.profit)} profit and ${STAR_GOALS.three.service * 100}% service</p>
        </div>

        <div class="start-cols">
          <div>
            <strong>Watch out for</strong>
            <ul>
              <li>🔥 Breakdowns at the supplier or factory</li>
              <li>😓 Overworked supplier staff</li>
              <li>🚚 Truck types out of service</li>
              <li>⛈️ Storms and 🚧 roadworks</li>
              <li>💸 Cash below €0 for 3 days = bankrupt</li>
            </ul>
          </div>
          <div>
            <strong>Controls</strong>
            <ul>
              <li>Click a building to manage it</li>
              <li>WASD move · drag rotate · scroll zoom</li>
              <li>Space pause · Esc reset view</li>
              <li>Speed x1 / x2 / x4 / x10 in the top bar</li>
            </ul>
          </div>
        </div>

        <div class="start-difficulty">
          <strong>Difficulty</strong>
          <div class="difficulty-options">
            ${Object.values(DIFFICULTIES).map((d) => `
              <button data-level="${d.id}" class="${d.id === 'normal' ? 'active' : ''}">
                <strong>${d.name}</strong><span>${d.summary}</span>
              </button>`).join('')}
          </div>
        </div>

        <label class="start-option"><input type="checkbox" data-autopause checked />
          Pause automatically when something goes wrong</label>

        <div class="start-buttons">
          <button class="primary" data-start>Start game</button>
          <button data-tutorial>Start with tutorial</button>
        </div>
      </div>`;

    this.difficulty = 'normal';
    const levelBtns = root.querySelectorAll('[data-level]');
    levelBtns.forEach((btn) => btn.addEventListener('click', () => {
      this.difficulty = btn.dataset.level;
      levelBtns.forEach((b) => b.classList.toggle('active', b === btn));
    }));

    const autoPause = root.querySelector('[data-autopause]');
    const start = (tutorial) => onStart({ tutorial, autoPause: autoPause.checked, difficulty: this.difficulty });
    root.querySelector('[data-start]').addEventListener('click', () => start(false));
    root.querySelector('[data-tutorial]').addEventListener('click', () => start(true));
  }

  show() {
    this.root.hidden = false;
  }

  get open() {
    return !this.root.hidden;
  }

  hide() {
    this.root.hidden = true;
  }
}
