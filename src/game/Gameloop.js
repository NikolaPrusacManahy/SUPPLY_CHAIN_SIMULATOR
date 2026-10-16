export class GameLoop {
  constructor({ onTick, msPerDay = 1000 }) {
    this.onTick = onTick;
    this.msPerDay = msPerDay;
    this.speed = 1;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    requestAnimationFrame(this.frame);
  }

  frame = (now) => {
    // Cap the gap so switching tabs doesn't fast-forward dozens of days at once
    const dt = this.lastTime ? Math.min(now - this.lastTime, 250) : 0;
    this.lastTime = now;

    if (this.running) {
      this.accumulator += dt * this.speed;
      while (this.running && this.accumulator >= this.msPerDay) {
        this.accumulator -= this.msPerDay;
        this.onTick();
      }
    }
    requestAnimationFrame(this.frame);
  };

  play() { this.running = true; }
  pause() { this.running = false; this.accumulator = 0; }
  setSpeed(speed) { this.speed = speed; }
}