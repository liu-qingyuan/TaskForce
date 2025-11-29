
export interface Task {
  id: string;
  text: string; // The Quest Title
  description?: string; // Optional details
  completed: boolean;
  createdAt: number;
  reward: {
    xp: number;
  };
}

export interface PlayerProfile {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  rank: string;
}

export type AppMode = 'todo' | 'briefing' | 'game';

export interface GameStats {
  score: number;
  highScore: number;
  enemiesDefeated: number;
  distanceTraveled: number;
  currentStage: number;
}

export type WeaponType = 'pistol' | 'machinegun' | 'shotgun' | 'sniper' | 'grenade' | 'rocket' | 'quantum';

// Particle system types for the game
export interface GameObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  type: 'player' | 'bullet' | 'enemy_ground' | 'enemy_air' | 'enemy_mech' | 'particle' | 'crate' | 'explosion';
  hp: number;
  maxHp?: number;
  // Platformer specific
  grounded?: boolean;
  facing?: 1 | -1; // 1 for right, -1 for left
  // Weapon specific
  damage?: number;
  isGrenade?: boolean;
  isRocket?: boolean;
}
