import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// BASE_URL keeps the paths working when the game is hosted in a sub-folder (GitHub Pages)
const BASE = `${import.meta.env.BASE_URL}models/`;

// Kenney City Kit (Industrial) + Car Kit, CC0. Keys are used by world3d.js.
export const MODEL_FILES = {
  supplier: 'industrial/building-c.glb',
  factory: 'industrial/building-m.glb',
  warehouse: 'industrial/building-j.glb',
  shop: 'industrial/building-p.glb',
  townA: 'industrial/building-a.glb',
  townD: 'industrial/building-d.glb',
  townG: 'industrial/building-g.glb',
  townH: 'industrial/building-h.glb',
  tank: 'industrial/detail-tank-large.glb',
  waterTower: 'industrial/water-tower.glb',
  containerA: 'industrial/shipping-container-a.glb',
  containerB: 'industrial/shipping-container-b.glb',
  van: 'cars/van.glb',
  box: 'cars/delivery.glb',
  lorry: 'cars/delivery-flat.glb',
};

// Loads every model in parallel. Resolves to { key: THREE.Object3D }.
export async function loadModels(files = MODEL_FILES) {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    Object.entries(files).map(async ([key, path]) => {
      const gltf = await loader.loadAsync(BASE + path);
      gltf.scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      return [key, gltf.scene];
    }),
  );
  return Object.fromEntries(entries);
}

// Scales a model so its widest side (x or z) equals `size`, then moves it so it
// sits on y = 0 and is centred on x/z. Returns the model's new height.
export function fitModel(model, size) {
  const box = new THREE.Box3().setFromObject(model);
  const dim = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(size / Math.max(dim.x, dim.z));

  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  return box.max.y - box.min.y;
}