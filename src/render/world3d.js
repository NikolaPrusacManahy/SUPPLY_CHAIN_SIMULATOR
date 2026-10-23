import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadModels, fitModel } from './models.js';
import { NODES } from '../sim/network.js';

// How each building type is drawn. Box size/colour is the placeholder shown until models load.
const STYLE = {
  supplier:  { model: 'supplier',  footprint: 10, box: [6, 3, 6], color: 0x888780 },
  factory:   { model: 'factory',   footprint: 12, box: [7, 5, 6], color: 0x7f77dd },
  warehouse: { model: 'warehouse', footprint: 12, box: [8, 4, 6], color: 0x1d9e75 },
  shop:      { model: 'shop',      footprint: 8, box: [5, 3, 5], color: 0xd85a30 },
};

// Decoration only, no game logic: [model key, x, z, footprint, rotation]
const DECOR = [
  ['tank', -129, -59, 3.5, 0],
  ['tank', -130, -41, 3, 0],
  ['waterTower', -71, -61, 3.5, 0],
  ['containerA', -49, -61, 3.5, 0],
  ['containerB', -49, -57, 3.5, 0],
  ['containerA', 10, 16, 3.5, Math.PI / 2],
  ['containerB', 14.5, 14, 3.5, Math.PI / 2],
  // Northgate
  ['townA', 41, -38, 6, 0], ['townD', 41, -22, 5, 0], ['townG', 29, -41, 6, Math.PI],
  // Riverside
  ['townA', 46, 14, 6, -Math.PI / 2], ['townH', 46, 1, 5, 0], ['townG', 35, 21, 6, 0],
  // Hillcrest
  ['townD', 31, 48, 5, 0], ['townA', 21, 56, 6, Math.PI], ['townH', 10, 54, 5, 0],
];

const TRUCK_LENGTH = { van: 2.4, box: 2.8, lorry: 3.4 };
const TRUCK_COLOR = { van: 0x378add, box: 0xef9f27, lorry: 0x639922 };
const ROAD_Y = 0.1;

const v3 = ([x, z], y = ROAD_Y) => new THREE.Vector3(x, y, z);

// Keyboard camera movement: [forward, right] per key
const MOVE_KEYS = {
  w: [1, 0], s: [-1, 0], a: [0, -1], d: [0, 1],
  arrowup: [1, 0], arrowdown: [-1, 0], arrowleft: [0, -1], arrowright: [0, 1],
};
const MAP_BOUNDS = { minX: -135, maxX: 60, minZ: -70, maxZ: 75 }; // how far the camera can move

export class World3D {
  // onSelect(stageId | null) is called when the player clicks a building or empty ground
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.onSelect = onSelect ?? (() => {});
    this.nodes = new Map(NODES.map((n) => [n.id, n]));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9ea);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.camera.position.set(-37, 150, 112);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);

    // HTML labels that float above 3D objects
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.append(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-37, 0, 4);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.2; // stop the camera going under the ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 260;
    this.controls.screenSpacePanning = false; // right-drag pans along the ground
    // Left-drag rotates, right-drag pans (optional), scroll zooms; WASD moves (see setupKeys)

    // Camera glide used when a building is selected. Any drag by the player cancels it.
    this.lastFrame = performance.now();
    this.focus = null;
    this.homeView = { target: this.controls.target.clone(), camera: this.camera.position.clone() };
    this.controls.addEventListener('start', () => { this.focus = null; });

    this.buildings = new Map(); // stage id -> { group, placeholder, label, labelDiv, ring, selectRing }
    this.routes = new Map();    // stage id -> route from its upstream building { points, lengths, total }
    this.addLights();
    this.addGround();
    for (const node of NODES) this.addBuilding(node);
    this.addRoads();

    this.truckTemplates = {}; // truck type -> model, filled once models load
    this.coneTemplate = null;
    this.roadworks = new THREE.Group(); // cones and barrier, rebuilt when roadworks change
    this.roadworksKey = '';
    this.scene.add(this.roadworks);
    this.storm = false;
    this.addRain();
    this.trucks = new Map();  // shipment object -> truck object
    this.currentSim = null;

    this.selectedId = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.setupPicking();
    this.keys = new Set();
    this.setupKeys();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.loadAssets();
  }

  addLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a6a, 1.2);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun = sun;
    sun.position.set(-7, 90, 40);
    sun.target.position.set(-37, 0, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -125, right: 125, top: 125, bottom: -125, far: 300 });
    this.scene.add(sun, sun.target);
  }

  addGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(270, 190),
      new THREE.MeshStandardMaterial({ color: 0x9cc27a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-37, 0, 3);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  addBuilding(node) {
    const style = STYLE[node.type];
    const [w, h, d] = style.box;
    const group = new THREE.Group();
    group.position.set(node.pos[0], 0, node.pos[1]);
    group.userData.stageId = node.id;
    this.scene.add(group);

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: style.color }),
    );
    placeholder.position.y = h / 2;
    placeholder.castShadow = true;
    group.add(placeholder);

    const ring = this.makeRing(style.footprint * 0.62, style.footprint * 0.7, 0xe24b4a, 0.15); // out of stock
    const selectRing = this.makeRing(style.footprint * 0.74, style.footprint * 0.8, 0x378add, 0.16); // selected
    group.add(ring, selectRing);

    // Blinking flame shown above a broken supplier or factory
    const flameDiv = document.createElement('div');
    flameDiv.className = 'incident-flame';
    flameDiv.innerHTML = '<span>🔥</span>'; // the renderer moves the div, CSS animates the span
    const flame = new CSS2DObject(flameDiv);
    flame.position.set(0, h + 4.5, 0);
    flame.visible = false;
    group.add(flame);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'world-label';
    labelDiv.addEventListener('click', () => this.onSelect(node.id)); // labels are clickable too
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, h + 1.5, 0);
    group.add(label);

    this.buildings.set(node.id, { group, placeholder, label, labelDiv, ring, selectRing, flame });
  }

  makeRing(inner, outer, color, y) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    ring.visible = false;
    ring.raycast = () => {}; // rings must not catch clicks
    return ring;
  }

  // Roads follow each building's delivery route; a square fills every corner
  addRoads() {
    const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const corner = new THREE.BoxGeometry(2.4, 0.1, 2.4);
    for (const node of NODES) {
      if (!node.route) continue;
      const points = node.route.map((p) => v3(p));
      const lengths = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        lengths.push(a.distanceTo(b));
        const road = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), 0.1, 2.4), material);
        road.position.copy(a).lerp(b, 0.5);
        road.position.y = 0.05;
        road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        road.receiveShadow = true;
        this.scene.add(road);
        const joint = new THREE.Mesh(corner, material);
        joint.position.set(b.x, 0.05, b.z);
        joint.receiveShadow = true;
        this.scene.add(joint);
      }
      this.routes.set(node.id, { points, lengths, total: lengths.reduce((a, b) => a + b, 0) });
    }
  }

  // Position at distance d along a route
  pointAlong(route, d, out) {
    let left = THREE.MathUtils.clamp(d, 0, route.total);
    for (let i = 0; i < route.lengths.length; i++) {
      if (left <= route.lengths[i] || i === route.lengths.length - 1) {
        return out.lerpVectors(route.points[i], route.points[i + 1], left / route.lengths[i]);
      }
      left -= route.lengths[i];
    }
    return out;
  }

  // Swap placeholders for the Kenney models. If loading fails the game keeps
  // working with the boxes, so a missing file never breaks gameplay.
  async loadAssets() {
    let models;
    try {
      models = await loadModels();
    } catch (err) {
      console.warn('3D models failed to load, using placeholder boxes.', err);
      return;
    }

    for (const node of NODES) {
      const style = STYLE[node.type];
      const b = this.buildings.get(node.id);
      const model = models[style.model].clone();
      const height = fitModel(model, style.footprint);
      b.group.remove(b.placeholder);
      b.group.add(model);
      b.label.position.y = height + 1.5;
      b.flame.position.y = height + 4.5;
    }

    for (const [key, x, z, size, rot] of DECOR) {
      const prop = models[key].clone();
      prop.rotation.y = rot;
      fitModel(prop, size);
      const holder = new THREE.Group();
      holder.position.set(x, 0, z);
      holder.add(prop);
      this.scene.add(holder);
    }

    // Kenney cars face +Z, the direction lookAt() points, so no extra turn is needed
    for (const type of Object.keys(TRUCK_LENGTH)) {
      const truck = models[type];
      const box = new THREE.Box3().setFromObject(truck);
      truck.scale.multiplyScalar(TRUCK_LENGTH[type] / box.getSize(new THREE.Vector3()).z);
      box.setFromObject(truck);
      truck.position.y -= box.min.y;
      this.truckTemplates[type] = truck;
    }
    const cone = models.cone;
    fitModel(cone, 1.1);
    this.coneTemplate = cone;
    this.roadworksKey = ''; // rebuild roadworks with the cone model

    this.clearTrucks(); // existing box trucks get rebuilt with the models next frame
  }

  createTruck(type) {
    const holder = new THREE.Group();
    const template = this.truckTemplates[type];
    if (template) {
      holder.add(template.clone()); // clone shares geometry and materials
    } else {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, TRUCK_LENGTH[type]).translate(0, 0.5, 0),
        new THREE.MeshStandardMaterial({ color: TRUCK_COLOR[type] }),
      );
      box.castShadow = true;
      holder.add(box);
    }
    this.scene.add(holder);
    return holder;
  }

  // One truck per shipment in the simulation. A truck waits at the depot while it is loaded,
  // then drives the route. The simulation removes it (and adds its goods) when it arrives.
  syncTrucks(sim, progress) {
    if (sim !== this.currentSim) {
      this.clearTrucks();
      this.currentSim = sim;
    }
    const now = sim.day + progress;
    const alive = new Set();
    const ahead = new THREE.Vector3();

    for (const stage of sim.stages) {
      const route = this.routes.get(stage.id);
      if (!route) continue;
      for (const shipment of stage.inTransit) {
        alive.add(shipment);
        let truck = this.trucks.get(shipment);
        if (!truck) {
          truck = this.createTruck(shipment.truck);
          this.trucks.set(shipment, truck);
        }
        // The simulation moves trucks in km once per in-game hour; between those steps the
        // truck keeps going at its last speed so the movement looks smooth
        const km = Math.min(stage.distance, shipment.km + (shipment.v ?? 0) * Math.max(0, now - sim.time));
        const d = (km / stage.distance) * route.total;
        this.pointAlong(route, d, truck.position);
        this.pointAlong(route, d + 0.5, ahead);
        if (ahead.distanceToSquared(truck.position) > 1e-4) truck.lookAt(ahead);
      }
    }

    for (const [shipment, truck] of this.trucks) {
      if (!alive.has(shipment)) {
        this.scene.remove(truck);
        this.trucks.delete(shipment);
      }
    }
  }

  // Cones and a striped barrier across the road where roadworks are blocking it
  updateRoadworks(sim) {
    const active = sim.activeIncidents.filter((i) => i.kind === 'roadworks');
    const key = active.map((i) => i.id).join('|') + (this.coneTemplate ? 'm' : '');
    if (key === this.roadworksKey) return;
    this.roadworksKey = key;
    this.roadworks.clear();

    for (const works of active) {
      const route = this.routes.get(works.target);
      const at = works.at * route.total;
      const pos = this.pointAlong(route, at + 1.5, new THREE.Vector3());
      const ahead = this.pointAlong(route, at + 2.5, new THREE.Vector3());
      const holder = new THREE.Group();
      holder.position.copy(pos);
      holder.lookAt(ahead.x, pos.y, ahead.z); // +Z along the road, X across it
      for (const x of [-1, 0, 1]) {
        const cone = this.coneTemplate
          ? this.coneTemplate.clone()
          : new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 12).translate(0, 0.5, 0),
            new THREE.MeshStandardMaterial({ color: 0xef7d22 }));
        cone.position.x = x * 0.9;
        holder.add(cone);
      }
      const barrier = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.35, 0.2),
        new THREE.MeshStandardMaterial({ color: 0xe24b4a }),
      );
      barrier.position.set(0, 1.3, 0.8);
      holder.add(barrier);
      this.roadworks.add(holder);
    }
  }

  // Falling rain, only shown during a storm
  addRain() {
    const count = 1500;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 220;
      const y = Math.random() * 80;
      const z = (Math.random() - 0.5) * 170;
      positions.set([x, y, z, x - 0.4, y - 2.5, z], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rain = new THREE.LineSegments(geometry,
      new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.6 }));
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // Storm: darker sky and light, fog and rain
  updateWeather(sim, dt) {
    const storm = sim.isStorm();
    if (storm !== this.storm) {
      this.storm = storm;
      this.scene.background.setHex(storm ? 0x6f7d88 : 0xbfd9ea);
      this.scene.fog = storm ? new THREE.Fog(0x6f7d88, 90, 260) : null;
      this.hemi.intensity = storm ? 0.7 : 1.2;
      this.sun.intensity = storm ? 0.6 : 2;
      this.rain.visible = storm;
    }
    if (!storm) return;
    // Keep the rain around where the camera is looking and let it fall
    this.rain.position.x = this.controls.target.x;
    this.rain.position.z = this.controls.target.z;
    const pos = this.rain.geometry.attributes.position;
    const fall = 70 * dt;
    for (let i = 0; i < pos.count; i += 2) {
      let y = pos.getY(i) - fall;
      if (y < 0) y += 80;
      pos.setY(i, y);
      pos.setY(i + 1, y - 2.5);
    }
    pos.needsUpdate = true;
  }

  clearTrucks() {
    for (const truck of this.trucks.values()) this.scene.remove(truck);
    this.trucks.clear();
  }

  // Floating "+60" over a building that fades upwards, e.g. when a truck unloads
  popup(stageId, text, kind) {
    const b = this.buildings.get(stageId);
    if (!b) return;
    const div = document.createElement('div');
    div.className = `popup popup-${kind}`;
    div.innerHTML = `<span>${text}</span>`; // the renderer moves the div, CSS animates the span
    const obj = new CSS2DObject(div);
    obj.position.copy(b.label.position);
    b.group.add(obj);
    setTimeout(() => {
      b.group.remove(obj);
      div.remove();
    }, 1600);
  }

  // A click is a press and release without dragging; a drag rotates the camera instead
  setupPicking() {
    const canvas = this.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 5) this.onSelect(this.pickBuilding(e));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (down) return;
      canvas.style.cursor = this.pickBuilding(e) ? 'pointer' : '';
    });
  }

  // WASD / arrow keys move the camera. Ignored while typing in an input.
  setupKeys() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (!MOVE_KEYS[key] || e.target.closest?.('input, select, textarea')) return;
      e.preventDefault(); // stop arrow keys scrolling the page
      this.keys.add(key);
      this.focus = null; // moving by hand cancels a camera glide
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear()); // avoid stuck keys after alt-tab
  }

  moveCamera(dt) {
    if (!this.keys.size) return;
    let forwardAmount = 0;
    let rightAmount = 0;
    for (const key of this.keys) {
      forwardAmount += MOVE_KEYS[key][0];
      rightAmount += MOVE_KEYS[key][1];
    }
    // Forward = the way the camera looks, flattened onto the ground
    const forward = this.controls.target.clone().sub(this.camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const speed = this.camera.position.distanceTo(this.controls.target) * 0.9; // faster when zoomed out
    const move = forward.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount));
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed * dt);

    const target = this.controls.target.clone().add(move);
    target.x = THREE.MathUtils.clamp(target.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
    target.z = THREE.MathUtils.clamp(target.z, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
    const applied = target.sub(this.controls.target);
    this.controls.target.add(applied);
    this.camera.position.add(applied);
  }

  // Returns the stage id of the building under the mouse, or null
  pickBuilding(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const groups = [...this.buildings.values()].map((b) => b.group);
    for (const hit of this.raycaster.intersectObjects(groups, true)) {
      for (let obj = hit.object; obj; obj = obj.parent) {
        if (obj.userData.stageId) return obj.userData.stageId;
      }
    }
    return null;
  }

  // Highlights a building and glides the camera to it. select(null) clears the highlight.
  select(id) {
    this.selectedId = id;
    for (const [stageId, b] of this.buildings) {
      b.selectRing.visible = stageId === id;
      b.labelDiv.classList.toggle('selected', stageId === id);
    }
    if (!id) return;
    const target = this.buildings.get(id).group.position.clone();
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.focus = { target, camera: target.clone().addScaledVector(direction, 38) };
  }

  resetView() {
    this.focus = { target: this.homeView.target.clone(), camera: this.homeView.camera.clone() };
  }

  updateCamera() {
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.frameDt = dt;
    this.moveCamera(dt);
    if (!this.focus) return;
    const a = 1 - Math.exp(-dt * 5); // smooth, frame-rate independent ease
    this.controls.target.lerp(this.focus.target, a);
    this.camera.position.lerp(this.focus.camera, a);
    if (this.camera.position.distanceTo(this.focus.camera) < 0.05) this.focus = null;
  }

  updateLabels(sim) {
    for (const stage of sim.stages) {
      const b = this.buildings.get(stage.id);
      if (!b) continue;
      const shortName = stage.type === 'shop' ? stage.name.replace(' Shop', '') : stage.name;
      // 🔥 for damage or breakdowns, 😓 when the supplier's workers are overworked
      const trouble = sim.activeIncidents.find((i) => i.target === stage.id
        && ['supplier', 'overworked', 'factory'].includes(i.kind));
      b.flame.visible = !!trouble;
      if (trouble) b.flame.element.firstChild.textContent = trouble.kind === 'overworked' ? '😓' : '🔥';
      if (stage.infinite) {
        b.labelDiv.textContent = shortName;
        continue;
      }
      const shortage = stage.lostSales ? stage.lastLost : stage.backlog;
      const making = stage.processing.reduce((sum, p) => sum + p.qty, 0);
      let text = `${shortName} · ${Math.round(sim.onHand(stage))}`;
      if (making > 0) text += ` · making ${making}`;
      b.labelDiv.textContent = text;
      b.labelDiv.classList.toggle('alert', shortage > 0);
      b.ring.visible = shortage > 0;
    }
  }

  render(sim, progress) {
    this.syncTrucks(sim, progress);
    this.updateLabels(sim);
    this.updateRoadworks(sim);
    this.updateCamera();
    this.updateWeather(sim, this.frameDt ?? 0);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }
}
