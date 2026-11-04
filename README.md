# Supply Chain Simulator

**A 3D supply chain management game for the web browser.**

Game Development module project by Nikola Prusac Manahy, 2026.
Built with Vite, Three.js and Chart.js.

**Version 1.0.0** – final version, submitted on 5 November 2026.

This README is the **Game Design Document (GDD)**. It describes the game as it is currently built.

---

## Contents

1. [Overview](#1-overview)
2. [Gameplay](#2-gameplay)
3. [The world](#3-the-world)
4. [Game systems](#4-game-systems)
5. [Interface and feedback](#5-interface-and-feedback)
6. [Controls](#6-controls)
7. [Art direction](#7-art-direction)
8. [Technical design](#8-technical-design)
9. [Getting started](#9-getting-started)
10. [Development process](#10-development-process)
11. [Credits and licences](#11-credits-and-licences)

---

## 1. Overview

### 1.1 Concept

The player manages a complete supply chain: one supplier, one factory, a central warehouse and three shops in different towns. Raw material travels by truck to the factory, finished products go to the warehouse, and the warehouse supplies the shops. Customers can only buy what has actually arrived on the shelves.

Every decision has a cost. Trucks take time and money, stock in storage costs money every day, and empty shelves lose customers. Breakdowns, storms, roadworks and an overworked supplier make the job harder. The aim is to keep the shops stocked for 60 days without running out of cash, and to earn up to three stars.

The underlying challenge is the **bullwhip effect**: small changes in customer demand grow into large swings in orders further up the chain. Players who keep their orders steady perform best.

### 1.2 Key facts

| Item | Description |
|---|---|
| Genre | Management / tycoon simulation |
| Perspective | Top-down "god view" of a 3D map |
| Platform | Desktop web browser |
| Player role | Manager of the whole supply chain |
| Session length | One level of 60 in-game days (about 10 minutes at normal speed) |
| Objective | Survive 60 days without going bankrupt and earn one to three stars |

### 1.3 Design goals

- **Every decision is a trade-off.** Fast trucks cost more per unit, large orders cost storage, small orders risk empty shelves.
- **The chain is connected.** A problem at the supplier reaches the shops days later, so the player has to plan ahead.
- **Fair and replayable.** All random events come from a seed, so the same seed always produces the same game.

---

## 2. Gameplay

### 2.1 Game flow

1. **Start screen:** the goal, the star targets, the main risks and the controls. The player picks a difficulty (Easy, Normal or Hard) and chooses *Start game* or *Start with tutorial*.
2. **Tutorial (optional):** eight short steps that explain the chain, the building panel, ordering, trucks, upgrades, incidents and early warnings.
3. **Main game:** 60 in-game days.
4. **Results screen:** stars, profit, service level, a cost breakdown and a tip for the next attempt.

### 2.2 Core loop

| Step | What the player does |
|---|---|
| Observe | Reads stock levels on the building labels, watches trucks on the roads and checks the alerts list. |
| Decide | Opens a building to set its ordering mode, choose the truck type that delivers to it and buy upgrades. Reacts to incidents. |
| Simulate | Trucks load, travel and unload; shops sell to customers; storage, transport and lost sales are charged. |
| Evaluate | Reviews the reports and, after 60 days, the results screen. |

### 2.3 Win and lose conditions

- **Lose:** cash below €0 for three days in a row ends the game in bankruptcy. A warning appears on the first day in debt.
- **Win:** reaching day 60. The result is rated with stars (the same targets on every difficulty):

| Rating | Requirement |
|---|---|
| 1 star | Survive all 60 days |
| 2 stars | At least €5,000 profit |
| 3 stars | At least €10,000 profit and an 80% service level |

---

## 3. The world

### 3.1 The supply chain

```
Supplier ──> Factory ──> Warehouse ──┬──> Northgate shop ──> customers
                                     ├──> Riverside shop ──> customers
                                     └──> Hillcrest shop ──> customers
```

| Building | Role |
|---|---|
| Supplier | Produces raw material, up to 60 units per day |
| Factory | Turns raw material into finished products in one day |
| Warehouse | Stores products and supplies all three shops |
| Shops | Sell to local customers: Northgate about 8, Riverside about 6 and Hillcrest about 10 per day |

- The factory and the warehouse start **empty**; every unit has to come from the supplier. The shops start with about one week of stock.
- A building can only send what it has in stock. If the factory is empty, the warehouse receives nothing.
- When the warehouse is short, it divides its stock between the shops in proportion to their orders.

### 3.2 Map and distances

The buildings are spread across a large map and connected by roads. Delivery times are based on the real road length: 180 km from the supplier to the factory and 345 km from the factory to the warehouse. The choice of truck therefore has a large effect on how quickly goods arrive.

### 3.3 Time

One in-game day lasts 10 seconds at normal speed, and the game can run at x1, x2, x4 or x10. Trucks move in fixed one-hour steps, so the outcome is the same on every computer, regardless of frame rate.

---

## 4. Game systems

### 4.1 Trucks

Each route uses one truck type, chosen in the receiving building's panel.

| Truck | Capacity | Speed | Loading time | Cost per trip |
|---|---|---|---|---|
| Van | 15 units | 200 km/day | 0.25 day | €15 |
| Box truck | 40 units | 100 km/day | 0.5 day | €30 |
| Lorry | 100 units | 60 km/day | 1 day | €55 |

- Trucks are loaded at the sending building, leave one after another, travel the road and unload on arrival.
- Goods are added to a building only when its truck arrives.
- A trip costs the same whether the truck is full or not.

### 4.2 Ordering modes

Every building except the supplier uses one of four ordering modes.

| Mode | Behaviour | Trade-off |
|---|---|---|
| Auto: forecast | Orders what recent demand suggests | Reacts quickly, but can cause the bullwhip effect |
| Auto: fixed target | Tops stock up to a fixed level every day | Steady, but sends many part-full trucks |
| Auto: full trucks | Waits until stock is low, then orders full truckloads | Cheapest transport, more stock to store |
| Manual | The player sets the daily order | Full control, needs attention |

### 4.3 Economy

| Item | Value |
|---|---|
| Starting cash | €12,000 |
| Sale price | €30 per unit |
| Raw material | €8 per unit |
| Storage | €0.10 per unit per day (€1 per unit above the storage limit) |
| Lost sale (empty shop) | €3 per customer |
| Backlog (unfilled order between buildings) | €1 per unit per day |
| Storage limits | Factory 300, warehouse 300, each shop 100 units |

### 4.4 Incidents

Incidents are generated from the game seed, so a given seed always produces the same problems. Frequencies below are for Normal difficulty (see 4.7).

| Incident | Frequency | Effect |
|---|---|---|
| Supplier damaged | 2 per game | Nothing is shipped for 1–3 days |
| Supplier overworked | When more than 260 units are shipped in 5 days | The workers take 6 days off |
| Factory breakdown | 2 per game | Production stops for 10 days, or for 1 day if the player pays €2,000 |
| Truck type out of service | 2 per game | One truck type is unavailable for 7–9 days; goods wait unless the route switches truck type |
| Storm | 2 per game | All trucks travel at half speed for 2–3 days |
| Roadworks | 1 per game | One road is blocked for 7 days; trucks queue at the works |

A factory breakdown always pauses the game, because the player has to decide whether to pay for the repair.

### 4.5 Demand events

Three demand events occur in every game, one in each 20-day period. Each is chosen at random from:

| Event | Effect on demand | Duration |
|---|---|---|
| Holiday rush | x1.8 | 6 days |
| Viral product spike | x2.5 | 3 days |
| Local recession | x0.6 | 7 days |

### 4.6 Upgrades

Each upgrade costs €1,500 and can be bought once per building.

| Upgrade | Available for | Effect |
|---|---|---|
| Bigger storage | Factory, warehouse, shops | Doubles the storage limit |
| Loading dock | Supplier, factory, warehouse | Outgoing trucks load 4x faster and trips cost 25% less |
| More workers | Supplier | 50% more output and a 50% higher workload limit |
| Shop expansion | Shops | 25% more customers |

---

### 4.7 Difficulty

The difficulty is chosen on the start screen. Normal is the balanced game; a seed played on Normal always gives the same game.

| Setting | Easy | Normal | Hard |
|---|---|---|---|
| Starting cash | €15,000 | €12,000 | €10,000 |
| Supplier damaged / factory breakdowns / truck outages / storms | 1 each | 2 each | 3 each |
| Roadworks | 1 | 1 | 2 |
| Supplier workload limit (5 days) | 286 units | 260 units | 234 units |
| Supplier days off when overworked | 3 | 6 | 6 |
| Early warning time | 3 days | 2 days | 1 day |

Tested over 40 seeds per level: with the default settings, Easy averages about €5,400 profit, Normal about €3,300, and Hard about −€1,500, with some bankruptcies.

### 4.8 Early warnings

Some events can be seen coming, so the player has time to prepare. They are listed under *Coming up* below the active problems:

| Warning | Example |
|---|---|
| Demand event | "Holiday rush in 2 days: customer demand x1.8 from day 23 to 28" |
| Storm forecast | "Storm forecast tomorrow: trucks at half speed from day 21 to 22" |
| Planned roadworks | "Roadworks in 2 days on the road to Warehouse" |
| Shop running out | "Hillcrest Shop runs out in about 2 days: 18 in stock, next truck day 14" |

The shop warning plays the next days forward with normal demand and the trucks already on the way; the shop's label turns amber. In testing it was correct 95% of the time. Breakdowns and truck outages are never announced.

## 5. Interface and feedback

### 5.1 Screens

| Screen | Purpose |
|---|---|
| Start screen | Goal, star targets, risks, controls, difficulty, auto-pause option, start buttons |
| Tutorial | Step-by-step cards with Back, Next and Skip; opens the panels it explains |
| Main view | 3D map with the top bar, alerts list, building panel and reports |
| Results screen | Stars, difficulty, profit, service level, cost breakdown, tip, bullwhip ratios, Play again, Change difficulty |

### 5.2 In-game feedback

- **Building labels** show live stock. A red label and ring mark a building that has run out, an amber label a shop that will run out soon, and a blue ring the selected building.
- **Early warnings** under *Coming up* for demand events, storms, roadworks and shops about to run out.
- **Visual effects:** a blinking marker above a broken supplier or factory, traffic cones and a barrier at roadworks, and rain with a darker sky during storms.
- **Pop-up numbers** when goods arrive, when raw material reaches the factory and when products are finished.
- **Alerts list** of every active problem, with a repair button for the factory.
- **Building panel** with three tabs: *Overview* (stock graph, incoming trucks with arrival days, costs), *Manage* (ordering mode and truck type) and *Upgrade*.
- **Reports** with charts of orders against demand, stock levels and cash.

### 5.3 Pausing

- Space or the Play button pauses the game at any time.
- A banner at the top of the screen explains why the game is paused.
- With **Auto-pause** enabled (the default), the game also pauses when a new incident starts or when cash first drops below €0. Auto-pause can be switched off on the start screen or in the top bar.

---

## 6. Controls

| Input | Action |
|---|---|
| W, A, S, D or arrow keys | Move the camera |
| Left mouse drag | Rotate the camera |
| Right mouse drag | Pan the camera |
| Mouse wheel | Zoom |
| Click a building or its label | Select it and open its panel |
| Space | Pause / resume |
| Esc | Close the panel and reset the view |
| Top bar | Play/Pause, speed x1/x2/x4/x10, Auto-pause, Reports, Restart |

---

## 7. Art direction

- Low-poly 3D models from Kenney's City Kit (Industrial) and Car Kit.
- Clean, flat interface panels over the 3D view, with colour used mainly for status (red for problems, blue for selection).

---

## 8. Technical design

### 8.1 Technology

| Area | Technology |
|---|---|
| Build tool and dev server | Vite |
| Language | JavaScript (ES modules), no framework |
| 3D rendering | Three.js (GLTF models, CSS2D labels, OrbitControls) |
| Charts | Chart.js |

### 8.2 Project structure

```
SUPPLY_CHAIN_SIMULATOR/
├── index.html
├── public/models/          Kenney 3D models (industrial, cars)
└── src/
    ├── main.js             Connects the simulation, 3D world and interface
    ├── style.css
    ├── sim/                Simulation only, no graphics code
    │   ├── simulation.js   Game state, days, money, stars, bankruptcy
    │   ├── difficulty.js   Easy, Normal and Hard settings
    │   ├── warnings.js     Early warnings (Coming up)
    │   ├── stage.js        A building: stock, orders, ordering modes, costs
    │   ├── network.js      Building positions and roads (shared with the 3D world)
    │   ├── trucks.js       Truck types and travel times
    │   ├── incidents.js    Breakdowns, outages, storms, roadworks
    │   ├── upgrades.js     Upgrade definitions
    │   ├── events.js       Demand events
    │   ├── random.js       Seeded random number generator
    │   └── stats.js        Bullwhip ratio
    ├── game/
    │   └── game-loop.js    Fixed-rate loop on requestAnimationFrame
    ├── render/
    │   ├── world3d.js      Three.js scene, camera, trucks, labels, weather
    │   └── models.js       Model loading and scaling
    └── ui/
        ├── hud.js          Top bar
        ├── building-panel.js
        ├── alerts.js
        ├── charts.js       Reports
        ├── start-screen.js
        └── tutorial.js
```

### 8.3 Key technical decisions

- **Simulation separated from rendering.** `src/sim` contains no browser or Three.js code. The 3D world and the interface only read the simulation state, which keeps the game rules testable on their own.
- **Fixed time step.** Trucks move in 24 one-hour steps per day and the renderer smooths their movement between steps, so results do not depend on the frame rate.
- **Seeded randomness.** Demand, demand events and incidents use a seeded random number generator, so any game can be replayed exactly.
- **Single source for the map.** `network.js` defines the building positions and roads used for both the distances in the simulation and the roads drawn in 3D.

---

## 9. Getting started

Requirements: [Node.js](https://nodejs.org/) (developed with version 24).

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in a browser.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

To replay a specific game, add a seed to the address, for example `http://localhost:5173/?seed=1`.

---

## 10. Development process

- The game was built over several work sessions. A Word development log was written for each session, covering the work done, design decisions, errors and their fixes, and the commits made. The logs are in the `Doc_sessions` folder.
- Each session was also recorded as a screencast.
- Commit messages follow the Conventional Commits style (for example `feat:`, `fix:` and `docs:`).

---

## 11. Credits and licences

| Asset | Source | Licence |
|---|---|---|
| Three.js | threejs.org | MIT |
| Chart.js | chartjs.org | MIT |
| Vite | vitejs.dev | MIT |
| City Kit (Industrial), Car Kit | Kenney, kenney.nl | CC0 |
