export class Stage {
  constructor({ id, name, leadTime = 2, expectedDemand = 20, safetyDays = 1,
                targetStock, stock, holdingCost = 0.5, backlogCost = 2,
                infinite = false, lostSales = false, policy = 'forecast', alpha = 0.25 }) {
    Object.assign(this, { id, name, leadTime, safetyDays, holdingCost,
                          backlogCost, infinite, lostSales, policy, alpha });
    this.forecast = expectedDemand;
    // Enough to cover the lead time, today, and some safety days
    this.targetStock = targetStock ?? Math.round(expectedDemand * (leadTime + 1 + safetyDays));
    this.stock = infinite ? 0 : (stock ?? this.targetStock);

    this.backlog = 0;        // units owed downstream (not used if lostSales)
    this.lastLost = 0;       // customers turned away today (retailer only)
    this.onOrder = 0;        // ordered upstream, not yet arrived
    this.inTransit = [];     // shipments heading to us: { qty, departedOn, arrivesOn }
    this.incomingOrder = 0;
    this.lastOrder = 0;
    this.lastShipped = 0;
    this.totalCost = 0;
    this.upstream = null;
    this.downstream = null;
  }

  get inventoryPosition() {
    return this.stock + this.onOrder - this.backlog;
  }

  get inTransitTotal() {
    return this.inTransit.reduce((sum, s) => sum + s.qty, 0);
  }

  receiveShipments(day) {
    const arrived = this.inTransit.filter((s) => s.arrivesOn <= day);
    this.inTransit = this.inTransit.filter((s) => s.arrivesOn > day);
    for (const s of arrived) {
      this.stock += s.qty;
      this.onOrder -= s.qty;
    }
  }

  fulfil(day) {
    const owed = this.incomingOrder + this.backlog;
    const shipped = this.infinite ? owed : Math.min(this.stock, owed);
    if (!this.infinite) this.stock -= shipped;

    if (this.lostSales) {
      this.lastLost = owed - shipped; // customers don't wait
      this.backlog = 0;
    } else {
      this.backlog = owed - shipped;
    }
    this.lastShipped = shipped;

    if (this.downstream && shipped > 0) {
      this.downstream.inTransit.push({
        qty: shipped,
        departedOn: day,
        arrivesOn: day + this.downstream.leadTime,
      });
    }
  }

  // Exponential smoothing: forecast moves a fraction (alpha) toward each new order
  observeDemand(qty) {
    this.forecast = this.alpha * qty + (1 - this.alpha) * this.forecast;
  }

  autoOrderQty() {
    const target = this.policy === 'forecast'
      ? Math.round(this.forecast * (this.leadTime + 1 + this.safetyDays))
      : this.targetStock;
    return Math.max(0, target - this.inventoryPosition);
  }

  placeOrder(qty) {
    this.lastOrder = qty;
    this.onOrder += qty;
    if (this.upstream) this.upstream.incomingOrder = qty;
  }

  // Returns today's cost so the simulation can subtract it from cash
  addDailyCost() {
    if (this.infinite) return 0;
    const shortage = this.lostSales ? this.lastLost : this.backlog;
    const cost = this.stock * this.holdingCost + shortage * this.backlogCost;
    this.totalCost += cost;
    return cost;
  }
}
