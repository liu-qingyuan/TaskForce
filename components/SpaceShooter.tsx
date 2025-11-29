
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameStats, GameObject, PlayerProfile, WeaponType, GameObjectType } from '../types';
import { ArrowLeft, RefreshCw, Zap, Shield, Crosshair, Target, Bomb, Skull, Settings, Flame, Atom, Cpu } from 'lucide-react';
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

const DEFAULT_WEAPONS: Record<number, WeaponConfig> = {
    1: { id: 'pistol', name: 'M9 Blaster', cooldown: 200, color: '#38bdf8', damage: 25, speed: 12, projectileCount: 1 },
    2: { id: 'machinegun', name: 'Auto Rifle', cooldown: 80, color: '#facc15', damage: 15, speed: 18, projectileCount: 1 },
    3: { id: 'sniper', name: 'Sniper', cooldown: 1000, color: '#ec4899', damage: 150, speed: 30, projectileCount: 1 },
    4: { id: 'shotgun', name: 'Shotgun', cooldown: 700, color: '#ef4444', damage: 20, speed: 12, projectileCount: 5 },
    5: { id: 'grenade', name: 'Bomb', cooldown: 800, color: '#10b981', damage: 200, speed: 10, explosionRadius: 150, projectileCount: 1 },
    6: { id: 'rocket', name: 'Rocket', cooldown: 1200, color: '#f97316', damage: 300, speed: 15, explosionRadius: 200, projectileCount: 1 },
    7: { id: 'quantum', name: 'Quantum', cooldown: 5000, color: '#8b5cf6', damage: 1000, speed: 0, explosionRadius: 9999, projectileCount: 0 }
};

const RunAndGunGame: React.FC<RunAndGunProps> = ({ onExit, missionBriefing, playerProfile }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'playing' | 'gameover' | 'paused'>('playing');
  const [stats, setStats] = useState<GameStats>({ score: 0, highScore: 0, enemiesDefeated: 0, distanceTraveled: 0, currentStage: 1 });
  const [selectedWeaponIdx, setSelectedWeaponIdx] = useState<number>(1);
  const [weapons, setWeapons] = useState(DEFAULT_WEAPONS);
  const [editingWeapon, setEditingWeapon] = useState<number | null>(null);
  
  const [showLevelUp, setShowLevelUp] = useState<boolean>(false);
  const [bossWarning, setBossWarning] = useState<boolean>(false);
  
  // Auto Fire State
  const [autoFire, setAutoFire] = useState(false);
  const autoFireRef = useRef(false);
  
  const maxHp = playerProfile.level >= 3 ? 5 : 3;

  // Game Physics Constants
  const GRAVITY = 0.6;
  const JUMP_FORCE = -14;
  const MOVE_SPEED = 6;
  const FRICTION = 0.8;
  const STAGE_LENGTH = 300; 
  const DOUBLE_JUMP_FORCE = -12;
  
  // Terrain Constants
  const TIER_HEIGHT = 120;
  const PLATFORM_THICKNESS = 40; 
  
  // Refs for loop
  const requestRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const cameraRef = useRef(0);
  const distanceRef = useRef(0);
  const stageRef = useRef(1);
  const mouseRef = useRef({ x: 0, y: 0 });
  const bossSpawnedRef = useRef(0);
  
  // Spawning Refs
  const lastEnemySpawnDistRef = useRef(0);
  const lastTerrainSpawnDistRef = useRef(0);
  
  const playerRef = useRef<GameObject & { jumps: number }>({
    id: 'player',
    x: 100, y: 0, 
    vx: 0, vy: 0,
    width: 40, height: 60,
    color: '#38bdf8', 
    type: 'player', 
    hp: maxHp, maxHp: maxHp,
    grounded: false,
    facing: 1,
    jumps: 0
  });

  const objectsRef = useRef<(GameObject & { damage?: number, explosionRadius?: number })[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lastShotTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const starsRef = useRef<{x:number, y:number, size:number, alpha: number}[]>([]);

  // Initialize High Score & Stars
  useEffect(() => {
    const saved = localStorage.getItem('tf_highscore_platformer');
    if (saved) setStats(s => ({ ...s, highScore: parseInt(saved, 10) }));

    // Generate background stars
    const stars = [];
    for(let i=0; i<100; i++) {
        stars.push({
            x: Math.random() * 2000,
            y: Math.random() * 1000,
            size: Math.random() * 2 + 0.5,
            alpha: Math.random()
        });
    }
    starsRef.current = stars;
  }, []);

  // Mouse Tracking
  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (canvasRef.current) {
              const rect = canvasRef.current.getBoundingClientRect();
              mouseRef.current = {
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top
              };
          }
      };
      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // One-time Initialization
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

  const resetGame = () => {
    scoreRef.current = 0;
    cameraRef.current = 0;
    distanceRef.current = 0;
    stageRef.current = 1;
    bossSpawnedRef.current = 0;
    lastEnemySpawnDistRef.current = 0;
    lastTerrainSpawnDistRef.current = 0;
    objectsRef.current = [];
    setGameState('playing');
    setStats({ score: 0, highScore: stats.highScore, enemiesDefeated: 0, distanceTraveled: 0, currentStage: 1 });
    
    autoFireRef.current = false;
    setAutoFire(false);
    
    if (canvasRef.current) {
        playerRef.current.x = 100;
        playerRef.current.y = canvasRef.current.height - 200;
        playerRef.current.vx = 0;
        playerRef.current.vy = 0;
        playerRef.current.hp = maxHp;
        playerRef.current.jumps = 0;
    }
  };

  const spawnBoss = (canvasWidth: number, level: number) => {
      setBossWarning(true);
      setTimeout(() => setBossWarning(false), 3000);
      const spawnX = cameraRef.current + canvasWidth + 100;
      objectsRef.current.push({
          id: `boss-${Date.now()}`, x: spawnX, y: 0, vx: 0, vy: 0, width: 140, height: 180,
          color: '#ef4444', type: 'enemy_mech', hp: 1500 + (level * 200), maxHp: 1500 + (level * 200), grounded: false, facing: -1, variant: 0, aiState: 0, aiTimer: 0
      });
  };

  const spawnEnemy = (canvasWidth: number, overrideX?: number, overrideY?: number, forceType?: GameObjectType) => {
    const spawnX = overrideX ?? (cameraRef.current + canvasWidth + 50);
    const stage = stageRef.current;
    const bossExists = objectsRef.current.some(o => o.hp > 0 && o.type === 'enemy_mech' && o.width > 100);
    if (bossExists && !forceType && Math.random() > 0.2) return; 

    let enemyType: GameObjectType = forceType || 'enemy_ground';
    
    if (!forceType) {
        const r = Math.random();
        if (stage === 1) {
            if (r > 0.9) enemyType = 'enemy_jumper';
            else if (r > 0.8) enemyType = 'enemy_archer';
            else enemyType = 'enemy_ground';
        } else if (stage === 2) {
            if (r > 0.95) enemyType = 'enemy_mage';
            else if (r > 0.9) enemyType = 'enemy_dasher';
            else if (r > 0.8) enemyType = 'enemy_seeker';
            else if (r > 0.7) enemyType = 'enemy_archer';
            else if (r > 0.6) enemyType = 'enemy_jumper';
            else if (r > 0.4) enemyType = 'enemy_air'; 
            else enemyType = 'enemy_ground';
        } else {
            if (r > 0.95) enemyType = 'enemy_meteor';
            else if (r > 0.90) enemyType = 'enemy_mech';
            else if (r > 0.85) enemyType = 'enemy_breaker';
            else if (r > 0.80) enemyType = 'enemy_mage';
            else if (r > 0.70) enemyType = 'enemy_dasher';
            else if (r > 0.60) enemyType = 'enemy_archer';
            else if (r > 0.40) enemyType = 'enemy_seeker';
            else enemyType = 'enemy_ground';
        }
    }
    
    const variant = Math.floor(Math.random() * 3);
    const id = `e-${Date.now()}-${Math.random()}`;

    // Common props
    const defaults = { x: spawnX, vx: 0, vy: 0, facing: -1 as 1 | -1, variant, aiTimer: 0, aiState: 0 };

    if (enemyType === 'enemy_meteor') {
         objectsRef.current.push({ ...defaults, id, y: -100, vy: 5 + Math.random()*5, width: 40, height: 40, color: '#f97316', type: 'enemy_meteor', hp: 30, maxHp: 30 });
    } else if (enemyType === 'enemy_mage') {
         objectsRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 300) + 100), width: 40, height: 60, color: '#a855f7', type: 'enemy_mage', hp: 60+(stage*10), maxHp: 60+(stage*10) });
    } else if (enemyType === 'enemy_archer') {
         objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 35, height: 55, color: '#10b981', type: 'enemy_archer', hp: 40+(stage*10), maxHp: 40+(stage*10), grounded: false });
    } else if (enemyType === 'enemy_breaker') {
         objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -0.5, width: 55, height: 70, color: '#78716c', type: 'enemy_breaker', hp: 150+(stage*20), maxHp: 150+(stage*20), grounded: false });
    } else if (enemyType === 'enemy_air') {
        objectsRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 300) + 50), vx: -3-(stage*0.5), width: 35, height: 25, color: '#38bdf8', type: 'enemy_air', hp: 30+(stage*10), maxHp: 30+(stage*10), aiState: 0 });
    } else if (enemyType === 'enemy_seeker') {
        objectsRef.current.push({ ...defaults, id, y: overrideY ?? (Math.random() * (canvasRef.current!.height - 200) + 50), vx: -2, width: 30, height: 30, color: '#d946ef', type: 'enemy_seeker', hp: 20+(stage*10), maxHp: 20+(stage*10) });
    } else if (enemyType === 'enemy_mech') {
         // Non-boss mech
         objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 70, height: 90, color: '#6366f1', type: 'enemy_mech', hp: 200+(stage*50), maxHp: 200+(stage*50), grounded: false });
    } else if (enemyType === 'enemy_jumper') {
        objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -2, width: 35, height: 40, color: '#84cc16', type: 'enemy_jumper', hp: 40+(stage*10), maxHp: 40+(stage*10), grounded: false });
    } else if (enemyType === 'enemy_dasher') {
        objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -1, width: 50, height: 30, color: '#eab308', type: 'enemy_dasher', hp: 60+(stage*15), maxHp: 60+(stage*15), grounded: false });
    } else {
        objectsRef.current.push({ ...defaults, id, y: overrideY ?? 0, vx: -2-(stage*0.5), width: 35, height: 55, color: '#94a3b8', type: 'enemy_ground', hp: 50+(stage*10), maxHp: 50+(stage*10), grounded: false });
    }
  };

  const spawnTerrain = (canvasWidth: number, groundLevel: number) => {
      const spawnX = cameraRef.current + canvasWidth + 100 + Math.random() * 50;
      const r = Math.random();
      let tier = 1;
      if (r > 0.9) tier = 5; else if (r > 0.75) tier = 4; else if (r > 0.55) tier = 3; else if (r > 0.3) tier = 2;
      const width = 150 + Math.random() * 200;
      const height = PLATFORM_THICKNESS; 
      const y = groundLevel - (tier * TIER_HEIGHT);
      if (y < 50) return;

      if (Math.random() > 0.9 && tier === 1) {
          objectsRef.current.push({ id: `w-${Date.now()}`, x: spawnX, y: groundLevel - 200, vx: 0, vy: 0, width: 40, height: 200, color: '#1e293b', type: 'crate', hp: 999 });
      } else {
          objectsRef.current.push({ id: `t-${Date.now()}`, x: spawnX, y: y, vx: 0, vy: 0, width: width, height: height, color: '#1e293b', type: 'crate', hp: 999 });
      }
  }

  const applyDamage = (target: GameObject, amount: number) => {
      if (target.hp <= 0) return;
      target.hp -= amount;
      if (target.hp <= 0) {
          AudioService.explosion();
          spawnParticle(target.x + target.width/2, target.y + target.height/2, target.color, 15);
          const isBoss = target.width > 100;
          scoreRef.current += isBoss ? 5000 : (target.type === 'enemy_mech' ? 500 : 100);
          setStats(prev => ({ ...prev, score: scoreRef.current, enemiesDefeated: prev.enemiesDefeated + 1 }));
      }
  };

  const spawnExplosion = (x: number, y: number, size: number, damage: number = 0) => {
      AudioService.explosion();
      objectsRef.current.push({ id: `ex-${Date.now()}`, x: x-size/2, y: y-size/2, vx:0, vy:0, width: size, height: size, color: '#f87171', type: 'explosion', hp: 10, damage: 0 });
      // OPTIMIZATION: Reduce particle count for explosions to prevent lag
      spawnParticle(x, y, '#fca5a5', 8); 
      
      const explosionRect = { x: x - size/2, y: y - size/2, width: size, height: size, id: 'temp', vx:0, vy:0, color:'', type:'explosion' as const, hp: 0 };
      objectsRef.current.filter(o => o.type.startsWith('enemy')).forEach(e => {
          if (checkCollision(explosionRect, e)) applyDamage(e, damage);
      });
  }

  const spawnParticle = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8;
      objectsRef.current.push({
        id: `p-${Math.random()}`, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        width: 3, height: 3, color: color, type: 'particle', hp: 1 
      });
    }
  };

  const checkCollision = (rect1: GameObject, rect2: GameObject) => {
    return (rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y);
  };

  const switchWeapon = (key: number) => {
      if (weapons[key]) {
          setSelectedWeaponIdx(key);
          AudioService.switch();
      }
  }

  const handleUpdateWeapon = (e: React.ChangeEvent<HTMLInputElement>, field: keyof WeaponConfig) => {
      if (editingWeapon === null) return;
      const val = parseFloat(e.target.value);
      setWeapons(prev => ({ ...prev, [editingWeapon]: { ...prev[editingWeapon], [field]: val } }));
  };

  // -----------------------------------------------------------------------------------------
  // GAME LOOP
  // -----------------------------------------------------------------------------------------
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState !== 'playing') return;

    frameCountRef.current++;
    const groundLevel = canvas.height - 50;
    const player = playerRef.current;

    // --- Input & Physics Logic ---
    ['1','2','3','4','5','6','7'].forEach(key => { if (keysRef.current[key]) switchWeapon(parseInt(key)); });

    if (keysRef.current['ArrowRight'] || keysRef.current['d']) { player.vx += 1; player.facing = 1; } 
    else if (keysRef.current['ArrowLeft'] || keysRef.current['a']) { player.vx -= 1; player.facing = -1; } 
    else { player.vx *= FRICTION; }
    player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));
    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;

    if (player.y + player.height >= groundLevel) { player.y = groundLevel - player.height; player.vy = 0; player.grounded = true; player.jumps = 0; } else { player.grounded = false; }
    
    const crates = objectsRef.current.filter(o => o.type === 'crate');
    crates.forEach(crate => {
        if (checkCollision(player, crate)) {
            const overlapX = (player.width + crate.width)/2 - Math.abs((player.x + player.width/2) - (crate.x + crate.width/2));
            const overlapY = (player.height + crate.height)/2 - Math.abs((player.y + player.height/2) - (crate.y + crate.height/2));
            if (overlapX < overlapY) {
                if (player.x < crate.x) player.x = crate.x - player.width; else player.x = crate.x + crate.width;
                player.vx = 0;
            } else {
                if (player.y < crate.y) { player.y = crate.y - player.height; player.vy = 0; player.grounded = true; player.jumps = 0; } 
                else { player.y = crate.y + crate.height; player.vy = 0; }
            }
        }
    });

    // Camera
    const targetCamX = player.x - 300; 
    cameraRef.current += (targetCamX - cameraRef.current) * 0.1;
    if (cameraRef.current < 0) cameraRef.current = 0;
    if (player.x < cameraRef.current) player.x = cameraRef.current;

    const currentDist = Math.floor(player.x / 10);
    distanceRef.current = currentDist;
    const calculatedStage = Math.floor(currentDist / STAGE_LENGTH) + 1;
    if (calculatedStage > stageRef.current) {
        stageRef.current = calculatedStage;
        setShowLevelUp(true);
        setTimeout(() => setShowLevelUp(false), 3000);
        bossSpawnedRef.current = 0;
    }
    if (stageRef.current % 2 === 0 && bossSpawnedRef.current !== stageRef.current) {
        spawnBoss(canvas.width, stageRef.current);
        bossSpawnedRef.current = stageRef.current;
    }

    // Spawning
    const enemySpawnInterval = Math.max(15, 30 - (stageRef.current * 2));
    if (currentDist > lastEnemySpawnDistRef.current + enemySpawnInterval) { spawnEnemy(canvas.width); lastEnemySpawnDistRef.current = currentDist; }
    if (currentDist > lastTerrainSpawnDistRef.current + 20) { spawnTerrain(canvas.width, groundLevel); lastTerrainSpawnDistRef.current = currentDist; }

    // Shooting
    const weapon = weapons[selectedWeaponIdx];
    const now = Date.now();
    const isFiring = keysRef.current['f'] || keysRef.current['Enter'] || keysRef.current['click'] || autoFireRef.current;
    if (isFiring && now - lastShotTimeRef.current > weapon.cooldown) {
        AudioService.shoot(weapon.id);
        const playerScreenX = player.x - cameraRef.current + player.width/2;
        const playerScreenY = player.y + player.height/3;
        const angle = Math.atan2(mouseRef.current.y - playerScreenY, mouseRef.current.x - playerScreenX);
        const startX = player.x + player.width/2;
        const startY = player.y + player.height/3;

        if (weapon.id === 'quantum') {
            objectsRef.current.forEach(o => { if (o.type.startsWith('enemy')) { applyDamage(o, 9999); spawnExplosion(o.x + o.width/2, o.y + o.height/2, 200, 0); } });
            spawnExplosion(player.x + 300, player.y, 400, 0); 
        } else {
             const createBullet = (angleOffset: number = 0) => {
                 const finalAngle = angle + angleOffset;
                 objectsRef.current.push({
                    id: `b-${now}-${Math.random()}`, x: startX + Math.cos(finalAngle)*30, y: startY + Math.sin(finalAngle)*30,
                    vx: Math.cos(finalAngle) * weapon.speed, vy: Math.sin(finalAngle) * weapon.speed,
                    width: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 8, height: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 4,
                    color: weapon.color, type: 'bullet', hp: 1, damage: weapon.damage, explosionRadius: weapon.explosionRadius, isGrenade: weapon.id === 'grenade', isRocket: weapon.id === 'rocket'
                });
            };
            const count = weapon.projectileCount || 1;
            for (let i = 0; i < count; i++) createBullet((i - (count-1)/2) * 0.1);
        }
        lastShotTimeRef.current = now;
        player.facing = Math.abs(angle) > Math.PI/2 ? -1 : 1;
    }

    // Object Updates
    objectsRef.current.forEach(obj => {
         if (obj.type === 'crate') return;
         
         // Enemy Physics & AI
         if (obj.type.startsWith('enemy')) {
             
             // --- BOSS AI (Restored) ---
             if (obj.type === 'enemy_mech' && obj.width > 100) {
                 obj.aiTimer = (obj.aiTimer || 0) + 1;
                 const distToPlayer = player.x - obj.x;

                 // State Machine
                 // 0: Idle/Chase, 1: Attack, 2: Summon, 3: Teleport
                 
                 // Phase transition logic
                 if (obj.aiTimer > 200 && obj.aiState === 0) {
                     const rand = Math.random();
                     if (rand < 0.4) obj.aiState = 1; // 40% chance attack
                     else if (rand < 0.7) obj.aiState = 2; // 30% chance summon
                     else obj.aiState = 3; // 30% chance teleport
                     obj.aiTimer = 0;
                 }

                 if (obj.aiState === 0) {
                     // Idle/Move Phase
                     obj.vx = distToPlayer > 0 ? 0.5 : -0.5;
                 } else if (obj.aiState === 1) {
                     // Attack Phase
                     obj.vx = 0;
                     if (obj.aiTimer % 20 === 0 && obj.aiTimer < 100) {
                        // Fire spread
                         for(let i=-1; i<=1; i++) {
                             const angle = Math.atan2((player.y+player.height/2)-obj.y, (player.x+player.width/2)-obj.x) + (i*0.2);
                             objectsRef.current.push({id: `boss-b-${Date.now()}-${i}`, x:obj.x+obj.width/2, y:obj.y+obj.height/3, vx:Math.cos(angle)*5, vy:Math.sin(angle)*5, width:15, height:15, color:'#f87171', type:'enemy_bullet', hp:1, damage:1});
                         }
                     }
                     if (obj.aiTimer > 120) { obj.aiState = 0; obj.aiTimer = 0; }
                 } else if (obj.aiState === 2) {
                     // Summon Phase
                     obj.vx = 0;
                     if (obj.aiTimer === 50) {
                         spawnEnemy(canvas.width, obj.x - 100, obj.y - 100, 'enemy_seeker');
                         spawnEnemy(canvas.width, obj.x + 100, obj.y - 100, 'enemy_jumper');
                         spawnParticle(obj.x + obj.width/2, obj.y, '#a855f7', 20);
                     }
                     if (obj.aiTimer > 80) { obj.aiState = 0; obj.aiTimer = 0; }
                 } else if (obj.aiState === 3) {
                     // Teleport Phase
                     obj.vx = 0;
                     if (obj.aiTimer === 40) {
                         spawnParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#ffffff', 30); // Poof old pos
                         obj.x = player.x + (Math.random() > 0.5 ? 300 : -300);
                         obj.y = Math.max(0, player.y - 200);
                         spawnParticle(obj.x + obj.width/2, obj.y + obj.height/2, '#ffffff', 30); // Poof new pos
                     }
                     if (obj.aiTimer > 60) { obj.aiState = 0; obj.aiTimer = 0; }
                 }

                 // Apply Physics to Boss
                 obj.vy += GRAVITY;
                 obj.x += obj.vx;
                 obj.y += obj.vy;
                 
                 // Boss collisions
                 if(obj.y + obj.height >= groundLevel) { obj.y = groundLevel - obj.height; obj.vy = 0; obj.grounded = true; }
             } 
             // --- STANDARD ENEMY AI ---
             else if (obj.type.includes('air') || obj.type.includes('mage') || obj.type.includes('seeker')) {
                 // Air logic
                 if(obj.type === 'enemy_meteor') {
                      obj.vy = 6; obj.y += obj.vy;
                      if(obj.y > groundLevel) { obj.hp = 0; spawnExplosion(obj.x + obj.width/2, obj.y, 100, 1); }
                 } else if (obj.type === 'enemy_seeker') {
                      const dx = player.x - obj.x; const dy = player.y - obj.y;
                      const dist = Math.sqrt(dx*dx + dy*dy);
                      if (dist > 10) { obj.vx = dx/dist * 3; obj.vy = dy/dist * 3; }
                      obj.x += obj.vx; obj.y += obj.vy;
                 } else {
                     // Basic hover/move
                     const dx = player.x - obj.x;
                     obj.vx = dx > 0 ? 2 : -2;
                     obj.y += Math.sin(frameCountRef.current * 0.05);
                     obj.x += obj.vx;
                     
                     // Shoot logic
                     obj.aiTimer = (obj.aiTimer || 0) + 1;
                     if(obj.type === 'enemy_mage' && obj.aiTimer > 150) {
                         const angle = Math.atan2((player.y+player.height/2)-obj.y, (player.x+player.width/2)-obj.x);
                         objectsRef.current.push({id: `eb-${Date.now()}`, x:obj.x, y:obj.y, vx:Math.cos(angle)*4, vy:Math.sin(angle)*4, width:10, height:10, color:'#d8b4fe', type:'enemy_bullet', hp:1, damage:1});
                         obj.aiTimer = 0;
                     }
                 }
             } else {
                 // Ground logic
                 obj.vy += GRAVITY;
                 
                 const dx = player.x - obj.x;
                 const dist = Math.abs(dx);
                 let speed = 2;
                 // Jumper Logic
                 if (obj.type === 'enemy_jumper' && obj.grounded && dist < 300) {
                     obj.vy = -12; obj.vx = dx > 0 ? 5 : -5; obj.grounded = false;
                 } else if (Math.abs(dx) < 800) {
                     obj.vx = dx > 0 ? speed : -speed;
                 } else { obj.vx = 0; }
                 
                 obj.x += obj.vx;
                 
                 // Collisions
                 crates.forEach(c => { if(checkCollision(obj, c)) { /* Wall/Floor logic */ } }); // Simplified

                 obj.y += obj.vy;
                 obj.grounded = false;
                 crates.forEach(c => { if(checkCollision(obj, c) && obj.vy > 0 && obj.y < c.y) { obj.y = c.y - obj.height; obj.vy = 0; obj.grounded = true; }});
                 if(obj.y + obj.height >= groundLevel) { obj.y = groundLevel - obj.height; obj.vy = 0; obj.grounded = true; }
             }
         }
         
         // Projectiles
         if (obj.type === 'bullet' || obj.type === 'enemy_bullet') {
             if (obj.isGrenade) { obj.vy += GRAVITY * 0.5; if(obj.y > groundLevel) { obj.hp = 0; spawnExplosion(obj.x, obj.y, obj.explosionRadius||150, obj.damage||200); }}
             else if (obj.isRocket && obj.y > groundLevel) { obj.hp = 0; spawnExplosion(obj.x, obj.y, obj.explosionRadius||200, obj.damage||300); }
             obj.x += obj.vx; obj.y += obj.vy;
         }
         
         // Effects
         if (obj.type === 'explosion') obj.hp--;
         if (obj.type === 'particle') { obj.x += obj.vx; obj.y += obj.vy; obj.width *= 0.9; obj.height *= 0.9; if(obj.width < 0.5) obj.hp = 0; }
    });
    
    // Collisions
    const bullets = objectsRef.current.filter(o => o.type === 'bullet');
    const enemies = objectsRef.current.filter(o => o.type.startsWith('enemy'));
    bullets.forEach(b => {
        enemies.forEach(e => {
            if(checkCollision(b, e)) {
                if(b.isGrenade || b.isRocket) { b.hp = 0; spawnExplosion(b.x, b.y, b.explosionRadius||150, b.damage||200); }
                else { applyDamage(e, b.damage||1); b.hp = 0; spawnParticle(b.x, b.y, '#fff', 5); }
            }
        });
        if(Math.abs(b.x - cameraRef.current) > canvas.width + 200) b.hp = 0;
    });
    
    // Player Hit
    [...enemies, ...objectsRef.current.filter(o => o.type === 'enemy_bullet')].forEach(e => {
        if(checkCollision(e, player)) {
            player.hp -= 1; AudioService.hit(); spawnParticle(player.x, player.y, '#ef4444', 15);
            player.vy = -6; player.vx = player.x < e.x ? -10 : 10; e.vx = -e.vx * 2;
            if(e.type === 'enemy_bullet') e.hp = 0;
            if(player.hp <= 0) { setGameState('gameover'); }
        }
    });

    objectsRef.current = objectsRef.current.filter(o => o.hp > 0 && o.x > cameraRef.current - 400 && o.x < cameraRef.current + canvas.width + 400);
    setStats(prev => ({...prev, distanceTraveled: distanceRef.current, currentStage: stageRef.current }));

    // -------------------------------------------------------------------------------------
    // RENDER START
    // -------------------------------------------------------------------------------------
    
    // 1. Background (Deep Space with Gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, '#000000');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0,0, canvas.width, canvas.height);

    // Stars Parallax
    ctx.fillStyle = '#ffffff';
    starsRef.current.forEach(star => {
        const x = (star.x - cameraRef.current * (0.1 * star.size)) % (canvas.width + 200);
        const actualX = x < 0 ? x + canvas.width : x;
        ctx.globalAlpha = star.alpha;
        ctx.beginPath(); ctx.arc(actualX, star.y, star.size, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // 2. Decor (Far Mountains/Grid)
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=100) {
        const x = (i - cameraRef.current * 0.5) % canvas.width;
        ctx.beginPath(); ctx.moveTo(x, canvas.height); ctx.lineTo(x, canvas.height-200); ctx.stroke();
    }

    // 3. Ground
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
    // Neon Line
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, groundLevel, canvas.width, 2);
    ctx.shadowBlur = 0;

    // 4. Objects
    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    };

    const drawObj = (o: GameObject) => {
        const screenX = o.x - cameraRef.current;
        const screenY = o.y;
        
        // Health Bars (Sleek)
        if (o.type.startsWith('enemy') && o.maxHp && o.type !== 'enemy_bullet') {
            const pct = Math.max(0, o.hp / o.maxHp);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            drawRoundedRect(screenX, screenY - 12, o.width, 4, 2);
            ctx.fill();
            ctx.fillStyle = pct > 0.5 ? '#22c55e' : '#ef4444';
            drawRoundedRect(screenX, screenY - 12, o.width * pct, 4, 2);
            ctx.fill();
        }

        ctx.save();
        ctx.translate(screenX + o.width/2, screenY + o.height/2);
        if (o.facing === -1) ctx.scale(-1, 1);
        ctx.translate(-o.width/2, -o.height/2);

        // OPTIMIZATION: Particles are drawn simply without shadowBlur to fix lag
        if (o.type === 'particle') {
             ctx.shadowBlur = 0; 
             ctx.fillStyle = o.color;
             ctx.globalAlpha = o.hp; // Fade out
             ctx.fillRect(0, 0, o.width, o.height);
             ctx.globalAlpha = 1;
             ctx.restore();
             return;
        }

        if (o.type === 'player') {
            // Player: Futuristic Robot
            ctx.shadowColor = o.color; ctx.shadowBlur = 15;
            
            // Body Gradient
            const grad = ctx.createLinearGradient(0, 0, 0, o.height);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(1, o.color);
            ctx.fillStyle = grad;
            
            // Draw Capsule Body
            drawRoundedRect(5, 5, o.width-10, o.height-5, 15);
            ctx.fill();

            // Visor
            ctx.fillStyle = '#000000';
            drawRoundedRect(10, 10, o.width-20, 10, 4);
            ctx.fill();

            // Arm/Weapon
            ctx.save();
            ctx.translate(o.width/2, o.height/2);
            const playerScreenCenter = { x: screenX + o.width/2, y: screenY + o.height/2 };
            const aimAngle = Math.atan2(mouseRef.current.y - playerScreenCenter.y, mouseRef.current.x - playerScreenCenter.x);
            let rotation = aimAngle;
            if (o.facing === -1) rotation = Math.PI - aimAngle; 
            ctx.rotate(rotation);
            
            ctx.fillStyle = weapons[selectedWeaponIdx].color;
            drawRoundedRect(0, -4, 30, 8, 2); // Weapon barrel
            ctx.fill();
            ctx.restore();

        } else if (o.type === 'enemy_ground' || o.type === 'enemy_dasher') {
             // Ground Droids
             ctx.shadowColor = o.color; ctx.shadowBlur = 10;
             ctx.fillStyle = o.color;
             
             // Trapezoid Body
             ctx.beginPath();
             ctx.moveTo(5, o.height);
             ctx.lineTo(-5, 10);
             ctx.lineTo(o.width + 5, 10);
             ctx.lineTo(o.width - 5, o.height);
             ctx.fill();
             
             // Head
             ctx.fillStyle = '#1e293b';
             ctx.beginPath(); ctx.arc(o.width/2, 10, 12, Math.PI, 0); ctx.fill();
             // Eye
             ctx.fillStyle = '#ef4444';
             ctx.beginPath(); ctx.arc(o.width/2 + 4, 6, 3, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'enemy_air' || o.type === 'enemy_seeker') {
             // Air Units (Tear Drop)
             ctx.shadowColor = o.color; ctx.shadowBlur = 15;
             ctx.fillStyle = o.color;
             ctx.beginPath();
             ctx.moveTo(o.width, o.height/2); // Front tip
             ctx.quadraticCurveTo(0, -10, 0, o.height/2); // Top curve
             ctx.quadraticCurveTo(0, o.height+10, o.width, o.height/2); // Bottom curve
             ctx.fill();
             
             // Engine Glow
             ctx.fillStyle = '#ffffff';
             ctx.beginPath(); ctx.arc(5, o.height/2, 4, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'enemy_mech' || o.type === 'enemy_breaker') {
             // Heavy Mechs / BOSS
             const isBoss = o.width > 100;
             ctx.shadowColor = o.color; ctx.shadowBlur = 10;
             ctx.fillStyle = '#1e293b'; // Dark metal body
             drawRoundedRect(0, 0, o.width, o.height, 8);
             ctx.fill();
             
             // Colored Armor Plates
             ctx.fillStyle = o.color;
             drawRoundedRect(5, 5, o.width-10, 20, 4); // Chest
             ctx.fill();
             drawRoundedRect(5, o.height-30, 15, 30, 4); // Leg L
             ctx.fill();
             drawRoundedRect(o.width-20, o.height-30, 15, 30, 4); // Leg R
             ctx.fill();
             
             // Boss Eye / Charge Indicator
             if (isBoss) {
                 ctx.fillStyle = (o.aiState === 1 || o.aiState === 2) ? '#ffffff' : '#ef4444';
                 ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 20;
                 ctx.beginPath(); ctx.arc(o.width/2, 40, 10, 0, Math.PI*2); ctx.fill();
             }

        } else if (o.type === 'crate') {
            // Neon Crates
            ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 5;
            
            drawRoundedRect(0,0,o.width,o.height, 4);
            ctx.fill();
            ctx.stroke();
            
            // Grid pattern inside
            ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
            for(let i=10; i<o.width; i+=20) {
                 ctx.fillRect(i, 0, 1, o.height);
            }

        } else if (o.type === 'bullet' || o.type === 'enemy_bullet') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 10;
             ctx.fillStyle = '#ffffff';
             ctx.beginPath(); 
             if (o.type === 'bullet' && !o.isGrenade && !o.isRocket) {
                 // Laser beam look
                 drawRoundedRect(0, 0, o.width, o.height, 2);
             } else {
                 ctx.arc(o.width/2, o.height/2, o.width/2, 0, Math.PI*2);
             }
             ctx.fill();
             // Outer glow
             ctx.fillStyle = o.color;
             ctx.globalAlpha = 0.5;
             ctx.beginPath(); ctx.arc(o.width/2, o.height/2, o.width, 0, Math.PI*2); ctx.fill();
             ctx.globalAlpha = 1;
             
        } else if (o.type === 'explosion') {
             ctx.shadowColor = o.color; ctx.shadowBlur = 20;
             ctx.fillStyle = o.color;
             ctx.globalAlpha = 0.6;
             ctx.beginPath(); ctx.arc(o.width/2, o.height/2, o.width/2, 0, Math.PI*2); ctx.fill();
             ctx.globalAlpha = 1;
             
        } else {
            // Fallback
            ctx.fillStyle = o.color;
            ctx.fillRect(0,0,o.width,o.height);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    };

    [...objectsRef.current, playerRef.current].forEach(o => {
        if (o.x + o.width < cameraRef.current || o.x > cameraRef.current + canvas.width) return;
        drawObj(o);
    });

    // Crosshair
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mouseRef.current.x, mouseRef.current.y, 8, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#06b6d4'; ctx.beginPath(); ctx.arc(mouseRef.current.x, mouseRef.current.y, 2, 0, Math.PI*2); ctx.fill();

    requestRef.current = requestAnimationFrame(loop);
  }, [gameState, selectedWeaponIdx, weapons]); // Dependencies

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        keysRef.current[e.key] = true;
        if (e.key === 'j') { autoFireRef.current = !autoFireRef.current; setAutoFire(autoFireRef.current); AudioService.switch(); }
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
    <div className="fixed inset-0 w-full h-full bg-slate-950 overflow-hidden cursor-none font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* --- UI OVERLAYS (Apple Style Glassmorphism) --- */}

      {/* Stage Notification */}
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

      {/* Top Left HUD - Floating Glass Island */}
      <div className="absolute top-6 left-6 flex flex-col gap-4 pointer-events-none z-10">
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

            {/* Health Pips */}
            <div className="flex gap-1.5 pl-2">
                 {[...Array(maxHp)].map((_, i) => (
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
      
      {/* Auto Fire Indicator */}
      <div className="absolute bottom-10 left-10 pointer-events-none">
          <div className={`
              flex items-center gap-3 px-4 py-2 rounded-full backdrop-blur-md border transition-all duration-300
              ${autoFire 
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                : 'bg-white/5 border-white/5 text-slate-400'}
          `}>
              <Cpu size={16} />
              <span className="text-xs font-bold tracking-widest">AUTO-FIRE [J]</span>
              <div className={`w-2 h-2 rounded-full ${autoFire ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></div>
          </div>
      </div>

      {/* Top Right: Weapon Dock (iOS Style) */}
      <div className="absolute top-6 right-6 p-2 bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl flex gap-3 pointer-events-auto z-20">
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
                        <span className="absolute -bottom-4 text-[9px] font-bold text-white/40 opacity-0 group-hover:opacity-100 transition-opacity">
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

      {/* Score */}
      <div className="absolute bottom-10 right-10 pointer-events-none">
          <div className="text-7xl font-bold text-white/5 tracking-tighter select-none">
                {stats.score.toString().padStart(6, '0')}
          </div>
      </div>

      {/* Settings Modal (iOS Sheet) */}
      {editingWeapon !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900/90 border border-white/10 p-8 rounded-[2rem] w-[28rem] shadow-2xl animate-in zoom-in-95 duration-300 backdrop-blur-xl">
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
                          { label: 'Fire Rate', field: 'cooldown', min: 20, max: 2000, color: 'accent-cyan-500' },
                          { label: 'Damage Output', field: 'damage', min: 1, max: 1000, color: 'accent-pink-500' },
                          { label: 'Velocity', field: 'speed', min: 1, max: 40, color: 'accent-yellow-500' },
                          { label: 'Multi-Shot', field: 'projectileCount', min: 1, max: 20, color: 'accent-emerald-500' }
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

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 cursor-auto">
          <div className="text-center p-10 max-w-lg w-full animate-in slide-in-from-bottom-10 fade-in duration-500">
            <h2 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-500 to-red-900 mb-2 tracking-tighter drop-shadow-2xl">MIA</h2>
            <p className="text-xl text-red-200/50 font-medium tracking-[0.5em] uppercase mb-12">Mission Failed</p>
            
            <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-lg">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Sector Reached</p>
                    <p className="text-3xl font-bold text-white">{stats.currentStage}</p>
                </div>
                 <div className="bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-lg">
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
          className="absolute bottom-8 left-8 w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-400 rounded-full transition-all pointer-events-auto z-40 backdrop-blur border border-white/5"
        >
          <ArrowLeft size={20} />
      </button>
    </div>
  );
};

export default RunAndGunGame;
