const euro = new Intl.NumberFormat('en-IE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

export class Hud {
  constructor(root, { onPlayPause, onSpeed, onRestart, onReports, onAutoPause }) {
    root.innerHTML = `
      <div class="hud-stats">
        <span>Day <strong data-day>0</strong> / <span data-max></span></span>
        <span>Cash <strong data-cash></strong></span>
        <span>Service level <strong data-service></strong></span>
        <span class="muted">Seed <span data-seed></span></span>
        <span class="event" data-event></span>
      </div>
      <div class="hud-controls">
        <button data-play>Play</button>
        <button data-speed="1" class="active">1x</button>
        <button data-speed="2">2x</button>
        <button data-speed="4">4x</button>
        <button data-speed="10">10x</button>
        <button data-autopause title="Pause the game when something goes wrong">Auto-pause</button>
        <button data-reports>Reports</button>
        <button data-restart>Restart</button>
      </div>`;

    this.dayEl = root.querySelector('[data-day]');
    this.maxEl = root.querySelector('[data-max]');
    this.cashEl = root.querySelector('[data-cash]');
    this.serviceEl = root.querySelector('[data-service]');
    this.seedEl = root.querySelector('[data-seed]');
    this.eventEl = root.querySelector('[data-event]');
    this.playBtn = root.querySelector('[data-play]');

    this.playBtn.addEventListener('click', onPlayPause);
    root.querySelector('[data-restart]').addEventListener('click', onRestart);
    this.reportsBtn = root.querySelector('[data-reports]');
    this.reportsBtn.addEventListener('click', () => {
      this.reportsBtn.classList.toggle('active', onReports());
    });

    this.autoPauseBtn = root.querySelector('[data-autopause]');
    this.autoPauseBtn.addEventListener('click', () => {
      this.setAutoPause(!this.autoPauseBtn.classList.contains('active'));
      onAutoPause(this.autoPauseBtn.classList.contains('active'));
    });

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

  setAutoPause(on) {
    this.autoPauseBtn.classList.toggle('active', on);
  }

  update(sim) {
    this.dayEl.textContent = sim.day;
    this.maxEl.textContent = sim.maxDays;
    this.cashEl.textContent = euro.format(sim.cash);
    this.cashEl.classList.toggle('negative', sim.cash < 0);
    this.serviceEl.textContent = `${Math.round(sim.serviceLevel * 100)}%`;
    this.seedEl.textContent = sim.seed;

    const ev = sim.currentEvent;
    this.eventEl.title = ev ? `Customer demand ×${ev.multiplier}` : '';
    this.eventEl.textContent = ev
      ? `${ev.name} ×${ev.multiplier} until day ${ev.endDay}`
      : '';
  }
}
