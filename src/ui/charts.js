import Chart from 'chart.js/auto';

const STAGE_IDS = ['retailer', 'warehouse', 'factory'];
const COLORS = {
  demand: '#222222',
  retailer: '#d85a30',
  warehouse: '#7f77dd',
  factory: '#1d9e75',
};

function lineDataset(label, color, dashed = false) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderDash: dashed ? [6, 4] : [],
    pointRadius: 0,
    tension: 0.2,
  };
}

function createChart(canvas, title, datasets) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { title: { display: true, text: title } },
      scales: {
        x: { title: { display: true, text: 'Day' } },
        y: { beginAtZero: true, title: { display: true, text: 'Units' } },
      },
    },
  });
}

export class Charts {
  constructor(root, stageNames) {
    root.innerHTML = `
      <div class="chart-box"><canvas data-orders></canvas></div>
      <div class="chart-box"><canvas data-stock></canvas></div>`;

    this.ordersChart = createChart(
      root.querySelector('[data-orders]'),
      'Orders vs customer demand (bullwhip effect)',
      [
        lineDataset('Customer demand', COLORS.demand, true),
        ...STAGE_IDS.map((id) => lineDataset(`${stageNames[id]} orders`, COLORS[id])),
      ],
    );

    this.stockChart = createChart(
      root.querySelector('[data-stock]'),
      'Stock levels',
      STAGE_IDS.map((id) => lineDataset(`${stageNames[id]} stock`, COLORS[id])),
    );
  }

  // Redraw from the simulation history, so a restart (empty history) clears the charts
  update(history) {
    const labels = history.map((h) => h.day);

    this.ordersChart.data.labels = labels;
    this.ordersChart.data.datasets[0].data = history.map((h) => h.demand);
    STAGE_IDS.forEach((id, i) => {
      this.ordersChart.data.datasets[i + 1].data = history.map((h) => h[id].ordered);
    });

    this.stockChart.data.labels = labels;
    STAGE_IDS.forEach((id, i) => {
      this.stockChart.data.datasets[i].data = history.map((h) => h[id].stock);
    });

    this.ordersChart.update('none');
    this.stockChart.update('none');
  }
}