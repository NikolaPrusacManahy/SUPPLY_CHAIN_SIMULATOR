import Chart from 'chart.js/auto';

const COLORS = { demand: '#222222', shops: '#d85a30', warehouse: '#7f77dd', factory: '#1d9e75', cash: '#378add' };

const sumShops = (h, key, sim) => sim.shops.reduce((sum, s) => sum + h[s.id][key], 0);

// Each chart is a list of series: [label, colour, value(snapshot), dashed]
const CHARTS = [
  {
    title: 'Orders vs customer demand (bullwhip effect)',
    unit: 'Units',
    series: [
      ['Customer demand', COLORS.demand, (h) => h.demand, true],
      ['Shop orders (all)', COLORS.shops, (h, sim) => sumShops(h, 'ordered', sim)],
      ['Warehouse orders', COLORS.warehouse, (h) => h.warehouse.ordered],
      ['Factory orders', COLORS.factory, (h) => h.factory.ordered],
    ],
  },
  {
    title: 'Stock levels',
    unit: 'Units',
    series: [
      ['Shops (all)', COLORS.shops, (h, sim) => sumShops(h, 'stock', sim)],
      ['Warehouse', COLORS.warehouse, (h) => h.warehouse.stock],
      ['Factory', COLORS.factory, (h) => h.factory.stock],
    ],
  },
  {
    title: 'Cash',
    unit: '€',
    series: [['Cash', COLORS.cash, (h) => h.cash]],
  },
];

export class Charts {
  constructor(root) {
    this.root = root;
    root.innerHTML = CHARTS.map(() => '<div class="chart-box"><canvas></canvas></div>').join('');
    const canvases = root.querySelectorAll('canvas');
    this.charts = CHARTS.map((cfg, i) => new Chart(canvases[i], {
      type: 'line',
      data: {
        labels: [],
        datasets: cfg.series.map(([label, color, , dashed]) => ({
          label, data: [], borderColor: color, backgroundColor: color, borderWidth: 2,
          borderDash: dashed ? [6, 4] : [], pointRadius: 0, tension: 0.2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { title: { display: true, text: cfg.title } },
        scales: {
          x: { title: { display: true, text: 'Day' } },
          y: { beginAtZero: cfg.unit !== '€', title: { display: true, text: cfg.unit } },
        },
      },
    }));
  }

  get visible() {
    return !this.root.hidden;
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
    if (this.visible) this.charts.forEach((c) => c.resize());
    return this.visible;
  }

  // Redraw from the simulation history, so a restart (empty history) clears the charts
  update(sim) {
    if (!this.visible) return;
    const labels = sim.history.map((h) => h.day);
    CHARTS.forEach((cfg, i) => {
      const chart = this.charts[i];
      chart.data.labels = labels;
      cfg.series.forEach(([, , value], j) => {
        chart.data.datasets[j].data = sim.history.map((h) => value(h, sim));
      });
      chart.update('none');
    });
  }
}