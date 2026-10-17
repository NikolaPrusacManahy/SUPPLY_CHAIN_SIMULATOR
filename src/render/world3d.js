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
  ['tank', -63, -33, 3.5, 0],
  ['tank', -64, -17, 3, 0],
  ['waterTower', -35, -36, 3.5, 0],
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
const CONVOY_GAP = 4; // world units between trucks sent on the same day

const v3 = ([x, z], y = ROAD_Y) => new THREE.Vector3(x, y, z);

export class World3D {
  // onSelect(stageId | null) is called when the player clicks a building or empty ground
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.onSelect = onSelect ?? (() => {});
    this.nodes = new Map(NODES.map((n) => [n.id, n]));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9ea);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.camera.position.set(-8, 95, 72);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);

    // HTML labels that float above 3D objects
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.append(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(-8, 0, 10);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.2; // stop the camera going under the ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 170;

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
    this.trucks = new Map();  // shipment object -> truck object
    this.currentSim = null;

    this.selectedId = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.setupPicking();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.loadAssets();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a6a, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(30, 60, 25);
    sun.target.position.set(-5, 0, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85, far: 200 });
    this.scene.add(sun, sun.target);
  }

  addGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 170),
      new THREE.MeshStandardMaterial({ color: 0x9cc27a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-5, 0, 7);
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

    const labelDiv = document.createElement('div');
    labelDiv.className = 'world-label';
    labelDiv.addEventListener('click', () => this.onSelect(node.id)); // labels are clickable too
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, h + 1.5, 0);
    group.add(label);

    this.buildings.set(node.id, { group, placeholder, label, labelDiv, ring, selectRing });
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

  // One truck per shipment in the simulation; created when it departs, removed when it arrives.
  // Its position is how far through the trip it is; trucks sent together drive in a convoy.
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
        const t = (now - shipment.departedOn) / (shipment.arrivesOn - shipment.departedOn);
        const d = THREE.MathUtils.clamp(t, 0, 1) * route.total - shipment.convoyIndex * CONVOY_GAP;
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

  clearTrucks() {
    for (const truck of this.trucks.values()) this.scene.remove(truck);
    this.trucks.clear();
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
    const dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
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
      if (stage.infinite) {
        b.labelDiv.textContent = shortName;
        continue;
      }
      const shortage = stage.lostSales ? stage.lastLost : stage.backlog;
      b.labelDiv.textContent = `${shortName} · ${Math.round(stage.stock)}`;
      b.labelDiv.classList.toggle('alert', shortage > 0);
      b.ring.visible = shortage > 0;
    }
  }

  render(sim, progress) {
    this.syncTrucks(sim, progress);
    this.updateLabels(sim);
    this.updateCamera();
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