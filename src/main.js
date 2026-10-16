import './style.css';
import { Stage } from './sim/Stage.js';
import { Simulation } from './sim/Simulation.js';

const stages = [
  new Stage({ id: 'retailer',  name: 'Retailer',  stock: 40, leadTime: 2, targetStock: 60 }),
  new Stage({ id: 'warehouse', name: 'Warehouse', stock: 60, leadTime: 2, targetStock: 60 }),
  new Stage({ id: 'factory',   name: 'Factory',   stock: 80, leadTime: 3, targetStock: 80 }),
  new Stage({ id: 'supplier',  name: 'Supplier',  infinite: true }),
];

const sim = new Simulation({ stages, seed: 42 });
for (let i = 0; i < 30; i++) sim.step();

console.table(sim.history.map((h) => ({
  day: h.day,
  demand: h.demand,
  retailerStock: h.retailer.stock,
  retailerOrdered: h.retailer.ordered,
  warehouseStock: h.warehouse.stock,
  factoryStock: h.factory.stock,
})));
for (const s of stages) console.log(s.name, 'total cost:', s.totalCost.toFixed(2));

document.querySelector('#app').innerHTML =
  '<p>Simulation engine running. Open the console (F12) to see the results.</p>';