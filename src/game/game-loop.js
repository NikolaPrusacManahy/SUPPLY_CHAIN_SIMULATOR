// One in-game day lasts msPerDay at x1 speed (10 seconds)
export class GameLoop {
  constructor({ onTick, onFrame, msPerDay = 10000 }) {
    this.onTick = onTick;
    this.onFrame = onFrame;
    this.msPerDay = msPerDay;
    this.speed = 1;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    requestAnimationFrame(this.frame);
  }

  // How far we are into the next day (0 to 1), used to animate trucks smoothly
  get progress() {
    return this.accumulator / this.msPerDay;
  }

  frame = (now) => {
    const dt = this.lastTime ? Math.min(now - this.lastTime, 250) : 0;
    this.lastTime = now;

    if (this.running) {
      this.accumulator += dt * this.speed;
      while (this.running && this.accumulator >= this.msPerDay) {
        this.accumulator -= this.msPerDay;
        this.onTick();
      }
    }
    this.onFrame?.(this.progress);
    requestAnimationFrame(this.frame);
  };

  play() { this.running = true; }
  pause() { this.running = false; } // keep accumulator so trucks don't jump back
  reset() { this.accumulator = 0; }
  setSpeed(speed) { this.speed = speed; }
}