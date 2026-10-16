export class Stage {
  constructor({ id, name, stock = 0, leadTime = 2, targetStock = 60,
                holdingCost = 0.5, backlogCost = 2, infinite = false }) {
    Object.assign(this, { id, name, stock, leadTime, targetStock,
                          holdingCost, backlogCost, infinite });
    this.backlog = 0;        // units we owe downstream but couldn't ship yet
    this.onOrder = 0;        // units we ordered upstream that haven't arrived
    this.inTransit = [];     // shipments heading to us: { qty, arrivesOn }
    this.incomingOrder = 0;  // what downstream asked us for today
    this.lastOrder = 0;
    this.lastShipped = 0;
    this.totalCost = 0;
    this.upstream = null;
    this.downstream = null;
  }

  // Stock + what's coming - what we owe. Used for ordering decisions.
  get inventoryPosition() {
    return this.stock + this.onOrder - this.backlog;
  }

  receiveShipments(day) {
    const arrived = this.inTransit.filter((s) => s.arrivesOn <= day);
    this.inTransit = this.inTransit.filter((s) => s.arrivesOn > day);
    for (const s of arrived) {
      this.stock += s.qty;
      this.onOrder -= s.qty;
    }
  }

  // Ship as much as we can of today's order plus anything still owed
  fulfil(day) {
    const owed = this.incomingOrder + this.backlog;
    const shipped = this.infinite ? owed : Math.min(this.stock, owed);
    if (!this.infinite) this.stock -= shipped;
    this.backlog = owed - shipped;
    this.lastShipped = shipped;
    if (this.downstream && shipped > 0) {
      this.downstream.inTransit.push({
        qty: shipped,
        arrivesOn: day + this.downstream.leadTime,
      });
    }
  }

  // Automatic rule: order enough to bring inventory position back to target
  autoOrderQty() {
    return Math.max(0, this.targetStock - this.inventoryPosition);
  }

  placeOrder(qty) {
    this.lastOrder = qty;
    this.onOrder += qty;
    if (this.upstream) this.upstream.incomingOrder = qty;
  }

  addDailyCost() {
    if (this.infinite) return;
    this.totalCost += this.stock * this.holdingCost + this.backlog * this.backlogCost;
  }
}