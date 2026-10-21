import { describeIncident, FACTORY_REPAIR } from '../sim/incidents.js';

// List of active problems in the top-left corner of the map.
// The factory alert has a button to pay for a fast repair.
export class Alerts {
  constructor(root, { onRepair, onFocus }) {
    this.root = root;
    this.onRepair = onRepair;
    this.onFocus = onFocus;
    this.key = '';
  }

  update(sim) {
    const active = sim.activeIncidents;
    // Only rebuild when something changed, so the button is not replaced while being clicked
    const key = active.map((i) => `${i.id}:${i.endDay}:${i.paid}`).join('|');
    if (key === this.key) return;
    this.key = key;

    this.root.innerHTML = '';
    for (const incident of active) {
      const item = document.createElement('div');
      item.className = 'alert';
      const icon = incident.kind === 'trucks' ? '🚚' : incident.paid ? '🔧' : '🔥';
      const until = incident.kind === 'factory' && !incident.paid
        ? `until day ${incident.endDay} unless repaired`
        : `until day ${incident.endDay}`;
      item.innerHTML = `
        <span class="alert-icon">${icon}</span>
        <div><strong>${describeIncident(incident)}</strong><span class="muted">${until}</span></div>`;

      if (incident.kind !== 'trucks') {
        item.classList.add('clickable');
        item.addEventListener('click', () => this.onFocus(incident.target));
      }
      if (incident.kind === 'factory' && !incident.paid) {
        const btn = document.createElement('button');
        btn.textContent = `Repair now €${FACTORY_REPAIR.cost}`;
        btn.title = `Fixed after ${FACTORY_REPAIR.paidDays} day instead of ${FACTORY_REPAIR.unpaidDays}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onRepair(incident);
        });
        item.append(btn);
      }
      this.root.append(item);
    }
  }
}
