import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadModels, fitModel } from './models.js';

// Keys must match stage ids. Order = road order.
// size/color are only used for the placeholder box shown until the models load.
// footprint = how wide the model is drawn; rot = turn (radians) to face the road.
const LAYOUT = {
  supplier:  { pos: [-18, 0, -6], size: [5, 3, 5], color: 0x888780, footprint: 7, rot: 0 },
  factory:   { pos: [-6, 0, 4],   size: [6, 5, 5], color: 0x7f77dd, footprint: 8, rot: 0 },
  warehouse: { pos: [6, 0, -4],   size: [7, 4, 5], color: 0x1d9e75, footprint: 8, rot: 0 },
  retailer:  { pos: [18, 0, 5],   size: [4, 3, 4], color: 0xd85a30, footprint: 6, rot: 0 },
};

// Decoration only: no game logic. [model key, x, z, footprint, rotation]
const PROPS = [
  ['containerA', -24, -9, 2.5, 0.3],
  ['tank', -23, -1, 2.5, 0],
  ['waterTower', -14, 10, 2.4, 0],
  ['containerA', 11, -9, 2.5, Math.PI / 2],
  ['containerB', 13, -6.5, 2.5, Math.PI / 2],
];

const TRUCK_LENGTH = 2.4;
const ROAD_Y = 0.1;

export class World3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9ea);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(0, 24, 30);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);

    // HTML labels that float above 3D objects
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.append(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.2; // stop the camera going under the ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 90;

    this.buildings = new Map(); // stage id -> { group, placeholder, label, labelDiv, ring }
    this.addLights();
    this.addGround();
    for (const [id, cfg] of Object.entries(LAYOUT)) this.addBuilding(id, cfg);
    this.addRoads();

    // Until the truck model loads, trucks are simple boxes
    this.truckTemplate = null;
    this.boxTruckGeometry = new THREE.BoxGeometry(0.9, 1, 1.6).translate(0, 0.5, 0);
    this.boxTruckMaterial = new THREE.MeshStandardMaterial({ color: 0xef9f27 });
    this.trucks = new Map(); // shipment object -> truck object
    this.currentSim = null;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    this.loadAssets();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a6a, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    this.scene.add(sun);
  }

  addGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 80),
      new THREE.MeshStandardMaterial({ color: 0x9cc27a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  addBuilding(id, { pos, size, color }) {
    const [w, h, d] = size;
    const group = new THREE.Group();
    group.position.set(pos[0], 0, pos[2]);
    group.userData.stageId = id;
    this.scene.add(group);

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color }),
    );
    placeholder.position.y = h / 2;
    placeholder.castShadow = true;
    placeholder.receiveShadow = true;
    group.add(placeholder);

    // Red ring on the ground that shows when the building runs out of stock
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(w, d) * 0.75, Math.max(w, d) * 0.9, 48),
      new THREE.MeshBasicMaterial({ color: 0xe24b4a, transparent: true, opacity: 0.8 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    ring.visible = false;
    group.add(ring);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'world-label';
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, h + 1.2, 0);
    group.add(label);

    this.buildings.set(id, { group, placeholder, label, labelDiv, ring });
  }

  roadPoint(id) {
    const p = LAYOUT[id].pos;
    return new THREE.Vector3(p[0], ROAD_Y, p[2]);
  }

  addRoads() {
    const ids = Object.keys(LAYOUT);
    const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (let i = 0; i < ids.length - 1; i++) {
      const a = this.roadPoint(ids[i]);
      const b = this.roadPoint(ids[i + 1]);
      const road = new THREE.Mesh(new THREE.BoxGeometry(a.distanceTo(b), 0.1, 2.2), material);
      road.position.copy(a).lerp(b, 0.5);
      road.position.y = 0.05;
      road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      road.receiveShadow = true;
      this.scene.add(road);
    }
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

    for (const [id, cfg] of Object.entries(LAYOUT)) {
      const b = this.buildings.get(id);
      const model = models[id];
      model.rotation.y = cfg.rot;
      const height = fitModel(model, cfg.footprint);
      b.group.remove(b.placeholder);
      b.group.add(model);
      b.label.position.y = height + 1.2;
      b.ring.geometry.dispose();
      b.ring.geometry = new THREE.RingGeometry(cfg.footprint * 0.58, cfg.footprint * 0.66, 48);
    }

    for (const [key, x, z, size, rot] of PROPS) {
      const prop = models[key].clone();
      prop.rotation.y = rot;
      fitModel(prop, size);
      const holder = new THREE.Group();
      holder.position.set(x, 0, z);
      holder.add(prop);
      this.scene.add(holder);
    }

    // Kenney cars face +Z, which is the direction lookAt() points, so no extra turn needed
    const truck = models.truck;
    const box = new THREE.Box3().setFromObject(truck);
    const length = box.getSize(new THREE.Vector3()).z;
    truck.scale.multiplyScalar(TRUCK_LENGTH / length);
    box.setFromObject(truck);
    truck.position.y -= box.min.y;
    this.truckTemplate = truck;

    this.clearTrucks(); // existing box trucks get rebuilt with the model next frame
  }

  createTruck() {
    const holder = new THREE.Group();
    if (this.truckTemplate) {
      holder.add(this.truckTemplate.clone()); // clone shares geometry + materials
    } else {
      const box = new THREE.Mesh(this.boxTruckGeometry, this.boxTruckMaterial);
      box.castShadow = true;
      holder.add(box);
    }
    this.scene.add(holder);
    return holder;
  }

  // One truck per shipment in the simulation; created when a shipment appears,
  // removed when it arrives. Position = how far through its trip we are.
  syncTrucks(sim, progress) {
    if (sim !== this.currentSim) {
      this.clearTrucks();
      this.currentSim = sim;
    }
    const now = sim.day + progress;
    const alive = new Set();

    for (const stage of sim.stages) {
      if (!stage.upstream) continue;
      const from = this.roadPoint(stage.upstream.id);
      const to = this.roadPoint(stage.id);

      for (const shipment of stage.inTransit) {
        alive.add(shipment);
        let truck = this.trucks.get(shipment);
        if (!truck) {
          truck = this.createTruck();
          this.trucks.set(shipment, truck);
        }
        const duration = shipment.arrivesOn - shipment.departedOn;
        const t = THREE.MathUtils.clamp((now - shipment.departedOn) / duration, 0, 1);
        truck.position.lerpVectors(from, to, t);
        truck.lookAt(to.x, ROAD_Y, to.z);
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

  updateLabels(sim) {
    for (const stage of sim.stages) {
      const b = this.buildings.get(stage.id);
      if (!b) continue;
      if (stage.infinite) {
        b.labelDiv.textContent = stage.name;
        continue;
      }
      const shortage = stage.lostSales ? stage.lastLost : stage.backlog;
      b.labelDiv.textContent = `${stage.name} · ${Math.round(stage.stock)}`;
      b.labelDiv.classList.toggle('alert', shortage > 0);
      b.ring.visible = shortage > 0;
    }
  }

  render(sim, progress) {
    this.syncTrucks(sim, progress);
    this.updateLabels(sim);
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