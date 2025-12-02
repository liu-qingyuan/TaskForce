
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameStats, GameObject, PlayerProfile, WeaponType, GameObjectType, GameState, CardRarity, PowerUpCard, PlayerModifiers } from '../types';
import { ArrowLeft, RefreshCw, Zap, Shield, Crosshair, Target, Bomb, Skull, Settings, Flame, Atom, Cpu, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Dna, Info, X } from 'lucide-react';
import { AudioService } from '../services/audio';

interface RunAndGunProps {
  onExit: () => void;
  missionBriefing: string;
  playerProfile: PlayerProfile;
}

interface WeaponConfig {
    id: WeaponType;
    name: string;
    cooldown: number;
    color: string;
    damage: number;
    speed: number;
    projectileCount?: number;
    explosionRadius?: number;
}

// Extended GameObject for pooling and optimization
interface GameEntity extends GameObject {
    active: boolean;
    poolId: number;
    hazardTimer?: number; // Cooldown for hazard damage
}

const DEFAULT_WEAPONS: Record<number, WeaponConfig> = {
    1: { id: 'pistol', name: 'M9 Blaster', cooldown: 200, color: '#38bdf8', damage: 25, speed: 12, projectileCount: 1 },
    2: { id: 'machinegun', name: 'Auto Rifle', cooldown: 80, color: '#facc15', damage: 15, speed: 18, projectileCount: 1 },
    3: { id: 'sniper', name: 'Sniper', cooldown: 1000, color: '#ec4899', damage: 150, speed: 30, projectileCount: 1 },
    4: { id: 'shotgun', name: 'Shotgun', cooldown: 700, color: '#ef4444', damage: 20, speed: 12, projectileCount: 5 },
    5: { id: 'grenade', name: 'Bomb', cooldown: 800, color: '#10b981', damage: 200, speed: 10, explosionRadius: 150, projectileCount: 1 },
    6: { id: 'rocket', name: 'Rocket', cooldown: 1200, color: '#f97316', damage: 300, speed: 15, explosionRadius: 200, projectileCount: 1 },
    7: { id: 'quantum', name: 'Quantum', cooldown: 5000, color: '#8b5cf6', damage: 1000, speed: 0, explosionRadius: 9999, projectileCount: 0 }
};

const RARITY_COLORS: Record<CardRarity, string> = {
    Common: '#94a3b8',
    Rare: '#3b82f6',
    Epic: '#a855f7',
    Legendary: '#eab308',
    Mythic: '#f43f5e'
};

const RunAndGunGame: React.FC<RunAndGunProps> = ({ onExit, missionBriefing, playerProfile }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [stats, setStats] = useState<GameStats>({ score: 0, highScore: 0, enemiesDefeated: 0, distanceTraveled: 0, currentStage: 1 });
  const [selectedWeaponIdx, setSelectedWeaponIdx] = useState<number>(1);
  const [weapons, setWeapons] = useState(DEFAULT_WEAPONS);
  const [editingWeapon, setEditingWeapon] = useState<number | null>(null);
  const [showLevelUp, setShowLevelUp] = useState<boolean>(false);
  const [bossWarning, setBossWarning] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  
  const [draftCards, setDraftCards] = useState<PowerUpCard[]>([]);
  const [modifiers, setModifiers] = useState<PlayerModifiers>({ damageMult: 1, moveSpeedMult: 1, fireRateMult: 1, maxHpAdd: 0, critChance: 0 });
  const modifiersRef = useRef<PlayerModifiers>({ damageMult: 1, moveSpeedMult: 1, fireRateMult: 1, maxHpAdd: 0, critChance: 0 });

  const [autoFire, setAutoFire] = useState(false);
  const autoFireRef = useRef(false);
  const [touchState, setTouchState] = useState({ left: false, right: false, jump: false, fire: false });
  
  const baseMaxHp = playerProfile.level >= 3 ? 5 : 3;

  // Constants
  const GRAVITY = 0.6;
  const JUMP_FORCE = -14;
  const BASE_MOVE_SPEED = 6;
  const FRICTION = 0.8;
  const STAGE_LENGTH = 300; 
  const DOUBLE_JUMP_FORCE = -12;
  const TIER_HEIGHT = 120;
  const PLATFORM_THICKNESS = 40; 
  
  // Optimization Constants
  const GRID_SIZE = 250; // Spatial Grid Cell Size
  const MAX_PARTICLES = 100;
  const MAX_BULLETS = 100;
  
  // Performance Limits
  const MIN_COOLDOWN = 60; // Minimum delay between shots in ms (approx 16 shots/sec max)
  const MAX_PROJECTILES = 8; // Max projectiles per shot

  // Refs
  const requestRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const cameraRef = useRef(0);
  const distanceRef = useRef(0);
  const stageRef = useRef(1);
  const mouseRef = useRef({ x: 0, y: 0 });
  const bossSpawnedRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const lastEnemySpawnDistRef = useRef(0);
  const lastTerrainSpawnDistRef = useRef(0);
  
  const playerRef = useRef<GameEntity & { jumps: number, invulnTimer: number }>({
    id: 'player',
    x: 100, y: 0, vx: 0, vy: 0, width: 40, height: 60,
    color: '#38bdf8', type: 'player', hp: baseMaxHp, maxHp: baseMaxHp,
    grounded: false, facing: 1, jumps: 0, invulnTimer: 0, active: true, poolId: -1
  });

  // Main Object Lists
  const entitiesRef = useRef<GameEntity[]>([]);
  // Object Pools
  const particlePoolRef = useRef<GameEntity[]>([]);
  const bulletPoolRef = useRef<GameEntity[]>([]);

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lastShotTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const starsRef = useRef<{x:number, y:number, size:number, alpha: number}[]>([]);

  // --- POOLING SYSTEM ---
  const initPools = () => {
      particlePoolRef.current = Array(MAX_PARTICLES).fill(null).map((_, i) => ({
          id: `p-${i}`, poolId: i, active: false, x: 0, y: 0, vx: 0, vy: 0, width: 0, height: 0, color: '', type: 'particle', hp: 0
      }));
      bulletPoolRef.current = Array(MAX_BULLETS).fill(null).map((_, i) => ({
          id: `b-${i}`, poolId: i, active: false, x: 0, y: 0, vx: 0, vy: 0, width: 0, height: 0, color: '', type: 'bullet', hp: 0
      }));
  };

  const getFromPool = (pool: GameEntity[], props: Partial<GameEntity>) => {
      const obj = pool.find(p => !p.active);
      if (obj) {
          Object.assign(obj, { active: true, ...props });
          return obj;
      }
      return null;
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    initPools();
    const saved = localStorage.getItem('tf_highscore_platformer');
    if (saved) setStats(s => ({ ...s, highScore: parseInt(saved, 10) }));

    const stars = [];
    for(let i=0; i<80; i++) {
        stars.push({ x: Math.random() * 2000, y: Math.random() * 1000, size: Math.random() * 2 + 0.5, alpha: Math.random() });
    }
    starsRef.current = stars;
  }, []);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          }
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
      resetGame();
      const handleResize = () => {
          if (canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
          }
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- GENERATION & LOGIC ---
  const generateCards = () => {
      const cards: PowerUpCard[] = [];
      const types = ['damage', 'speed', 'firerate', 'health', 'crit'] as const;
      
      for(let i=0; i<5; i++) {
          const r = Math.random();
          let rarity: CardRarity = 'Common';
          let multiplier = 1;
          
          if (r < 0.05) { rarity = 'Mythic'; multiplier = 50; }
          else if (r < 0.20) { rarity = 'Legendary'; multiplier = 10; }
          else if (r < 0.40) { rarity = 'Epic'; multiplier = 5; }
          else if (r < 0.65) { rarity = 'Rare'; multiplier = 1.5; }
          else { rarity = 'Common'; multiplier = 1.0; }

          const type = types[Math.floor(Math.random() * types.length)];
          let desc = "";
          let value = 0;

          if (type === 'damage') { value = 0.10 * multiplier; desc = `+${Math.round(value * 100)}% Damage`; }
          else if (type === 'speed') { value = 0.05 * multiplier; desc = `+${Math.round(value * 100)}% Speed`; }
          else if (type === 'firerate') { value = 0.10 * multiplier; desc = `+${Math.round(value * 100)}% Fire Rate`; }
          else if (type === 'health') { value = Math.max(1, Math.round(1 * multiplier)); desc = `+${value} Max HP`; }
          else if (type === 'crit') { value = 0.01 * multiplier; desc = `+${Math.round(value * 100)}% Crit`; }

          cards.push({ id: `card-${Date.now()}-${i}`, rarity, type, value, description: desc });
      }
      setDraftCards(cards);
  };

  const handleSelectCard = (card: PowerUpCard) => {
      setModifiers(prev => {
          const next = { ...prev };
          if (card.type === 'damage') next.damageMult += card.value;
          if (card.type === 'speed') next.moveSpeedMult += card.value;
          if (card.type === 'firerate') next.fireRateMult += card.value;
          if (card.type === 'health') { next.maxHpAdd += card.value; playerRef.current.maxHp = baseMaxHp + next.maxHpAdd; playerRef.current.hp += card.value; }
          if (card.type === 'crit') next.critChance += card.value;
          modifiersRef.current = next;
          return next;
      });
      setGameState('playing');
  };

  const resetGame = () => {
    scoreRef.current = 0;
    cameraRef.current = 0;
    distanceRef.current = 0;
    stageRef.current = 1;
    bossSpawnedRef.current = 0;
    lastEnemySpawnDistRef.current = 0;
    lastTerrainSpawnDistRef.current = 0;
    entitiesRef.current = []; // Clear main entities
    // Reset Pools
    particlePoolRef.current.forEach(p => p.active = false);
    bulletPoolRef.current.forEach(b => b.active = false);
    
    setGameState('playing');
    setStats({ score: 0, highScore: stats.highScore, enemiesDefeated: 0, distanceTraveled: 0, currentStage: 1 });
    
    modifiersRef.current = { damageMult: 1, moveSpeedMult: 1, fireRateMult: 1, maxHpAdd: 0, critChance: 0 };
    setModifiers(modifiersRef.current);
    autoFireRef.current = false;
    setAutoFire(false);
    
    if (canvasRef.current) {
        playerRef.current.x = 100;
        playerRef.current.y = canvasRef.current.height - 200;
        playerRef.current.vx = 0;
        playerRef.current.vy = 0;
        playerRef.current.hp = baseMaxHp;
        playerRef.current.maxHp = baseMaxHp;
        playerRef.current.jumps = 0;
        playerRef.current.invulnTimer = 0;
    }
  };

  const spawnBoss = (canvasWidth: number, level: number) => {
      setBossWarning(true);
      setTimeout(() => setBossWarning(false), 3000);
      const spawnX = cameraRef.current + canvasWidth + 100;
      entitiesRef.current.push({
          id: `boss-${Date.now()}`, x: spawnX, y: 0, vx: 0, vy: 0, width: 140, height: 180,
          color: '#ef4444', type: 'enemy_mech', hp: 1500 + (level * 200), maxHp: 1500 + (level * 200), grounded: false, facing: -1, variant: 0, aiState: 0, aiTimer: 0, active: true, poolId: -1, hazardTimer: 0
      });
  };

  const spawnEnemy = (canvasWidth: number, overrideX?: number, overrideY?: number, forceType?: GameObjectType) => {
    const spawnX = overrideX ?? (cameraRef.current + canvasWidth + 50);
    const stage = stageRef.current;
    const bossExists = entitiesRef.current.some(o => o.active && o.hp > 0 && o.type === 'enemy_mech' && o.width > 100);
    if (bossExists && !forceType && Math.random() > 0.2) return; 

    let enemyType: GameObjectType = forceType || 'enemy_ground';
    
    if (!forceType) {
        const r = Math.random();
        if (stage === 1) {
            if (r > 0.9) enemyType = 'enemy_jumper'; else if (r > 0.8) enemyType = 'enemy_archer'; else enemyType = 'enemy_ground';
        } else if (stage === 2) {
            if (r > 0.95) enemyType = 'enemy_mage'; else if (r > 0.9) enemyType = 'enemy_dasher'; else if (r > 0.8) enemyType = 'enemy_seeker'; else if (r > 0.7) enemyType = 'enemy_archer'; else if (r > 0.6) enemyType = 'enemy_jumper'; else if (r > 0.4) enemyType = 'enemy_air'; else enemyType = 'enemy_ground';
        } else {
            if (r > 0.95) enemyType = 'enemy_meteor'; else if (r > 0.90) enemyType = 'enemy_mech'; else if (r > 0.85) enemyType = 'enemy_breaker'; else if (r > 0.80) enemyType = 'enemy_mage'; else if (r > 0.70) enemyType = 'enemy_dasher'; else if (r > 0.60) enemyType = 'enemy_archer'; else if (r > 0.40) enemyType = 'enemy_seeker'; else enemyType = 'enemy_ground';
        }
    }
    
    const variant = Math.floor(Math.random() * 3);
    const id = `e-${Date.now()}-${Math.random()}`;
    const defaults = { x: spawnX, vx: 0, vy: 0, facing: -1 as 1 | -1, variant, aiTimer: 0, aiState: 0, active: true, poolId: -1, hazardTimer: 0 };

    if (enemyType === 'enemy_meteor') entitiesRef.current.push({ ...defaults, id, y: -100, vy: 5 + Math.random()*5, width: 40, height: 40, color: '#f97316', type: 'enemy_meteor', hp: 30, maxHp: 30 });
    else if (enemyType === 'enemy_mage') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 300) + 100), width: 40, height: 60, color: '#a855f7', type: 'enemy_mage', hp: 60+(stage*10), maxHp: 60+(stage*10) });
    else if (enemyType === 'enemy_archer') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 35, height: 55, color: '#10b981', type: 'enemy_archer', hp: 40+(stage*10), maxHp: 40+(stage*10), grounded: false });
    else if (enemyType === 'enemy_breaker') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -0.5, width: 55, height: 70, color: '#78716c', type: 'enemy_breaker', hp: 150+(stage*20), maxHp: 150+(stage*20), grounded: false });
    else if (enemyType === 'enemy_air') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 300) + 50), vx: -3-(stage*0.5), width: 35, height: 25, color: '#38bdf8', type: 'enemy_air', hp: 30+(stage*10), maxHp: 30+(stage*10), aiState: 0 });
    else if (enemyType === 'enemy_seeker') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 200) + 50), vx: -2, width: 30, height: 30, color: '#d946ef', type: 'enemy_seeker', hp: 20+(stage*10), maxHp: 20+(stage*10) });
    else if (enemyType === 'enemy_mech') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 70, height: 90, color: '#6366f1', type: 'enemy_mech', hp: 200+(stage*50), maxHp: 200+(stage*50), grounded: false });
    else if (enemyType === 'enemy_jumper') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -2, width: 35, height: 40, color: '#84cc16', type: 'enemy_jumper', hp: 40+(stage*10), maxHp: 40+(stage*10), grounded: false });
    else if (enemyType === 'enemy_dasher') entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 50, height: 30, color: '#eab308', type: 'enemy_dasher', hp: 60+(stage*15), maxHp: 60+(stage*15), grounded: false });
    else entitiesRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -2-(stage*0.5), width: 35, height: 55, color: '#94a3b8', type: 'enemy_ground', hp: 50+(stage*10), maxHp: 50+(stage*10), grounded: false });
  };

  const spawnTerrain = (canvasWidth: number, groundLevel: number) => {
      const spawnX = cameraRef.current + canvasWidth + 100 + Math.random() * 50;
      const r = Math.random();
      let tier = 1;
      if (r > 0.9) tier = 5; else if (r > 0.75) tier = 4; else if (r > 0.55) tier = 3; else if (r > 0.3) tier = 2;
      const width = 120 + Math.random() * 150;
      const height = PLATFORM_THICKNESS; 
      const y = groundLevel - (tier * TIER_HEIGHT);
      if (y < 50) return;

      const typeChance = Math.random();
      let type: GameObjectType = 'crate';
      let color = '#1e293b';
      let hp = 999;
      
      if (typeChance > 0.85) { type = 'crate_hazard'; color = '#991b1b'; } 
      else if (typeChance > 0.7) { type = 'crate_bouncy'; color = '#15803d'; } 
      else if (typeChance > 0.5 && tier < 4) { type = 'crate_breakable'; color = '#1e3a8a'; hp = 50; }

      if (Math.random() > 0.9 && tier === 1 && type === 'crate') {
          entitiesRef.current.push({ id: `w-${Date.now()}`, x: spawnX, y: groundLevel - 200, vx: 0, vy: 0, width: 40, height: 200, color, type, hp, active: true, poolId: -1 });
      } else {
          entitiesRef.current.push({ id: `t-${Date.now()}`, x: spawnX, y, vx: 0, vy: 0, width, height, color, type, hp, active: true, poolId: -1 });
      }
  };

  const applyDamage = (target: GameEntity, amount: number) => {
      if (target.hp <= 0 || !target.active) return;
      target.hp -= amount;
      if (target.hp <= 0) {
          target.active = false; // Mark inactive instead of removing (for pooled items) or filter later
          AudioService.explosion();
          spawnParticle(target.x + target.width/2, target.y + target.height/2, target.color, 15);
          const isBoss = target.width > 100;
          if (target.type.startsWith('enemy')) {
            scoreRef.current += isBoss ? 5000 : (target.type === 'enemy_mech' ? 500 : 100);
          }
      }
  };

  const spawnExplosion = (x: number, y: number, size: number, damage: number = 0) => {
      AudioService.explosion();
      entitiesRef.current.push({ id: `ex-${Date.now()}`, x: x-size/2, y: y-size/2, vx:0, vy:0, width: size, height: size, color: '#f87171', type: 'explosion', hp: 10, damage: 0, active: true, poolId: -1 });
      spawnParticle(x, y, '#fca5a5', 5); // Reduced particle count
      
      const explosionRect = { x: x - size/2, y: y - size/2, width: size, height: size, id: 'temp', vx:0, vy:0, color:'', type:'explosion' as const, hp: 0 };
      entitiesRef.current.forEach(e => {
          if (e.active && (e.type.startsWith('enemy') || e.type === 'crate_breakable') && checkCollision(explosionRect, e)) {
              applyDamage(e, damage);
          }
      });
  };

  const spawnParticle = (x: number, y: number, color: string, count: number) => {
    // Limited particle spawning using Pool
    for (let i = 0; i < count; i++) {
      const p = getFromPool(particlePoolRef.current, {
          x, y, 
          vx: (Math.random() - 0.5) * 10, 
          vy: (Math.random() - 0.5) * 10,
          width: 3, height: 3, color, hp: 1
      });
    }
  };

  const checkCollision = (rect1: {x:number, y:number, width:number, height:number}, rect2: {x:number, y:number, width:number, height:number}) => {
    return (rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y);
  };

  const switchWeapon = (key: number) => {
      if (weapons[key]) {
          setSelectedWeaponIdx(key);
          AudioService.switch();
      }
  };

  const handleUpdateWeapon = (e: React.ChangeEvent<HTMLInputElement>, field: keyof WeaponConfig) => {
      if (editingWeapon === null) return;
      const val = parseFloat(e.target.value);
      setWeapons(prev => ({ ...prev, [editingWeapon]: { ...prev[editingWeapon], [field]: val } }));
  };
  
  const handleTouchStart = (action: string) => {
      keysRef.current[action] = true;
      if (action === 'click') setTouchState(prev => ({...prev, fire: true}));
      if (action === 'ArrowUp') setTouchState(prev => ({...prev, jump: true}));
      if (action === 'ArrowLeft') setTouchState(prev => ({...prev, left: true}));
      if (action === 'ArrowRight') setTouchState(prev => ({...prev, right: true}));
      
      if (action === 'ArrowUp' && gameState === 'playing') {
          const player = playerRef.current;
           if (player.grounded) { player.vy = JUMP_FORCE; player.grounded = false; player.jumps = 1; AudioService.jump(); } 
           else if (player.jumps < 2) { player.vy = DOUBLE_JUMP_FORCE; player.jumps = 2; AudioService.jump(); }
      }
  };
  const handleTouchEnd = (action: string) => {
      keysRef.current[action] = false;
      if (action === 'click') setTouchState(prev => ({...prev, fire: false}));
      if (action === 'ArrowUp') setTouchState(prev => ({...prev, jump: false}));
      if (action === 'ArrowLeft') setTouchState(prev => ({...prev, left: false}));
      if (action === 'ArrowRight') setTouchState(prev => ({...prev, right: false}));
  };

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState !== 'playing') return;

    frameCountRef.current++;
    const groundLevel = canvas.height - 50;
    const player = playerRef.current;
    const mods = modifiersRef.current;
    
    if (player.invulnTimer > 0) player.invulnTimer--;

    ['1','2','3','4','5','6','7'].forEach(key => { if (keysRef.current[key]) switchWeapon(parseInt(key)); });

    const moveSpeed = BASE_MOVE_SPEED * mods.moveSpeedMult;
    if (keysRef.current['ArrowRight'] || keysRef.current['d']) { player.vx += 1; player.facing = 1; } 
    else if (keysRef.current['ArrowLeft'] || keysRef.current['a']) { player.vx -= 1; player.facing = -1; } 
    else { player.vx *= FRICTION; }
    player.vx = Math.max(-moveSpeed, Math.min(moveSpeed, player.vx));
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;

    // Player Ground Physics
    if (player.y + player.height >= groundLevel) { player.y = groundLevel - player.height; player.vy = 0; player.grounded = true; player.jumps = 0; } else { player.grounded = false; }
    
    // --- SPATIAL GRID BUILD ---
    // We only care about Collidable entities (Enemies, Crates, Player)
    // Bullets will query this grid
    const grid = new Map<string, GameEntity[]>();
    const addToGrid = (ent: GameEntity) => {
        if (!ent.active) return;
        const cellX = Math.floor(ent.x / GRID_SIZE);
        const cellY = Math.floor(ent.y / GRID_SIZE);
        // Add to main cell and overlapping cells if large
        const key = `${cellX},${cellY}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(ent);
    };

    // Optimization: Filter out dead entities periodically or just ignore inactive ones
    // We do a "swap remove" clean up for non-pooled entities occasionally or just rely on active flag
    // For now, let's rebuild entities array only when needed to avoid alloc
    
    const activeEntities: GameEntity[] = [];
    
    // Process Non-Pooled Entities (Enemies, Crates, Explosions)
    for (let i = 0; i < entitiesRef.current.length; i++) {
        const ent = entitiesRef.current[i];
        if (!ent.active) continue;
        
        // Remove far away objects
        if (ent.x < cameraRef.current - 1000) { ent.active = false; continue; }
        
        activeEntities.push(ent);
        addToGrid(ent);
    }
    
    // Player is also in grid for enemy detection
    addToGrid(player);

    const getNearbyEntities = (ent: {x:number, y:number}) => {
        const cellX = Math.floor(ent.x / GRID_SIZE);
        const cellY = Math.floor(ent.y / GRID_SIZE);
        let results: GameEntity[] = [];
        // Check 3x3 grid around object
        for(let x = cellX - 1; x <= cellX + 1; x++) {
            for(let y = cellY - 1; y <= cellY + 1; y++) {
                const ents = grid.get(`${x},${y}`);
                if (ents) results = results.concat(ents);
            }
        }
        return results;
    };

    // --- PLAYER vs TERRAIN ---
    // Only check crates near player
    const nearbyCrates = getNearbyEntities(player).filter(e => e.type.startsWith('crate'));
    
    nearbyCrates.forEach(crate => {
        if (checkCollision(player, crate)) {
            const overlapX = (player.width + crate.width)/2 - Math.abs((player.x + player.width/2) - (crate.x + crate.width/2));
            const overlapY = (player.height + crate.height)/2 - Math.abs((player.y + player.height/2) - (crate.y + crate.height/2));
            
            if (overlapX < overlapY) {
                if (player.x < crate.x) player.x = crate.x - player.width; else player.x = crate.x + crate.width;
                player.vx = 0;
            } else {
                if (player.y < crate.y) { 
                    player.y = crate.y - player.height; 
                    if (crate.type === 'crate_bouncy') { player.vy = -22; player.jumps = 1; AudioService.jump(); } 
                    else if (crate.type === 'crate_hazard') {
                         if (player.invulnTimer <= 0) {
                            player.hp -= 1; AudioService.hit(); 
                            spawnParticle(player.x, player.y, '#ef4444', 15);
                            player.invulnTimer = 90; player.vy = -10; 
                            if(player.hp <= 0) setGameState('gameover'); 
                        } else { player.vy = -10; }
                    } else { player.vy = 0; player.grounded = true; player.jumps = 0; }
                } else { player.y = crate.y + crate.height; player.vy = 0; }
            }
        }
    });

    // Camera
    const targetCamX = (player.x - 300) + (player.vx * 20);
    cameraRef.current += (targetCamX - cameraRef.current) * 0.08; 
    if (cameraRef.current < 0) cameraRef.current = 0;
    if (player.x < cameraRef.current) player.x = cameraRef.current;

    // --- GAME LOGIC (Spawning, Level Up) ---
    const currentDist = Math.floor(player.x / 10);
    distanceRef.current = currentDist;
    const calculatedStage = Math.floor(currentDist / STAGE_LENGTH) + 1;
    if (calculatedStage > stageRef.current) {
        stageRef.current = calculatedStage;
        setShowLevelUp(true);
        generateCards();
        setGameState('drafting');
        bossSpawnedRef.current = 0;
    }
    if (stageRef.current % 2 === 0 && bossSpawnedRef.current !== stageRef.current && gameState === 'playing') {
        spawnBoss(canvas.width, stageRef.current);
        bossSpawnedRef.current = stageRef.current;
    }

    const enemySpawnInterval = Math.max(15, 30 - (stageRef.current * 2));
    if (currentDist > lastEnemySpawnDistRef.current + enemySpawnInterval) { spawnEnemy(canvas.width); lastEnemySpawnDistRef.current = currentDist; }
    if (currentDist > lastTerrainSpawnDistRef.current + 20) { spawnTerrain(canvas.width, groundLevel); lastTerrainSpawnDistRef.current = currentDist; }

    // --- WEAPON FIRING ---
    const weapon = weapons[selectedWeaponIdx];
    const now = Date.now();
    const isFiring = keysRef.current['f'] || keysRef.current['Enter'] || keysRef.current['click'] || autoFireRef.current;
    
    // Performance limiting: Cap fire rate
    let effectiveCooldown = weapon.cooldown / mods.fireRateMult;
    if (effectiveCooldown < MIN_COOLDOWN) effectiveCooldown = MIN_COOLDOWN;
    
    if (isFiring && now - lastShotTimeRef.current > effectiveCooldown) {
        AudioService.shoot(weapon.id);
        const playerScreenX = player.x - cameraRef.current + player.width/2;
        const playerScreenY = player.y + player.height/3;
        let targetX = mouseRef.current.x;
        let targetY = mouseRef.current.y;
        if (keysRef.current['click'] && !mouseRef.current.x) { targetX = playerScreenX + (player.facing === 1 ? 500 : -500); targetY = playerScreenY; }

        const angle = Math.atan2(targetY - playerScreenY, targetX - playerScreenX);
        const startX = player.x + player.width/2;
        const startY = player.y + player.height/3;
        let effectiveDamage = weapon.damage * mods.damageMult;
        if (Math.random() < mods.critChance) effectiveDamage *= 2; 

        if (weapon.id === 'quantum') {
            activeEntities.forEach(o => { 
                if (o.type.startsWith('enemy') || o.type === 'crate_breakable') { 
                    applyDamage(o, 9999); 
                    spawnExplosion(o.x + o.width/2, o.y + o.height/2, 200, 0); 
                } 
            });
            spawnExplosion(player.x + 300, player.y, 400, 0); 
        } else {
             // Performance limiting: Cap projectile count
             let count = weapon.projectileCount || 1;
             if (count > MAX_PROJECTILES) count = MAX_PROJECTILES;

             for (let i = 0; i < count; i++) {
                 const finalAngle = angle + (i - (count-1)/2) * 0.1;
                 getFromPool(bulletPoolRef.current, {
                    x: startX + Math.cos(finalAngle)*30, y: startY + Math.sin(finalAngle)*30,
                    vx: Math.cos(finalAngle) * weapon.speed, vy: Math.sin(finalAngle) * weapon.speed,
                    width: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 8, height: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 4,
                    color: weapon.color, type: 'bullet', hp: 1, damage: effectiveDamage, explosionRadius: weapon.explosionRadius, isGrenade: weapon.id === 'grenade', isRocket: weapon.id === 'rocket'
                });
             }
        }
        lastShotTimeRef.current = now;
        player.facing = Math.abs(angle) > Math.PI/2 ? -1 : 1;
    }

    // --- ENTITY UPDATE LOOP ---
    // 1. Update Enemies & Physics
    activeEntities.forEach(obj => {
         if (obj.type.startsWith('crate')) return;
         if (obj.type.startsWith('enemy') && obj.type !== 'enemy_bullet') {
             // Tick Hazard Timer
             if (obj.hazardTimer && obj.hazardTimer > 0) obj.hazardTimer--;

             // Logic / AI
             if (obj.type === 'enemy_mech' && obj.width > 100) {
                 // BOSS AI
                 obj.aiTimer = (obj.aiTimer || 0) + 1;
                 const distToPlayer = player.x - obj.x;
                 if (obj.aiTimer > 200 && obj.aiState === 0) {
                     const rand = Math.random();
                     if (rand < 0.4) obj.aiState = 1; else if (rand < 0.7) obj.aiState = 2; else obj.aiState = 3; 
                     obj.aiTimer = 0;
                 }
                 if (obj.aiState === 0) {
                     obj.vx = distToPlayer > 0 ? 0.5 : -0.5;
                 } else if (obj.aiState === 1) { // Attack
                     obj.vx = 0;
                     if (obj.aiTimer % 20 === 0 && obj.aiTimer < 100) {
                         for(let i=-1; i<=1; i++) {
                             const angle = Math.atan2((player.y+player.height/2)-obj.y, (player.x+player.width/2)-obj.x) + (i*0.2);
                             getFromPool(bulletPoolRef.current, {x:obj.x+obj.width/2, y:obj.y+obj.height/3, vx:Math.cos(angle)*5, vy:Math.sin(angle)*5, width:15, height:15, color:'#f87171', type:'enemy_bullet', hp:1, damage:1});
                         }
                     }
                     if (obj.aiTimer > 120) { obj.aiState = 0; obj.aiTimer = 0; }
                 } else if (obj.aiState === 2) { // Summon
                     obj.vx = 0;
                     if (obj.aiTimer === 50) { spawnEnemy(canvas.width, obj.x - 100, obj.y - 100, 'enemy_seeker'); spawnEnemy(canvas.width, obj.x + 100, obj.y - 100, 'enemy_jumper'); spawnParticle(obj.x + obj.width/2, obj.y, '#a855f7', 20); }
                     if (obj.aiTimer > 80) { obj.aiState = 0; obj.aiTimer = 0; }
                 } else if (obj.aiState === 3) { // Teleport
                     obj.vx = 0;
                     if (obj.aiTimer === 40) { spawnParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#ffffff', 30); obj.x = player.x + (Math.random() > 0.5 ? 300 : -300); obj.y = Math.max(0, player.y - 200); spawnParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#ffffff', 30); }
                     if (obj.aiTimer > 60) { obj.aiState = 0; obj.aiTimer = 0; }
                 }
                 obj.vy += GRAVITY; obj.x += obj.vx; obj.y += obj.vy;
                 if(obj.y + obj.height >= groundLevel) { obj.y = groundLevel - obj.height; obj.vy = 0; obj.grounded = true; }
             } 
             else if (obj.type.includes('air') || obj.type.includes('mage') || obj.type.includes('seeker')) {
                 // Air AI
                 if(obj.type === 'enemy_meteor') {
                      obj.vy = 6; obj.y += obj.vy;
                      if(obj.y > groundLevel) { obj.hp = 0; spawnExplosion(obj.x + obj.width/2, obj.y, 100, 1); }
                 } else if (obj.type === 'enemy_seeker') {
                      const dx = player.x - obj.x; const dy = player.y - obj.y; const dist = Math.sqrt(dx*dx + dy*dy);
                      if (dist > 10) { obj.vx = dx/dist * 3; obj.vy = dy/dist * 3; }
                      obj.x += obj.vx; obj.y += obj.vy;
                 } else {
                     const dx = player.x - obj.x; obj.vx = dx > 0 ? 2 : -2; obj.y += Math.sin(frameCountRef.current * 0.05); obj.x += obj.vx;
                     obj.aiTimer = (obj.aiTimer || 0) + 1;
                     if(obj.type === 'enemy_mage' && obj.aiTimer > 150) {
                         const angle = Math.atan2((player.y+player.height/2)-obj.y, (player.x+player.width/2)-obj.x);
                         getFromPool(bulletPoolRef.current, {x:obj.x, y:obj.y, vx:Math.cos(angle)*4, vy:Math.sin(angle)*4, width:16, height:6, color:'#d8b4fe', type:'enemy_bullet', hp:1, damage:1});
                         obj.aiTimer = 0;
                     }
                 }
             } else {
                 // Ground AI
                 obj.vy += GRAVITY;
                 const dx = player.x - obj.x; const dist = Math.abs(dx);
                 let speed = 2;
                 if (obj.type === 'enemy_jumper' && obj.grounded && dist < 300) { obj.vy = -12; obj.vx = dx > 0 ? 5 : -5; obj.grounded = false; } 
                 else if (Math.abs(dx) < 800) { obj.vx = dx > 0 ? speed : -speed; } else { obj.vx = 0; }
                 
                 obj.x += obj.vx;
                 // Horizontal Collision (Optimized: Check only local grid)
                 const localCrates = getNearbyEntities(obj).filter(e => e.type.startsWith('crate'));
                 localCrates.forEach(c => { 
                     if(checkCollision(obj, c)) {
                         if (c.type === 'crate_hazard') {
                             if (!obj.hazardTimer || obj.hazardTimer <= 0) {
                                 applyDamage(obj, 1); obj.hazardTimer = 30; // Debounce damage
                                 obj.vx *= -1; obj.x += obj.vx * 2;
                             }
                             return;
                         }
                         if (obj.vx > 0) obj.x = c.x - obj.width; else if (obj.vx < 0) obj.x = c.x + c.width;
                         obj.vx *= -1; 
                         if (obj.type === 'enemy_breaker' && c.type === 'crate_breakable') applyDamage(c, 10);
                     } 
                 });

                 obj.y += obj.vy; obj.grounded = false;
                 
                 localCrates.forEach(c => { 
                     if(checkCollision(obj, c)) {
                         if (c.type === 'crate_hazard') {
                             if (!obj.hazardTimer || obj.hazardTimer <= 0) {
                                 applyDamage(obj, 1); obj.hazardTimer = 30;
                                 obj.vy = -5;
                             }
                             return;
                         }
                         if (c.type === 'crate_bouncy' && obj.vy > 0) { obj.vy = -22; obj.y = c.y - obj.height; obj.grounded = false; return; }
                         if (obj.vy > 0 && obj.y < c.y + c.height/2) { obj.y = c.y - obj.height; obj.vy = 0; obj.grounded = true; }
                         else if (obj.vy < 0) { obj.y = c.y + c.height; obj.vy = 0; }
                     }
                 });
                 if(obj.y + obj.height >= groundLevel) { obj.y = groundLevel - obj.height; obj.vy = 0; obj.grounded = true; }
             }
         } else if (obj.type === 'explosion') {
             obj.hp--;
             if (obj.hp <= 0) obj.active = false;
         }
    });

    // 2. Update Bullets (Pooled)
    bulletPoolRef.current.forEach(b => {
        if (!b.active) return;
        if (b.isGrenade) { b.vy += GRAVITY * 0.5; if(b.y > groundLevel) { b.active = false; spawnExplosion(b.x, b.y, b.explosionRadius||150, b.damage||200); }}
        else if (b.isRocket && b.y > groundLevel) { b.active = false; spawnExplosion(b.x, b.y, b.explosionRadius||200, b.damage||300); }
        
        b.x += b.vx; b.y += b.vy;
        if (b.x < cameraRef.current - 100 || b.x > cameraRef.current + canvas.width + 100) b.active = false;

        // Collision Check (Spatial Grid)
        if (b.active && b.type === 'bullet') {
            const targets = getNearbyEntities(b);
            for(const t of targets) {
                if (t.type.startsWith('enemy') && checkCollision(b, t)) {
                    if(b.isGrenade || b.isRocket) { b.active = false; spawnExplosion(b.x, b.y, b.explosionRadius||150, b.damage||200); }
                    else { applyDamage(t, b.damage||1); b.active = false; spawnParticle(b.x, b.y, '#fff', 5); }
                    break; 
                }
                if (t.type === 'crate_breakable' && checkCollision(b, t)) {
                    if(b.isGrenade || b.isRocket) { b.active = false; spawnExplosion(b.x, b.y, b.explosionRadius||150, b.damage||200); }
                    else { applyDamage(t, b.damage||1); b.active = false; spawnParticle(b.x, b.y, t.color, 5); }
                    break;
                }
            }
        } else if (b.active && b.type === 'enemy_bullet') {
            if (checkCollision(b, player)) {
                if (player.invulnTimer <= 0) {
                    player.hp -= 1; AudioService.hit(); 
                    spawnParticle(player.x, player.y, '#ef4444', 15);
                    player.invulnTimer = 90; player.vy = -6; player.vx = player.x < b.x ? -10 : 10; 
                    if(player.hp <= 0) setGameState('gameover');
                }
                b.active = false;
            }
        }
    });

    // 3. Update Particles (Pooled)
    particlePoolRef.current.forEach(p => {
        if (!p.active) return;
        p.x += p.vx; p.y += p.vy; p.width *= 0.9; p.height *= 0.9;
        if (p.width < 0.5) p.active = false;
    });
    
    // Player vs Enemies
    const nearbyEnemies = getNearbyEntities(player).filter(e => e.type.startsWith('enemy') || e.type === 'enemy_bullet');
    nearbyEnemies.forEach(e => {
        if(checkCollision(e, player)) {
            if (player.invulnTimer <= 0) {
                player.hp -= 1; AudioService.hit(); spawnParticle(player.x, player.y, '#ef4444', 15);
                player.invulnTimer = 90; player.vy = -6; player.vx = player.x < e.x ? -10 : 10; 
                if(e.type === 'enemy_bullet') e.active = false;
                if(player.hp <= 0) setGameState('gameover');
            }
        }
    });

    // Cleanup entitiesRef periodically to prevent infinite growth
    // Simple swap remove for dead entities
    for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
        if (!entitiesRef.current[i].active) {
            entitiesRef.current[i] = entitiesRef.current[entitiesRef.current.length - 1];
            entitiesRef.current.pop();
        }
    }
    
    const nowUi = Date.now();
    if (nowUi - lastUiUpdateRef.current > 100) { 
        setStats(prev => ({...prev, distanceTraveled: distanceRef.current, currentStage: stageRef.current }));
        lastUiUpdateRef.current = nowUi;
    }

    // --- RENDER ---
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#000000'); bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad; ctx.fillRect(0,0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    starsRef.current.forEach(star => {
        const x = (star.x - cameraRef.current * (0.1 * star.size)) % (canvas.width + 200);
        const actualX = x < 0 ? x + canvas.width : x;
        ctx.globalAlpha = star.alpha;
        ctx.beginPath(); ctx.arc(actualX, star.y, star.size, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=100) {
        const x = (i - cameraRef.current * 0.5) % canvas.width;
        ctx.beginPath(); ctx.moveTo(x, canvas.height); ctx.lineTo(x, canvas.height-200); ctx.stroke();
    }

    ctx.fillStyle = '#020617'; ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
    ctx.shadowBlur = 10; ctx.shadowColor = '#06b6d4'; ctx.fillStyle = '#06b6d4'; ctx.fillRect(0, groundLevel, canvas.width, 2); ctx.shadowBlur = 0;

    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    };

    const drawObj = (o: GameObject) => {
        const screenX = o.x - cameraRef.current;
        const screenY = o.y;
        
        if (o.type.startsWith('enemy') && o.maxHp && o.type !== 'enemy_bullet') {
            const pct = Math.max(0, o.hp / o.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; drawRoundedRect(screenX, screenY - 12, o.width, 4, 2); ctx.fill();
            ctx.fillStyle = pct > 0.5 ? '#22c55e' : '#ef4444'; drawRoundedRect(screenX, screenY - 12, o.width * pct, 4, 2); ctx.fill();
        }

        ctx.save();
        ctx.translate(screenX + o.width/2, screenY + o.height/2);
        if (o.facing === -1) ctx.scale(-1, 1);
        ctx.translate(-o.width/2, -o.height/2);

        if (o.type === 'particle') {
             ctx.shadowBlur = 0; ctx.fillStyle = o.color; ctx.globalAlpha = Math.min(1, o.width); ctx.fillRect(0, 0, o.width, o.height); ctx.globalAlpha = 1; ctx.restore(); return;
        }

        if (o.type === 'player') {
            if (playerRef.current.invulnTimer > 0 && Math.floor(frameCountRef.current / 4) % 2 === 0) ctx.globalAlpha = 0.4;
            ctx.shadowColor = o.color; ctx.shadowBlur = 15;
            const grad = ctx.createLinearGradient(0, 0, 0, o.height); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, o.color); ctx.fillStyle = grad;
            drawRoundedRect(5, 5, o.width-10, o.height-5, 15); ctx.fill();
            ctx.fillStyle = '#000000'; drawRoundedRect(10, 10, o.width-20, 10, 4); ctx.fill();
            ctx.save(); ctx.translate(o.width/2, o.height/2);
            const playerScreenCenter = { x: screenX + o.width/2, y: screenY + o.height/2 };
            let targetX = mouseRef.current.x; let targetY = mouseRef.current.y;
            if (keysRef.current['click'] && !mouseRef.current.x) { targetX = playerScreenCenter.x + (o.facing === 1 ? 500 : -500); targetY = playerScreenCenter.y; }
            const aimAngle = Math.atan2(targetY - playerScreenCenter.y, targetX - playerScreenCenter.x);
            let rotation = aimAngle; if (o.facing === -1) rotation = Math.PI - aimAngle; 
            ctx.rotate(rotation);
            ctx.fillStyle = weapons[selectedWeaponIdx].color; drawRoundedRect(0, -4, 30, 8, 2); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;

        } else if (o.type === 'enemy_ground' || o.type === 'enemy_dasher') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 10; ctx.fillStyle = o.color;
             ctx.beginPath(); ctx.moveTo(5, o.height); ctx.lineTo(-5, 10); ctx.lineTo(o.width + 5, 10); ctx.lineTo(o.width - 5, o.height); ctx.fill();
             ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(o.width/2, 10, 12, Math.PI, 0); ctx.fill();
             ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(o.width/2 + 4, 6, 3, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'enemy_air' || o.type === 'enemy_seeker') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 15; ctx.fillStyle = o.color;
             ctx.beginPath(); ctx.moveTo(o.width, o.height/2); ctx.quadraticCurveTo(0, -10, 0, o.height/2); ctx.quadraticCurveTo(0, o.height+10, o.width, o.height/2); ctx.fill();
             ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(5, o.height/2, 4, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'enemy_mech' || o.type === 'enemy_breaker') {
             const isBoss = o.width > 100;
             ctx.shadowColor = o.color; ctx.shadowBlur = 10; ctx.fillStyle = '#1e293b'; drawRoundedRect(0, 0, o.width, o.height, 8); ctx.fill();
             ctx.fillStyle = o.color; drawRoundedRect(5, 5, o.width-10, 20, 4); ctx.fill(); drawRoundedRect(5, o.height-30, 15, 30, 4); ctx.fill(); drawRoundedRect(o.width-20, o.height-30, 15, 30, 4); ctx.fill();
             if (isBoss) {
                 ctx.fillStyle = (o.aiState === 1 || o.aiState === 2) ? '#ffffff' : '#ef4444'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 20; ctx.beginPath(); ctx.arc(o.width/2, 40, 10, 0, Math.PI*2); ctx.fill();
             }

        } else if (o.type === 'crate') {
            ctx.fillStyle = 'rgba(30, 41, 59, 0.8)'; ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 2; ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 5;
            drawRoundedRect(0,0,o.width,o.height, 4); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(6, 182, 212, 0.1)'; for(let i=10; i<o.width; i+=20) ctx.fillRect(i, 0, 1, o.height);

        } else if (o.type === 'crate_breakable') {
            ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 8; ctx.fillStyle = `rgba(59, 130, 246, ${o.hp/50 * 0.4})`; ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1;
            drawRoundedRect(0,0,o.width,o.height, 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = 'rgba(96, 165, 250, 0.3)'; for(let i=0; i<o.width; i+=15) for(let j=0; j<o.height; j+=15) ctx.fillRect(i,j,2,2);

        } else if (o.type === 'crate_hazard') {
            ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10; ctx.fillStyle = '#450a0a'; drawRoundedRect(0,0,o.width,o.height, 4); ctx.fill();
            ctx.fillStyle = '#ef4444'; ctx.beginPath(); for(let i=0; i<o.width; i+=20) { ctx.moveTo(i, 0); ctx.lineTo(i+10, -10); ctx.lineTo(i+20, 0); } ctx.fill();

        } else if (o.type === 'crate_bouncy') {
            ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 10; ctx.fillStyle = '#052e16'; drawRoundedRect(0,0,o.width,o.height, 4); ctx.fill();
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, o.height/2); ctx.lineTo(o.width/2, 5); ctx.lineTo(o.width-10, o.height/2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, o.height/2+10); ctx.lineTo(o.width/2, 15); ctx.lineTo(o.width-10, o.height/2+10); ctx.stroke();

        } else if (o.type === 'bullet' || o.type === 'enemy_bullet') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 10;
             if (o.type === 'enemy_bullet') {
                ctx.save(); ctx.translate(o.width/2, o.height/2);
                const angle = Math.atan2(o.vy, o.vx); ctx.rotate(angle); ctx.fillStyle = o.color; drawRoundedRect(-6, -2, 12, 4, 2); ctx.fill(); ctx.restore();
             } else {
                 ctx.fillStyle = '#ffffff'; ctx.beginPath(); 
                 if (o.type === 'bullet' && !o.isGrenade && !o.isRocket) drawRoundedRect(0, 0, o.width, o.height, 2);
                 else ctx.arc(o.width/2, o.height/2, o.width/2, 0, Math.PI*2);
                 ctx.fill(); ctx.fillStyle = o.color; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(o.width/2, o.height/2, o.width, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
             }
        } else if (o.type === 'explosion') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 20; ctx.fillStyle = o.color; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(o.width/2, o.height/2, o.width/2, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
        } else {
            ctx.fillStyle = o.color; ctx.fillRect(0,0,o.width,o.height);
        }
        ctx.shadowBlur = 0; ctx.restore();
    };

    // Draw Active Entities
    // Combine arrays for rendering loop: player, entities, bullets, particles
    const toDraw = [player, ...activeEntities];
    
    toDraw.forEach(o => { if (o.x + o.width >= cameraRef.current && o.x <= cameraRef.current + canvas.width) drawObj(o); });
    
    // Draw Pooled Items
    bulletPoolRef.current.forEach(b => { if (b.active && b.x + b.width >= cameraRef.current && b.x <= cameraRef.current + canvas.width) drawObj(b); });
    particlePoolRef.current.forEach(p => { if (p.active && p.x + p.width >= cameraRef.current && p.x <= cameraRef.current + canvas.width) drawObj(p); });

    if (mouseRef.current.x !== 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mouseRef.current.x, mouseRef.current.y, 8, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#06b6d4'; ctx.beginPath(); ctx.arc(mouseRef.current.x, mouseRef.current.y, 2, 0, Math.PI*2); ctx.fill();
    }

    requestRef.current = requestAnimationFrame(loop);
  }, [gameState, selectedWeaponIdx, weapons]); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        keysRef.current[e.key] = true;
        if (e.key === 'j') { autoFireRef.current = !autoFireRef.current; setAutoFire(autoFireRef.current); AudioService.switch(); }
        if (e.key === 'c' || e.key === 'C') { setShowStats(prev => !prev); AudioService.switch(); }
        if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') && gameState === 'playing') {
             const player = playerRef.current;
             if (player.grounded) { player.vy = JUMP_FORCE; player.grounded = false; player.jumps = 1; AudioService.jump(); } 
             else if (player.jumps < 2) { player.vy = DOUBLE_JUMP_FORCE; player.jumps = 2; AudioService.jump(); }
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    const handleMouseDown = () => keysRef.current['click'] = true;
    const handleMouseUp = () => keysRef.current['click'] = false;
    window.addEventListener('mousedown', handleMouseDown); window.addEventListener('mouseup', handleMouseUp);

    requestRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown); window.removeEventListener('mouseup', handleMouseUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop, gameState]);

  const progress = (stats.distanceTraveled % STAGE_LENGTH) / STAGE_LENGTH * 100;

  const getWeaponIcon = (id: WeaponType, color: string) => {
      switch(id) {
          case 'pistol': return <Target size={18} color={color} />;
          case 'machinegun': return <Zap size={18} color={color} />;
          case 'sniper': return <Crosshair size={18} color={color} />;
          case 'shotgun': return <Shield size={18} color={color} />;
          case 'grenade': return <Bomb size={18} color={color} />;
          case 'rocket': return <Flame size={18} color={color} />;
          case 'quantum': return <Atom size={18} color={color} />;
          default: return <Target size={18} color={color} />;
      }
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-950 overflow-hidden font-sans touch-none select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* --- UI OVERLAYS (Apple Style Glassmorphism) --- */}

      {showLevelUp && (
          <div className="absolute top-1/4 left-0 w-full text-center pointer-events-none animate-in fade-in zoom-in duration-500">
              <h1 className="text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-500 drop-shadow-2xl tracking-tighter">
                  STAGE {stats.currentStage}
              </h1>
              <p className="text-xl text-white/80 font-light tracking-[0.2em] mt-2">DANGER LEVEL RISING</p>
          </div>
      )}
      
      {bossWarning && (
           <div className="absolute top-1/3 left-0 w-full text-center pointer-events-none animate-pulse">
              <h1 className="text-8xl font-black text-red-500 tracking-tighter drop-shadow-[0_0_30px_rgba(239,68,68,0.6)]">
                  WARNING
              </h1>
          </div>
      )}

      <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none z-10 hidden md:flex">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-4 rounded-3xl shadow-2xl max-w-sm">
                <p className="text-[10px] uppercase tracking-widest text-cyan-400/80 mb-1 font-bold">Current Objective</p>
                <p className="text-sm font-medium text-white/90 leading-relaxed">{missionBriefing}</p>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 px-4 py-3 rounded-full flex items-center gap-4 shadow-xl w-fit">
                <div className="text-xs font-bold text-white/60 tracking-wider">
                    STAGE <span className="text-white text-sm">{stats.currentStage}</span>
                </div>
                <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="text-xs font-mono text-cyan-400">{stats.distanceTraveled}m</div>
            </div>

            <div className="flex gap-1.5 pl-2">
                 {[...Array(playerRef.current.maxHp || baseMaxHp)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-8 h-2 rounded-full transition-all duration-300 ${
                            i < playerRef.current.hp 
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500 shadow-[0_0_10px_#4ade80]' 
                            : 'bg-white/10'
                        }`} 
                    />
                ))}
            </div>
      </div>
      
      <div className="absolute top-4 left-4 right-4 flex justify-between md:hidden pointer-events-none">
           <div className="flex gap-1">
                {[...Array(playerRef.current.maxHp || baseMaxHp)].map((_, i) => (
                    <div key={i} className={`w-6 h-1.5 rounded-full ${i < playerRef.current.hp ? 'bg-green-500' : 'bg-white/10'}`} />
                ))}
           </div>
           <div className="text-xs font-mono text-cyan-400">{stats.score}</div>
      </div>
      
      <div className="absolute bottom-32 left-8 md:bottom-10 md:left-10 pointer-events-auto flex flex-col gap-3">
          <div className={`
              flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border transition-all duration-300 cursor-pointer
              ${autoFire 
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                : 'bg-white/5 border-white/5 text-slate-400'}
          `} onClick={() => { autoFireRef.current = !autoFireRef.current; setAutoFire(autoFireRef.current); AudioService.switch(); }}>
              <Cpu size={16} />
              <span className="text-xs font-bold tracking-widest hidden md:inline">AUTO-FIRE [J]</span>
              <span className="text-xs font-bold tracking-widest md:hidden">AUTO</span>
              <div className={`w-2 h-2 rounded-full ${autoFire ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></div>
          </div>
          
           <div className={`
              flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border transition-all duration-300 cursor-pointer hover:bg-white/10
              ${showStats 
                ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' 
                : 'bg-white/5 border-white/5 text-slate-400'}
          `} onClick={() => { setShowStats(!showStats); AudioService.switch(); }}>
              <Info size={16} />
              <span className="text-xs font-bold tracking-widest hidden md:inline">STATS [C]</span>
              <span className="text-xs font-bold tracking-widest md:hidden">STATS</span>
          </div>
      </div>
      
      <div className="absolute inset-0 pointer-events-none md:hidden z-30">
          <div className="absolute bottom-8 left-8 flex items-center gap-4 pointer-events-auto">
             <button 
                className={`w-16 h-16 rounded-full backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all active:scale-95 active:bg-white/20 ${touchState.left ? 'bg-white/20 scale-95' : 'bg-white/5'}`}
                onTouchStart={() => handleTouchStart('ArrowLeft')}
                onTouchEnd={() => handleTouchEnd('ArrowLeft')}
             >
                 <ChevronLeft size={32} className="text-white/80" />
             </button>
             <button 
                className={`w-16 h-16 rounded-full backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all active:scale-95 active:bg-white/20 ${touchState.right ? 'bg-white/20 scale-95' : 'bg-white/5'}`}
                onTouchStart={() => handleTouchStart('ArrowRight')}
                onTouchEnd={() => handleTouchEnd('ArrowRight')}
             >
                 <ChevronRight size={32} className="text-white/80" />
             </button>
          </div>

          <div className="absolute bottom-8 right-8 flex items-center gap-4 pointer-events-auto">
             <button 
                className={`w-16 h-16 rounded-full backdrop-blur-xl border border-emerald-500/30 flex items-center justify-center transition-all active:scale-95 active:bg-emerald-500/20 ${touchState.jump ? 'bg-emerald-500/20 scale-95' : 'bg-emerald-900/20'}`}
                onTouchStart={() => handleTouchStart('ArrowUp')}
                onTouchEnd={() => handleTouchEnd('ArrowUp')}
             >
                 <ChevronUp size={32} className="text-emerald-400" />
             </button>
             <button 
                className={`w-20 h-20 rounded-full backdrop-blur-xl border border-red-500/30 flex items-center justify-center transition-all active:scale-95 active:bg-red-500/20 ${touchState.fire ? 'bg-red-500/20 scale-95' : 'bg-red-900/20'}`}
                onTouchStart={() => handleTouchStart('click')}
                onTouchEnd={() => handleTouchEnd('click')}
             >
                 <Target size={32} className="text-red-400" />
             </button>
          </div>
      </div>

      <div className="absolute top-16 right-4 md:top-6 md:right-6 p-2 bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex flex-col md:flex-row gap-2 md:gap-3 pointer-events-auto z-20 scale-75 md:scale-100 origin-top-right">
        {Object.keys(weapons).map((keyStr) => {
            const num = parseInt(keyStr);
            const w = weapons[num];
            const isSelected = selectedWeaponIdx === num;
            return (
                <div key={num} className="relative group">
                    <button
                        onClick={() => { if (isSelected) { setEditingWeapon(num); setGameState('paused'); } else { switchWeapon(num); }}}
                        className={`
                            w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 relative
                            ${isSelected 
                                ? 'bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.1)] scale-105 border border-white/20' 
                                : 'hover:bg-white/5 opacity-50 hover:opacity-100'}
                        `}
                    >
                        {getWeaponIcon(w.id, w.color)}
                        <span className="absolute -bottom-4 text-[9px] font-bold text-white/40 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block">
                            {num}
                        </span>
                    </button>
                    {isSelected && (
                         <div className="absolute -top-1 -right-1 bg-white/20 rounded-full p-0.5 backdrop-blur">
                             <Settings size={10} className="text-white" />
                         </div>
                    )}
                </div>
            )
        })}
      </div>

      {showStats && (
        <div className="absolute inset-0 flex items-center justify-center md:justify-start md:pl-20 z-40 pointer-events-none">
             <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl w-full max-w-xs animate-in slide-in-from-left-4 fade-in duration-300 pointer-events-auto">
                 <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-bold text-white tracking-widest flex items-center gap-2">
                         <Dna size={18} className="text-cyan-400" />
                         OPERATIVE STATS
                     </h3>
                     <button onClick={() => setShowStats(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
                 </div>
                 
                 <div className="space-y-4">
                     <div>
                         <div className="flex justify-between text-xs text-slate-400 mb-1 font-bold">WEAPON</div>
                         <div className="text-white font-mono text-sm border-b border-white/10 pb-2 mb-2 flex justify-between">
                            <span>{weapons[selectedWeaponIdx].name}</span>
                            <span style={{color: weapons[selectedWeaponIdx].color}}>LVL {stats.currentStage}</span>
                         </div>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4">
                         <div className="bg-white/5 p-3 rounded-2xl">
                             <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Damage</div>
                             <div className="text-xl font-bold text-emerald-400">
                                 {Math.round(weapons[selectedWeaponIdx].damage * modifiers.damageMult)}
                                 {modifiers.damageMult > 1 && <span className="text-[10px] ml-1 text-emerald-600">x{modifiers.damageMult.toFixed(1)}</span>}
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-2xl">
                             <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Fire Rate</div>
                             <div className="text-xl font-bold text-yellow-400">
                                 {(1000 / Math.max(MIN_COOLDOWN, weapons[selectedWeaponIdx].cooldown / modifiers.fireRateMult)).toFixed(1)}/s
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-2xl">
                             <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Crit Rate</div>
                             <div className="text-xl font-bold text-purple-400">
                                 {(modifiers.critChance * 100).toFixed(0)}%
                             </div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-2xl">
                             <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Move Speed</div>
                             <div className="text-xl font-bold text-blue-400">
                                 {Math.round(BASE_MOVE_SPEED * modifiers.moveSpeedMult * 10)}
                             </div>
                         </div>
                          <div className="bg-white/5 p-3 rounded-2xl col-span-2">
                             <div className="text-[10px] text-slate-400 uppercase font-bold mb-1">Shot Velocity</div>
                             <div className="text-xl font-bold text-orange-400">
                                 {weapons[selectedWeaponIdx].speed}
                             </div>
                         </div>
                     </div>
                     
                     <div className="pt-2">
                        <div className="flex justify-between text-xs text-slate-400 mb-2 font-bold uppercase">
                             <span>Health Integrity</span>
                             <span>{playerRef.current.hp} / {playerRef.current.maxHp}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                             <div className="h-full bg-gradient-to-r from-red-500 to-green-500" style={{ width: `${(playerRef.current.hp / (playerRef.current.maxHp || 1)) * 100}%` }}></div>
                        </div>
                     </div>
                 </div>
             </div>
        </div>
      )}

      {gameState === 'drafting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-lg z-50 p-6 animate-in fade-in duration-300">
              <div className="max-w-5xl w-full">
                   <h2 className="text-center text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-blue-600 mb-2 uppercase tracking-tighter drop-shadow-2xl">
                       Sector Cleared
                   </h2>
                   <p className="text-center text-slate-400 font-medium tracking-[0.3em] uppercase mb-12">
                       Select Augmentation
                   </p>

                   <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                       {draftCards.map((card, idx) => (
                           <button
                               key={card.id}
                               onClick={() => handleSelectCard(card)}
                               className="relative group bg-slate-900/60 border border-white/10 rounded-3xl p-6 h-80 flex flex-col items-center text-center transition-all hover:scale-105 hover:-translate-y-2 hover:bg-slate-800 hover:shadow-2xl overflow-hidden"
                               style={{ animationDelay: `${idx * 100}ms` }}
                           >
                               <div 
                                    className={`absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl ${card.rarity === 'Mythic' ? 'animate-pulse' : ''}`}
                                    style={{ 
                                        backgroundColor: RARITY_COLORS[card.rarity] + '33',
                                        background: card.rarity === 'Mythic' ? 'linear-gradient(45deg, #ff0000, #ff7300, #fffb00, #48ff00, #00ffd5, #002bff, #7a00ff, #ff00c8, #ff0000)' : undefined,
                                        opacity: card.rarity === 'Mythic' ? 0.3 : undefined
                                    }}
                               />
                               
                               <div className="relative z-10 w-full flex-grow flex flex-col items-center">
                                   <div 
                                        className="text-xs font-bold uppercase tracking-widest mb-4 px-3 py-1 rounded-full border border-white/10"
                                        style={{ 
                                            color: RARITY_COLORS[card.rarity], 
                                            borderColor: RARITY_COLORS[card.rarity] + '44', 
                                            backgroundColor: RARITY_COLORS[card.rarity] + '11',
                                            boxShadow: card.rarity === 'Mythic' ? `0 0 10px ${RARITY_COLORS['Mythic']}` : undefined
                                        }}
                                   >
                                       {card.rarity}
                                   </div>

                                   <div className="my-auto">
                                       {card.type === 'damage' && <Target size={48} color={RARITY_COLORS[card.rarity]} />}
                                       {card.type === 'speed' && <Zap size={48} color={RARITY_COLORS[card.rarity]} />}
                                       {card.type === 'firerate' && <RefreshCw size={48} color={RARITY_COLORS[card.rarity]} />}
                                       {card.type === 'health' && <Dna size={48} color={RARITY_COLORS[card.rarity]} />}
                                       {card.type === 'crit' && <Skull size={48} color={RARITY_COLORS[card.rarity]} />}
                                   </div>

                                   <h3 className={`text-xl font-bold text-white mt-6 mb-2 ${card.rarity === 'Mythic' ? 'text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 animate-pulse' : ''}`}>
                                       {card.description}
                                   </h3>
                                   <p className="text-xs text-slate-500 uppercase font-semibold">
                                       {card.type} Upgrade
                                   </p>
                               </div>
                           </button>
                       ))}
                   </div>
              </div>
          </div>
      )}

      <div className="absolute bottom-32 right-10 md:bottom-10 md:right-10 pointer-events-none hidden md:block">
          <div className="text-7xl font-bold text-white/5 tracking-tighter select-none">
                {stats.score.toString().padStart(6, '0')}
          </div>
      </div>

      {editingWeapon !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-slate-900/90 border border-white/10 p-6 md:p-8 rounded-[2rem] w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-xl">
                  <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <Settings size={20} className="text-cyan-400" />
                          </div>
                          <div>
                              <h2 className="text-lg font-bold text-white">Weapon Config</h2>
                              <p className="text-xs text-slate-400">{weapons[editingWeapon].name}</p>
                          </div>
                      </div>
                      <button onClick={() => { setEditingWeapon(null); setGameState('playing'); }} className="text-sm font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/50 px-4 py-2 rounded-full transition-colors">Done</button>
                  </div>
                  
                  <div className="space-y-6">
                      {[
                          { label: 'Fire Rate (Delay)', field: 'cooldown', min: 60, max: 2000, color: 'accent-cyan-500' },
                          { label: 'Damage Output', field: 'damage', min: 1, max: 1000, color: 'accent-pink-500' },
                          { label: 'Velocity', field: 'speed', min: 25, max: 80, color: 'accent-yellow-500' },
                          { label: 'Multi-Shot', field: 'projectileCount', min: 1, max: 6, color: 'accent-emerald-500' }
                      ].map((item) => (
                          <div key={item.field}>
                              <div className="flex justify-between mb-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.label}</label>
                                <span className="text-xs font-mono text-slate-500">{weapons[editingWeapon][item.field as keyof WeaponConfig]}</span>
                              </div>
                              <input 
                                  type="range" min={item.min} max={item.max} step="1"
                                  value={weapons[editingWeapon][item.field as keyof WeaponConfig] || 0}
                                  onChange={(e) => handleUpdateWeapon(e, item.field as keyof WeaponConfig)}
                                  className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer ${item.color}`}
                              />
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 cursor-auto p-4">
          <div className="text-center p-6 md:p-10 max-w-lg w-full animate-in slide-in-from-bottom-10 fade-in duration-500 bg-slate-900/50 rounded-3xl border border-white/5 shadow-2xl">
            <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 mb-2 tracking-tighter drop-shadow-2xl">MIA</h2>
            <p className="text-xl text-red-200/50 font-medium tracking-[0.5em] uppercase mb-12">Mission Failed</p>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-white/5 border border-white/5 p-4 rounded-3xl backdrop-blur-lg">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Sector Reached</p>
                    <p className="text-3xl font-bold text-white">{stats.currentStage}</p>
                </div>
                 <div className="bg-white/5 border border-white/5 p-4 rounded-3xl backdrop-blur-lg">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Hostiles Neutralized</p>
                    <p className="text-3xl font-bold text-white">{stats.enemiesDefeated}</p>
                </div>
            </div>

            <div className="space-y-4">
                <button 
                    onClick={resetGame}
                    className="w-full py-5 bg-white text-black hover:bg-slate-200 font-bold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-[1.02]"
                >
                    <RefreshCw size={18} />
                    Respawn
                </button>
                <button 
                    onClick={onExit}
                    className="w-full py-5 bg-transparent border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white font-bold uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                    <ArrowLeft size={18} />
                    Abort
                </button>
            </div>
          </div>
        </div>
      )}

       <button 
          onClick={onExit}
          className="absolute top-6 left-6 md:top-auto md:bottom-8 md:left-8 w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-400 rounded-full transition-all pointer-events-auto z-40 backdrop-blur border border-white/5 md:block hidden"
        >
          <ArrowLeft size={20} />
      </button>
    </div>
  );
};

export default RunAndGunGame;
