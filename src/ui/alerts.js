import { describeIncident, FACTORY_REPAIR, INCIDENT_ICONS } from '../sim/incidents.js';
import { BANKRUPT_DAYS } from '../sim/simulation.js';

const WARNING_ICONS = { event: '📅', storm: '⛈️', roadworks: '🚧', stock: '📦' };

// List of active problems in the top-left corner of the map, followed by early warnings
// ("Coming up") for things the player can still prepare for.
// The factory alert has a button to pay for a fast repair.
export class Alerts {
  constructor(root, { onRepair, onFocus }) {
    this.root = root;
    this.onRepair = onRepair;
    this.onFocus = onFocus;
    this.key = '';
  }

  update(sim) {
    // Nothing left to react to once the game is over
    const active = sim.isOver ? [] : sim.activeIncidents;
    const warnings = sim.isOver ? [] : sim.warnings;
    // Only rebuild when something changed, so a button is not replaced while being clicked
    const key = active.map((i) => `${i.id}:${i.endDay}:${i.paid}`).join('|') + `#${sim.isOver ? 'over' : sim.daysInDebt}#`
      + warnings.map((w) => w.title + w.detail).join('|');
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = '';

    if (sim.daysInDebt > 0 && !sim.isOver) {
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

      // Only building problems can be clicked (truck outages and storms have no building)
      if (sim.stage(incident.target)) {
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

    if (warnings.length) {
      const heading = document.createElement('div');
      heading.className = 'alerts-heading';
      heading.textContent = 'Coming up';
      this.root.append(heading);
    }
    for (const w of warnings) {
      const item = this.addItem(WARNING_ICONS[w.kind], w.title, w.detail, 'warning');
      if (w.target) {
        item.classList.add('clickable');
        item.addEventListener('click', () => this.onFocus(w.target));
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
