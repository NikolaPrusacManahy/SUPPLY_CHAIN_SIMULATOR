import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Placeholder layout. Keys must match stage ids. Order = road order.
const LAYOUT = {
  supplier:  { pos: [-18, 0, -6], size: [5, 3, 5], color: 0x888780 },
  factory:   { pos: [-6, 0, 4],   size: [6, 5, 5], color: 0x7f77dd },
  warehouse: { pos: [6, 0, -4],   size: [7, 4, 5], color: 0x1d9e75 },
  retailer:  { pos: [18, 0, 5],   size: [4, 3, 4], color: 0xd85a30 },
};

export class World3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbfd9ea);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(0, 30, 38);

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

    this.buildings = new Map();
    this.labels = new Map();
    this.addLights();
    this.addGround();
    for (const [id, cfg] of Object.entries(LAYOUT)) this.addBuilding(id, cfg);
    this.addRoads();

    // Trucks share one geometry and material; only the meshes are separate
    this.truckGeometry = new THREE.BoxGeometry(0.9, 1, 1.6);
    this.truckMaterial = new THREE.MeshStandardMaterial({ color: 0xef9f27 });
    this.trucks = new Map(); // shipment object -> truck mesh
    this.currentSim = null;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color }),
    );
    mesh.position.set(pos[0], h / 2, pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.stageId = id;
    this.scene.add(mesh);
    this.buildings.set(id, mesh);

    const div = document.createElement('div');
    div.className = 'world-label';
    const label = new CSS2DObject(div);
    label.position.set(0, h / 2 + 1.2, 0);
    mesh.add(label);
    this.labels.set(id, div);
  }

  roadPoint(id) {
    const p = LAYOUT[id].pos;
    return new THREE.Vector3(p[0], 0.05, p[2]);
  }

  addRoads() {
    const ids = Object.keys(LAYOUT);
    const material = new THREE.MeshStandardMaterial({ color: 0x555555 });
    for (let i = 0; i < ids.length - 1; i++) {
      const a = this.roadPoint(ids[i]);
      const b = this.roadPoint(ids[i + 1]);
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(a.distanceTo(b), 0.1, 2.2),
        material,
      );
      road.position.copy(a).lerp(b, 0.5);
      road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      road.receiveShadow = true;
      this.scene.add(road);
    }
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
          truck = new THREE.Mesh(this.truckGeometry, this.truckMaterial);
          truck.castShadow = true;
          this.scene.add(truck);
          this.trucks.set(shipment, truck);
        }
        const duration = shipment.arrivesOn - shipment.departedOn;
        const t = THREE.MathUtils.clamp((now - shipment.departedOn) / duration, 0, 1);
        truck.position.lerpVectors(from, to, t);
        truck.position.y = 0.6;
        truck.lookAt(to.x, 0.6, to.z);
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
      const div = this.labels.get(stage.id);
      if (!div) continue;
      if (stage.infinite) {
        div.textContent = stage.name;
        continue;
      }
      const shortage = stage.lostSales ? stage.lastLost : stage.backlog;
      div.textContent = `${stage.name} · ${Math.round(stage.stock)}`;
      div.classList.toggle('alert', shortage > 0);
      this.buildings.get(stage.id).material.emissive.setHex(shortage > 0 ? 0x661111 : 0x000000);
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