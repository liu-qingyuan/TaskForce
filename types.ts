
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

export type GameObjectType = 
  | 'player' 
  | 'bullet' 
  | 'enemy_bullet' 
  | 'enemy_ground' 
  | 'enemy_air' 
  | 'enemy_mech' 
  | 'enemy_jumper' 
  | 'enemy_seeker' 
  | 'enemy_dasher'
  | 'enemy_archer' 
  | 'enemy_mage'   
  | 'enemy_meteor' 
  | 'enemy_breaker'
  | 'particle' 
  | 'explosion'
  | 'crate'            // Standard solid block
  | 'crate_breakable'  // Destructible block
  | 'crate_hazard'     // Spikes/Damage block
  | 'crate_bouncy';    // Jump pad

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
  type: GameObjectType;
  hp: number;
  maxHp?: number;
  // Platformer specific
  grounded?: boolean;
  facing?: 1 | -1; // 1 for right, -1 for left
  // Weapon specific
  damage?: number;
  isGrenade?: boolean;
  isRocket?: boolean;
  explosionRadius?: number;
  // Visual variety & AI
  variant?: number;
  aiTimer?: number; // Used for jump cooldowns, charge states, etc.
  aiState?: number; // 0: Idle/Move, 1: Attack, 2: Special/Summon, 3: Retreat
}