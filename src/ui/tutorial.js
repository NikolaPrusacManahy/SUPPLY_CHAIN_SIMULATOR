// Optional step-by-step tutorial, shown as a card at the bottom of the screen while the game
// is paused. Some steps open a building or a tab so the player can see what is explained.
const STEPS = [
  {
    title: 'Welcome',
    text: 'You manage a supply chain for 60 days. Shops sell to customers, but every product has to travel there by truck first. Earn profit, keep customers served and avoid debt.',
    show: { view: 'home' },
  },
  {
    title: 'The chain',
    text: 'The supplier (far left) sends raw material to the factory, the factory makes products for the warehouse, and the warehouse supplies the Northgate, Riverside and Hillcrest shops. The factory and warehouse start empty; shops have about a week of stock.',
    show: { view: 'home' },
  },
  {
    title: 'Buildings',
    text: 'The label on each building shows its stock. A red ring means it has run out. Click a building or its label to open its panel: here you see stock, sales, incoming trucks and costs.',
    show: { select: 'warehouse', tab: 'overview' },
  },
  {
    title: 'Ordering and trucks',
    text: 'In Manage you choose how this building orders and which truck delivers to it. Vans are fast but carry little, lorries carry a lot but are slow and take a day to load. The road from the factory is long: a lorry needs 7 days, a van 2.',
    show: { select: 'warehouse', tab: 'manage' },
  },
  {
    title: 'Upgrades',
    text: 'Upgrades cost €1,500 each: bigger storage, a loading dock, more workers at the supplier or a bigger shop. Buy them when they solve a real problem.',
    show: { select: 'warehouse', tab: 'upgrade' },
  },
  {
    title: 'When things go wrong',
    text: 'Problems appear in the top-left corner: breakdowns 🔥, overworked supplier staff 😓, trucks out of service 🚚, storms ⛈️ and roadworks 🚧. A factory breakdown pauses the game so you can decide whether to pay for a fast repair.',
    show: { view: 'home' },
  },
  {
    title: 'Ready',
    text: 'Move with WASD, drag to rotate, scroll to zoom. Space pauses, Reports shows charts. Press Play (or Space) to start the first day. Good luck!',
    show: { view: 'home' },
  },
];

export class Tutorial {
  // actions: { select(id|null), tab(name), home(), onClose() }
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.index = 0;
  }

  get open() {
    return !this.root.hidden;
  }

  start() {
    this.index = 0;
    this.root.hidden = false;
    this.render();
  }

  // fromPlay = the player pressed Play, so there is no need to ask them to start
  close({ fromPlay = false } = {}) {
    this.root.hidden = true;
    this.actions.select(null);
    this.actions.home();
    if (!fromPlay) this.actions.onClose?.();
  }

  render() {
    const step = STEPS[this.index];
    const last = this.index === STEPS.length - 1;
    this.root.innerHTML = `
      <div class="tutorial-card">
        <span class="muted">Tutorial ${this.index + 1} / ${STEPS.length}</span>
        <strong>${step.title}</strong>
        <p>${step.text}</p>
        <div class="tutorial-buttons">
          <button data-skip>${last ? 'Close' : 'Skip tutorial'}</button>
          <span></span>
          ${this.index > 0 ? '<button data-back>Back</button>' : ''}
          ${last ? '' : '<button class="primary" data-next>Next</button>'}
        </div>
      </div>`;
    this.root.querySelector('[data-skip]').addEventListener('click', () => this.close());
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.go(-1));
    this.root.querySelector('[data-next]')?.addEventListener('click', () => this.go(1));

    if (step.show.select) {
      this.actions.select(step.show.select);
      this.actions.tab(step.show.tab);
    } else {
      this.actions.select(null);
      this.actions.home();
    }
  }

  go(delta) {
    this.index = Math.max(0, Math.min(STEPS.length - 1, this.index + delta));
    this.render();
  }
}
