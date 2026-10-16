const fmt = (n) => Math.round(n).toLocaleString('en-IE');

export class StagePanels {
  constructor(root, stages) {
    this.stages = stages;
    this.cards = new Map();
    this.arrows = new Map();
    root.innerHTML = '';

    // Show supplier on the left, retailer on the right
    [...stages].reverse().forEach((stage, i) => {
      if (i > 0) root.append(this.createArrow(stage.id));
      root.append(this.createCard(stage));
    });
    root.append(this.createArrow('customers'), this.createCustomerCard());
  }

  createArrow(key) {
    const el = document.createElement('div');
    el.className = 'arrow';
    el.innerHTML = `<span class="arrow-line">&rarr;</span><span data-text></span>`;
    this.arrows.set(key, el.querySelector('[data-text]'));
    return el;
  }

  createCard(stage) {
    const card = document.createElement('div');
    card.className = 'card';

    if (stage.infinite) {
      card.innerHTML = `
        <h2>${stage.name}</h2>
        <p class="muted">Unlimited raw material</p>
        <dl><dt>Shipped today</dt><dd data-shipped>0</dd></dl>`;
    } else {
      const shortLabel = stage.lostSales ? 'Lost sales today' : 'Backlog';
      card.innerHTML = `
        <h2>${stage.name}</h2>
        <dl>
          <dt>Stock</dt><dd data-stock></dd>
          <dt>${shortLabel}</dt><dd data-short></dd>
          <dt>On order</dt><dd data-onorder></dd>
          <dt>Forecast</dt><dd data-forecast></dd>
          <dt>Ordered today</dt><dd data-ordered></dd>
          <dt>Total cost</dt><dd data-cost></dd>
        </dl>
        <label>Ordering
          <select data-mode>
            <option value="forecast">Auto: forecast</option>
            <option value="basestock">Auto: fixed target</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label>Order qty <input type="number" data-qty min="0" step="1" value="20" disabled /></label>`;

      const mode = card.querySelector('[data-mode]');
      const qty = card.querySelector('[data-qty]');
      mode.value = stage.policy;
      mode.addEventListener('change', () => {
        qty.disabled = mode.value !== 'manual';
        if (mode.value !== 'manual') stage.policy = mode.value;
      });
    }

    this.cards.set(stage.id, card);
    return card;
  }

  createCustomerCard() {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h2>Customers</h2>
      <dl>
        <dt>Demand today</dt><dd data-demand>0</dd>
        <dt>Sold today</dt><dd data-sold>0</dd>
      </dl>`;
    this.customerCard = card;
    return card;
  }

  // Manual orders for stages set to "Manual"
  getPlayerOrders() {
    const orders = {};
    for (const stage of this.stages) {
      const card = this.cards.get(stage.id);
      const mode = card.querySelector('[data-mode]');
      if (!mode || mode.value !== 'manual') continue;
      const value = Math.floor(Number(card.querySelector('[data-qty]').value));
      orders[stage.id] = Number.isFinite(value) && value > 0 ? value : 0;
    }
    return orders;
  }

  // Only update text, never rebuild the inputs, so typing isn't interrupted
  update(sim) {
    for (const stage of this.stages) {
      const card = this.cards.get(stage.id);
      const set = (key, value) => {
        const el = card.querySelector(`[data-${key}]`);
        if (el) el.textContent = value;
      };

      if (stage.infinite) {
        set('shipped', fmt(stage.lastShipped));
      } else {
        const shortage = stage.lostSales ? stage.lastLost : stage.backlog;
        set('stock', fmt(stage.stock));
        set('short', fmt(shortage));
        set('onorder', fmt(stage.onOrder));
        set('forecast', fmt(stage.forecast));
        set('ordered', fmt(stage.lastOrder));
        set('cost', `€${fmt(stage.totalCost)}`);
        card.classList.toggle('warning', shortage > 0);
      }

      const arrow = this.arrows.get(stage.id);
      if (arrow) arrow.textContent = `${fmt(stage.inTransitTotal)} in transit`;
    }

    this.customerCard.querySelector('[data-demand]').textContent = fmt(sim.lastDemand);
    this.customerCard.querySelector('[data-sold]').textContent = fmt(sim.stages[0].lastShipped);
    this.arrows.get('customers').textContent = 'sales';
  }
}
