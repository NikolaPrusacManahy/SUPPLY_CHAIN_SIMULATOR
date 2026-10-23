// Upgrades the player can buy for a building. Each one is bought once.
export const UPGRADE_COST = 1500;

export const UPGRADES = {
  storage: {
    name: 'Bigger storage',
    text: 'Doubles the storage space. Stock above the limit costs 10× more to keep.',
    for: ['factory', 'warehouse', 'shop'],
  },
  dock: {
    name: 'Loading dock',
    text: 'Trucks leaving this building load 4× faster and their trips cost 25% less.',
    for: ['supplier', 'factory', 'warehouse'],
  },
  workers: {
    name: 'More workers',
    text: 'Ships 50% more per day and can take 50% more work before the workers need days off.',
    for: ['supplier'],
  },
  expansion: {
    name: 'Shop expansion',
    text: '25% more customers every day.',
    for: ['shop'],
  },
};

export const upgradesFor = (stage) => Object.entries(UPGRADES).filter(([, u]) => u.for.includes(stage.type));
