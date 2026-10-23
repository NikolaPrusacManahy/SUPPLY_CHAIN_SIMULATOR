import { describeIncident, FACTORY_REPAIR, INCIDENT_ICONS } from '../sim/incidents.js';

const BANKRUPT_DAYS = 3;

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
    // Only rebuild when something changed, so a button is not replaced while being clicked
    const key = active.map((i) => `${i.id}:${i.endDay}:${i.paid}`).join('|') + `#${sim.daysInDebt}`;
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = '';

    if (sim.daysInDebt > 0) {
      const left = BANKRUPT_DAYS - sim.daysInDebt;
      this.addItem('💸', 'Cash below €0',
        `Bankrupt if it is still below €0 in ${left} day${left === 1 ? '' : 's'}`, 'danger');
    }

    for (const incident of active) {
      const icon = incident.paid ? '🔧' : INCIDENT_ICONS[incident.kind];
      const until = incident.kind === 'factory' && !incident.paid
        ? `until day ${incident.endDay} unless repaired`
        : `until day ${incident.endDay}`;
      const item = this.addItem(icon, describeIncident(incident, (id) => sim.stage(id).name), until);

      if (incident.target) {
        item.classList.add('clickable');
        item.addEventListener('click', () => this.onFocus(incident.target));
      }
      if (incident.kind === 'factory' && !incident.paid) {
        const btn = document.createElement('button');
        btn.textContent = `Repair now €${FACTORY_REPAIR.cost.toLocaleString('en-IE')}`;
        btn.title = `Fixed after ${FACTORY_REPAIR.paidDays} day instead of ${FACTORY_REPAIR.unpaidDays}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onRepair(incident);
        });
        item.append(btn);
      }
    }
  }

  addItem(icon, title, detail, extraClass = '') {
    const item = document.createElement('div');
    item.className = `alert ${extraClass}`;
    item.innerHTML = `<span class="alert-icon">${icon}</span><div><strong>${title}</strong><span class="muted">${detail}</span></div>`;
    this.root.append(item);
    return item;
  }
}
