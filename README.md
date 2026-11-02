git add Doc_sessions# Supply Chain Simulator

A 3D logistics management game built for the Game Development module.
This README is the **Game Design Document (GDD)** and describes the game as it is built.

---

## 1. Pitch

You run an entire supply chain: a supplier, a factory, a central warehouse and three shops in different towns.
Raw material has to travel by truck to the factory, products to the warehouse, and goods to the shops before customers can buy them.
Trucks take time, every unit in storage costs money, and things go wrong: breakdowns, storms, roadworks and overworked staff.
Keep the shelves stocked without running out of cash, and earn up to three stars in 60 days.

The hidden enemy is the **bullwhip effect**: small changes in customer demand grow into huge swings in orders further up the chain. Players who understand it win.

## 2. Game overview

| | |
|---|---|
| **Genre** | Management / tycoon simulation |
| **Perspective** | God view of a 3D map |
| **Platform** | Web browser (desktop) |
| **Player role** | Manager of the whole supply chain |
| **Length** | One level of 60 in-game days (about 10 minutes at normal speed) |
| **Goal** | Survive 60 days without going bankrupt and earn 1 to 3 stars |

## 3. Core gameplay loop

1. **Observe:** stock levels on the building labels, trucks on the roads, alerts in the corner.
2. **Decide:** click a building to set how it orders, which truck type delivers to it, and which upgrades to buy. React to incidents.
3. **Consequences:** trucks load, drive and deliver; shops sell to customers; storage, transport and lost sales cost money.
4. **Results:** after 60 days the game shows profit, service level, stars and a tip for next time.

## 4. The world

### 4.1 The supply chain
Supplier → Factory → Warehouse → Northgate, Riverside and Hillcrest shops → customers.

| Building | Role |
|---|---|
| Supplier | Produces raw material, up to 60 units a day |
| Factory | Turns raw material into products in 1 day |
| Warehouse | Stores products and supplies all three shops |
| Shops | Sell to local customers (about 8, 6 and 10 a day) |

- The factory and warehouse start **empty**; every unit has to come from the supplier. Shops start with about a week of stock.
- A building can only send what it has. If the factory is empty, the warehouse gets nothing.
- When the warehouse is short, it shares its stock between the shops in proportion to their orders.

### 4.2 The map
Buildings are spread over a large map connected by roads. Delivery time comes from the real road distance:
180 km from supplier to factory and 345 km from factory to warehouse, so the truck choice matters.

### 4.3 Time
One day lasts 10 seconds at normal speed. Speed buttons: x1, x2, x4 and x10.
Trucks move in fixed one-hour steps, so the game plays out exactly the same on any computer.

## 5. Mechanics

### 5.1 Trucks
Every route uses one truck type, chosen by the player in the receiving building's panel.

| Truck | Capacity | Speed | Loading time | Cost per trip |
|---|---|---|---|---|
| Van | 15 units | 200 km/day | ¼ day | €15 |
| Box truck | 40 units | 100 km/day | ½ day | €30 |
| Lorry | 100 units | 60 km/day | 1 day | €55 |

- Trucks load at the depot, leave one after another, drive the road and unload when they arrive.
- Goods are added to a building the moment its truck arrives (with a "+40" pop-up).
- A trip costs the same whether the truck is full or not.

### 5.2 Ordering
Each building (except the supplier) has one of four ordering modes:
- **Auto: forecast** – orders what recent demand suggests. Reacts fast but can cause the bullwhip effect.
- **Auto: fixed target** – tops stock up to a fixed level every day. Steady, but sends many part-full trucks.
- **Auto: full trucks** – waits until stock is low, then orders whole truckloads. Cheapest transport, more stock to store.
- **Manual** – the player sets the daily order.

### 5.3 Economy
| | |
|---|---|
| Starting cash | €12,000 |
| Sale price | €30 per unit |
| Raw material | €8 per unit |
| Storage | €0.10 per unit per day (€1 above the storage limit) |
| Lost sale (shop empty) | €3 per customer |
| Backlog (business waiting) | €1 per unit per day |
| Storage limits | Factory 300, warehouse 300, shops 100 units |

### 5.4 Incidents
Generated from the game seed, so a seed always brings the same troubles.

| Incident | How often | Effect |
|---|---|---|
| 🔥 Supplier damaged | 2 per game | Nothing shipped for 1–3 days |
| 😓 Supplier overworked | When it ships over 260 units in 5 days | Workers take 6 days off |
| 🔥 Factory breakdown | 2 per game | Production stops for 10 days, or 1 day if the player pays €2,000 |
| 🚚 Truck type out of service | 2 per game | 7–9 days; goods wait at the depot unless the route switches truck type |
| ⛈️ Storm | 2 per game | All trucks at half speed for 2–3 days |
| 🚧 Roadworks | 1 per game | One road blocked for 7 days; trucks queue at the works |

A factory breakdown pauses the game so the player can decide whether to pay for the repair.

### 5.5 Demand events
Three per game: Holiday rush (demand ×1.8 for 6 days), Viral product spike (×2.5 for 3 days) and Local recession (×0.6 for 7 days).

### 5.6 Upgrades
Each costs €1,500 and can be bought once per building.

| Upgrade | Buildings | Effect |
|---|---|---|
| Bigger storage | Factory, warehouse, shops | Doubles the storage limit |
| Loading dock | Supplier, factory, warehouse | Trucks leaving load 4× faster and trips cost 25% less |
| More workers | Supplier | Ships 50% more and can take 50% more work |
| Shop expansion | Shops | 25% more customers |

### 5.7 Win and lose
- **Lose:** cash below €0 for 3 days in a row means bankruptcy. A warning appears as soon as cash drops below €0.
- **Stars after 60 days:** ★ survive · ★★ €5,000 profit · ★★★ €10,000 profit and 80% service level.

## 6. Feedback and game feel
- Start screen with the goal, star targets, what to watch out for and the controls. The player chooses **Start game** or **Start with tutorial** (optional, 7 short steps that open the panels being explained, with Back / Next / Skip).
- Pausing: Space or the Play button pauses at any time, and a banner at the top says why the game is paused. A factory breakdown always pauses the game. With **Auto-pause** on (default, can be switched off on the start screen or in the top bar) the game also pauses when any new problem starts or cash drops below €0.
- Floating labels with live stock on every building; a red ring when a building runs out; a blue ring for the selected building.
- Blinking 🔥 (or 😓) above a broken supplier or factory, traffic cones at roadworks, rain and a dark sky in storms.
- Pop-ups when goods arrive ("+40"), raw material reaches the factory ("+60 raw") and products are finished ("+60 made").
- Alerts list of every active problem, with the repair button for the factory.
- Building panel: stock graph, incoming trucks with arrival days, costs, ordering, truck choice and upgrades.
- Reports drawer with charts of orders against demand, stock levels and cash.
- Results screen with stars, a money breakdown and a tip based on what went worst.

## 7. Controls
| Input | Action |
|---|---|
| W A S D / arrow keys | Move the camera |
| Left-drag | Rotate the camera |
| Right-drag | Pan the camera |
| Scroll | Zoom |
| Click a building or its label | Select it and open its panel |
| Space | Pause / play |
| Esc | Close the panel and reset the view |
| Top bar | Play/pause, speed x1/x2/x4/x10, Auto-pause on/off, Reports, Restart |

## 8. Art direction
- Low-poly 3D models from Kenney's City Kit (Industrial) and Car Kit (CC0).
- Clean, flat interface panels on top of the 3D view.

## 9. Technical design
- **Vite + vanilla JavaScript** (ES modules), **Three.js** for the 3D world, **Chart.js** for the charts.
- `src/sim/` – the simulation, with no graphics code: buildings, trucks, incidents, upgrades, economy. Seeded random numbers make every game replayable.
- `src/game/` – fixed-rate game loop on `requestAnimationFrame`.
- `src/render/` – the Three.js world, built from the simulation state every frame.
- `src/ui/` – top bar, building panel, alerts, charts, start screen and tutorial.
- `src/sim/network.js` holds the building positions and roads, used by both the simulation (distances) and the 3D world (drawing).

## 10. Running the project
```bash
npm install
npm run dev     # opens on http://localhost:5173
```
Add `?seed=` and a number to the address (for example `http://localhost:5173/?seed=1`) to replay the same game.

## 11. Development log
A Word document was written for every work session, covering what was done, design decisions, commits, and errors with their fixes.

## 12. Credits
- Three.js, Chart.js, Vite (MIT licence)
- 3D models: Kenney City Kit (Industrial) and Car Kit, kenney.nl (CC0)
