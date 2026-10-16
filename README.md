# Supply Chain Simulator

A 3D logistics tycoon game built for the Game Development module.
This README doubles as the **Game Design Document (GDD)**. Sections marked ✅ are implemented, 🔜 are planned.

---

## 1. Pitch

You run an entire supply chain, from the raw-material supplier to the shop counter.
Customers are unpredictable, trucks take time, and every unit sitting in a warehouse costs money.
Keep the shelves stocked without drowning in inventory, survive demand shocks, and grow a profitable logistics empire.

The hidden enemy is the **bullwhip effect**: small changes in customer demand grow into huge swings in orders further up the chain. Players who understand it win.

## 2. Game overview

| | |
|---|---|
| **Genre** | Tycoon / management simulation |
| **Perspective** | God-view, 3D world with an orbit camera |
| **Platform** | Web browser (desktop) |
| **Player role** | Manager of the whole network (AI rival companies are a stretch goal) |
| **Session length** | One level ≈ 60 in-game days ≈ 5–15 minutes |
| **Target audience** | Players who enjoy management games; students learning supply chain concepts |

## 3. Core gameplay loop

1. **Observe**: watch stock levels, trucks on the road and customer demand.
2. **Decide**: set order quantities, choose an ordering strategy per building, react to events.
3. **Consequences**: goods arrive after a lead time; sales earn money, while stock and shortages cost money.
4. **Grow** 🔜: spend profit on more trucks, bigger warehouses and new shops.

## 4. Mechanics

### 4.1 The chain ✅
Supplier → Factory → Warehouse → Retailer → Customers.
Each building holds stock, receives orders from the building after it and orders from the building before it.
Goods take a **lead time** (2–3 days) to travel between buildings.

### 4.2 Time ✅
The game advances in days (1 day per second at 1x). Play, pause and 1x/2x/4x speed controls.

### 4.3 Economy ✅
- Selling price: €10 per unit; raw material: €4 per unit.
- **Holding cost**: €0.50 per unit in stock per day.
- **Shortage cost**: €2 per unit backlogged (businesses wait) or per lost sale (customers leave).
- Starting cash: €5,000.

### 4.4 Ordering strategies ✅
Each building can be set to:
- **Auto: fixed target**: orders back up to a fixed stock level (stable, no bullwhip).
- **Auto: forecast**: forecasts demand with exponential smoothing (α = 0.25) and orders to cover it. Realistic, and it causes the bullwhip effect.
- **Manual**: the player sets the daily order quantity.

### 4.5 Demand events ✅
Three random events per level, generated from the level seed:
- Holiday rush (demand ×1.8 for 6 days)
- Viral product spike (×2.5 for 3 days)
- Local recession (×0.6 for 7 days)

### 4.6 Trucks and dispatch 🔜
Shipments are visible as trucks driving between buildings ✅ (placeholder models).
Planned: a limited truck fleet, a cost per trip, and buying more trucks.

### 4.7 Upgrades and expansion 🔜
Warehouse capacity, faster trucks (shorter lead time), extra retail shops.

### 4.8 Win / lose 🔜
- Lose: cash below €0 (bankruptcy).
- Win: survive the level; 1–3 stars based on profit and service level.

## 5. Levels / progression 🔜
Each level introduces one new idea:
1. **Corner shop**: one retailer, fixed supply. Learn ordering.
2. **The chain**: full four-stage chain on auto. Learn lead times.
3. **Rush hour**: demand events switched on.
4. **Bullwhip**: AI buildings forecast badly; the player must stabilise the chain.
5. **Tycoon**: open sandbox with upgrades.

## 6. Feedback and game feel
- ✅ Live charts: orders against demand, and stock levels.
- ✅ End-of-level report with final cash, service level and bullwhip ratio per stage.
- ✅ Event banner in the HUD.
- ✅ Buildings and labels turn red when stock runs out.
- 🔜 Coin pop-ups on sales, sound effects, camera focus on events.

## 7. Controls
| Input | Action |
|---|---|
| Left-drag | Orbit camera |
| Right-drag | Pan |
| Scroll | Zoom |
| HUD buttons | Play / pause, speed, restart |
| Stage panels | Ordering strategy and order quantity |

## 8. Art and audio direction
- Low-poly, bright, readable 3D (planned: Kenney CC0 asset packs).
- Clean flat UI panels below the 3D view.
- 🔜 Light background music and short UI and sale sound effects.

## 9. Technical design
- **Vite + vanilla JavaScript** (ES modules), **Three.js** (3D), **Chart.js** (charts).
- `src/sim/`: simulation engine in pure JavaScript, with no DOM or rendering code. Seeded random numbers make every level replayable.
- `src/game/`: fixed-timestep game loop on `requestAnimationFrame`.
- `src/render/`: Three.js world, built from the simulation state every frame.
- `src/ui/`: HUD, stage panels, charts.

## 10. Running the project
```bash
npm install
npm run dev     # opens on http://localhost:5173
npm run build   # production build in dist/
```

## 11. Development log
A Word document is written for every work session. It covers what was done, design decisions, commits, and errors with their fixes.

## 12. Credits
- Three.js, Chart.js, Vite (MIT licence)
- 3D assets: to be added (Kenney.nl, CC0)