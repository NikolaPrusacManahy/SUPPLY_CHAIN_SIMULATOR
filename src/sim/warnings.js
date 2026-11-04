// Early warnings: things the player can see coming and prepare for.
// Breakdowns and truck outages are never announced, so they stay a surprise.
export function upcomingWarnings(sim, lookAhead) {
  const today = sim.day;
  const soon = (day) => day > today && day - today <= lookAhead;
  const when = (day) => (day - today === 1 ? 'tomorrow' : `in ${day - today} days`);
  const list = [];

  for (const e of sim.events) {
    if (soon(e.startDay)) {
      list.push({ kind: 'event', target: null, title: `${e.name} ${when(e.startDay)}`,
                  detail: `Customer demand ×${e.multiplier} from day ${e.startDay} to ${e.endDay}` });
    }
  }

  for (const i of sim.incidents) {
    if (!soon(i.startDay)) continue;
    if (i.kind === 'storm') {
      list.push({ kind: 'storm', target: null, title: `Storm forecast ${when(i.startDay)}`,
                  detail: `Trucks at half speed from day ${i.startDay} to ${i.endDay}` });
    } else if (i.kind === 'roadworks') {
      list.push({ kind: 'roadworks', target: i.target,
                  title: `Roadworks ${when(i.startDay)} on the road to ${sim.stage(i.target).name}`,
                  detail: `Road closed from day ${i.startDay} to ${i.endDay}` });
    }
  }

  for (const shop of sim.shops) {
    const days = daysUntilEmpty(sim, shop, lookAhead);
    if (days === null) continue;
    const next = nextDelivery(sim, shop);
    list.push({ kind: 'stock', target: shop.id,
                title: `${shop.name} runs out ${days === 1 ? 'tomorrow' : `in about ${days} days`}`,
                detail: `${Math.round(shop.stock)} in stock · ${next === null ? 'no truck on the way' : `next truck day ${next}`}` });
  }
  return list;
}

// Day the shop's next truck arrives, or null if nothing is on the way
function nextDelivery(sim, shop) {
  const days = shop.inTransit.filter((s) => s.arrivedAt === null).map((s) => sim.eta(shop, s) + 1);
  return days.length ? Math.min(...days) : null;
}

// Plays the next days forward with normal demand and the trucks already on the way.
// Returns in how many days customers will find the shelves empty, or null if not soon.
function daysUntilEmpty(sim, shop, lookAhead) {
  let stock = shop.stock;
  if (stock <= 0) return null; // already empty: the red ring shows that
  const trucks = shop.inTransit.filter((s) => s.arrivedAt === null).map((s) => ({ qty: s.qty, eta: sim.eta(shop, s) }));
  for (let d = 1; d <= lookAhead; d++) {
    const day = sim.day + d;
    // A truck that arrives during the day before can be sold from on `day`
    for (const t of trucks) if (t.eta === day - 1 || (d === 1 && t.eta < day - 1)) stock += t.qty;
    const demand = sim.expectedDemand(shop) * (sim.eventOn(day)?.multiplier ?? 1);
    stock -= demand;
    if (stock < 0) return d;
  }
  return null;
}
