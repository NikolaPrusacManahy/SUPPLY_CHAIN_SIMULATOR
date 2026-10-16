const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

export class Hud {
  constructor(root, { onPlayPause, onSpeed, onRestart }) {
    root.innerHTML = `
      <div class="hud-stats">
        <span>Day <strong data-day>0</strong> / <span data-max></span></span>
        <span>Cash <strong data-cash></strong></span>
        <span>Service level <strong data-service></strong></span>
        <span class="muted">Seed <span data-seed></span></span>
      </div>
      <div class="hud-controls">
        <button data-play>Play</button>
        <button data-speed="1" class="active">1x</button>
        <button data-speed="2">2x</button>
        <button data-speed="4">4x</button>
        <button data-restart>Restart</button>
      </div>`;

    this.dayEl = root.querySelector('[data-day]');
    this.maxEl = root.querySelector('[data-max]');
    this.cashEl = root.querySelector('[data-cash]');
    this.serviceEl = root.querySelector('[data-service]');
    this.seedEl = root.querySelector('[data-seed]');
    this.playBtn = root.querySelector('[data-play]');

    this.playBtn.addEventListener('click', onPlayPause);
    root.querySelector('[data-restart]').addEventListener('click', onRestart);

    const speedBtns = root.querySelectorAll('[data-speed]');
    speedBtns.forEach((btn) =>
      btn.addEventListener('click', () => {
        speedBtns.forEach((b) => b.classList.toggle('active', b === btn));
        onSpeed(Number(btn.dataset.speed));
      }),
    );
  }

  setPlaying(playing) {
    this.playBtn.textContent = playing ? 'Pause' : 'Play';
  }

  update(sim) {
    this.dayEl.textContent = sim.day;
    this.maxEl.textContent = sim.maxDays;
    this.cashEl.textContent = euro.format(sim.cash);
    this.cashEl.classList.toggle('negative', sim.cash < 0);
    this.serviceEl.textContent = `${Math.round(sim.serviceLevel * 100)}%`;
    this.seedEl.textContent = sim.seed;
  }
}