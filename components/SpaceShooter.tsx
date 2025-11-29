
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
    1: { id: 'pistol', name: 'M9 Blaster', cooldown: 200, color: '#fbbf24', damage: 25, speed: 12, projectileCount: 1 },
    2: { id: 'machinegun', name: 'Auto Rifle', cooldown: 80, color: '#facc15', damage: 15, speed: 18, projectileCount: 1 },
    3: { id: 'sniper', name: 'Sniper', cooldown: 1000, color: '#38bdf8', damage: 150, speed: 30, projectileCount: 1 },
    4: { id: 'shotgun', name: 'Shotgun', cooldown: 700, color: '#ef4444', damage: 20, speed: 12, projectileCount: 5 },
    5: { id: 'grenade', name: 'Bomb', cooldown: 800, color: '#10b981', damage: 200, speed: 10, explosionRadius: 150, projectileCount: 1 },
    6: { id: 'rocket', name: 'Rocket Launcher', cooldown: 1200, color: '#f97316', damage: 300, speed: 15, explosionRadius: 200, projectileCount: 1 },
    7: { id: 'quantum', name: 'Quantum Nuke', cooldown: 5000, color: '#8b5cf6', damage: 1000, speed: 0, explosionRadius: 9999, projectileCount: 0 }
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
  const STAGE_LENGTH = 300; // Meters per stage
  const DOUBLE_JUMP_FORCE = -12;
  
  // Terrain Constants
  const TIER_HEIGHT = 120; // Player jumps ~160px. 120px is safe.
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

  // Initialize High Score
  useEffect(() => {
    const saved = localStorage.getItem('tf_highscore_platformer');
    if (saved) setStats(s => ({ ...s, highScore: parseInt(saved, 10) }));
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
    
    // Reset Auto Fire
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
          id: `boss-${Date.now()}`,
          x: spawnX,
          y: 0, // Snaps to ground
          vx: 0, vy: 0,
          width: 120, height: 160,
          color: '#dc2626', // Red
          type: 'enemy_mech', // Reuse mech logic but bigger stats
          hp: 1000,
          maxHp: 1000,
          grounded: false,
          facing: -1,
          variant: 0 // Boss variant
      });
  };

  const spawnEnemy = (canvasWidth: number) => {
    const spawnX = cameraRef.current + canvasWidth + 50;
    const stage = stageRef.current;
    
    // Stop spawning regular enemies if a boss is alive
    const bossExists = objectsRef.current.some(o => o.hp > 500 && o.type === 'enemy_mech' && o.width > 100);
    if (bossExists && Math.random() > 0.2) return; 

    // New Enemy Probabilities based on Stage
    let enemyType: GameObjectType = 'enemy_ground';
    const r = Math.random();

    if (stage === 1) {
        // Mostly soldiers, rare Jumper
        if (r > 0.9) enemyType = 'enemy_jumper';
        else enemyType = 'enemy_ground';
    } else if (stage === 2) {
        // Introduce Seekers and Dashers
        if (r > 0.9) enemyType = 'enemy_dasher';
        else if (r > 0.8) enemyType = 'enemy_seeker';
        else if (r > 0.6) enemyType = 'enemy_jumper';
        else if (r > 0.4) enemyType = 'enemy_air'; // Drone
        else enemyType = 'enemy_ground';
    } else {
        // Full Chaos
        if (r > 0.85) enemyType = 'enemy_mech';
        else if (r > 0.75) enemyType = 'enemy_dasher';
        else if (r > 0.65) enemyType = 'enemy_seeker';
        else if (r > 0.55) enemyType = 'enemy_jumper';
        else if (r > 0.35) enemyType = 'enemy_air';
        else enemyType = 'enemy_ground';
    }
    
    // Choose visual variant (0, 1, or 2)
    const variant = Math.floor(Math.random() * 3);

    if (enemyType === 'enemy_air') {
        const hp = 30 + (stage * 10);
        const colors = ['#ef4444', '#06b6d4', '#f59e0b'];
        objectsRef.current.push({
            id: `enemy-air-${Date.now()}`,
            x: spawnX,
            y: Math.random() * (canvasRef.current!.height - 300) + 50,
            vx: -3 - (stage * 0.5), vy: 0,
            width: 30, height: 20,
            color: colors[variant],
            type: 'enemy_air',
            hp: hp, maxHp: hp,
            facing: -1, variant
        });
    } else if (enemyType === 'enemy_seeker') {
        const hp = 20 + (stage * 10);
        objectsRef.current.push({
            id: `enemy-seeker-${Date.now()}`,
            x: spawnX,
            y: Math.random() * (canvasRef.current!.height - 200) + 50,
            vx: -2, vy: 0,
            width: 25, height: 25,
            color: '#a855f7', // Purple
            type: 'enemy_seeker',
            hp: hp, maxHp: hp,
            facing: -1, variant
        });
    } else if (enemyType === 'enemy_mech') {
         const hp = 200 + (stage * 50);
         const colors = ['#581c87', '#be185d', '#1e3a8a'];
         objectsRef.current.push({
            id: `enemy-mech-${Date.now()}`,
            x: spawnX, y: 0,
            vx: -1, vy: 0,
            width: 60, height: 80,
            color: colors[variant], 
            type: 'enemy_mech',
            hp: hp, maxHp: hp,
            grounded: false, facing: -1, variant
        });
    } else if (enemyType === 'enemy_jumper') {
        const hp = 40 + (stage * 10);
        objectsRef.current.push({
           id: `enemy-jumper-${Date.now()}`,
           x: spawnX, y: 0,
           vx: -2, vy: 0,
           width: 30, height: 35,
           color: '#4ade80', // Green
           type: 'enemy_jumper',
           hp: hp, maxHp: hp,
           grounded: false, facing: -1, variant,
           aiTimer: 0 // Cooldown for jumps
       });
    } else if (enemyType === 'enemy_dasher') {
        const hp = 60 + (stage * 15);
        objectsRef.current.push({
           id: `enemy-dasher-${Date.now()}`,
           x: spawnX, y: 0,
           vx: -1, vy: 0,
           width: 45, height: 25,
           color: '#eab308', // Yellow
           type: 'enemy_dasher',
           hp: hp, maxHp: hp,
           grounded: false, facing: -1, variant,
           aiTimer: 0 // 0 = patrol, 1 = charge
       });
    } else {
        // Standard Soldier
        const hp = 50 + (stage * 10);
        const colors = ['#f97316', '#10b981', '#64748b'];
        objectsRef.current.push({
            id: `enemy-ground-${Date.now()}`,
            x: spawnX, y: 0, 
            vx: -2 - (stage * 0.5), vy: 0,
            width: 30, height: 50,
            color: colors[variant],
            type: 'enemy_ground',
            hp: hp, maxHp: hp,
            grounded: false, facing: -1, variant
        });
    }
  };

  const spawnTerrain = (canvasWidth: number, groundLevel: number) => {
      const spawnX = cameraRef.current + canvasWidth + 100 + Math.random() * 50;
      
      const r = Math.random();
      let tier = 1;
      if (r > 0.9) tier = 5;
      else if (r > 0.75) tier = 4;
      else if (r > 0.55) tier = 3;
      else if (r > 0.3) tier = 2;
      
      const width = 150 + Math.random() * 200;
      const height = PLATFORM_THICKNESS; 
      const y = groundLevel - (tier * TIER_HEIGHT);

      if (y < 50) return;

      const isWall = Math.random() > 0.9 && tier === 1;
      
      if (isWall) {
          objectsRef.current.push({
              id: `terrain-wall-${Date.now()}`,
              x: spawnX,
              y: groundLevel - 200,
              vx: 0, vy: 0,
              width: 40, height: 200, 
              color: '#475569',
              type: 'crate',
              hp: 999
          });
      } else {
          objectsRef.current.push({
              id: `terrain-${Date.now()}`,
              x: spawnX,
              y: y,
              vx: 0, vy: 0,
              width: width, height: height, 
              color: '#475569',
              type: 'crate',
              hp: 999
          });
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
          setStats(prev => ({ 
              ...prev, 
              score: scoreRef.current, 
              enemiesDefeated: prev.enemiesDefeated + 1 
          }));
      }
  };

  const spawnExplosion = (x: number, y: number, size: number, damage: number = 0) => {
      AudioService.explosion();
      objectsRef.current.push({
          id: `expl-${Date.now()}-${Math.random()}`,
          x: x - size/2, y: y - size/2,
          vx: 0, vy: 0,
          width: size, height: size,
          color: '#f87171',
          type: 'explosion',
          hp: 10,
          damage: 0 // Damage handled instantly below
      });
      spawnParticle(x, y, '#fca5a5', 12);
      spawnParticle(x, y, '#fee2e2', 8);

      // Instant Area Damage Logic
      const explosionRect = { 
          x: x - size/2, 
          y: y - size/2, 
          width: size, 
          height: size,
          id: 'temp', vx:0, vy:0, color:'', type:'explosion' as const, hp: 0
      };

      const enemies = objectsRef.current.filter(o => o.type.startsWith('enemy'));
      enemies.forEach(e => {
          if (checkCollision(explosionRect, e)) {
              applyDamage(e, damage);
          }
      });
  }

  const spawnParticle = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8;
      objectsRef.current.push({
        id: `p-${Math.random()}`,
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        width: 4, height: 4,
        color: color,
        type: 'particle',
        hp: 1 
      });
    }
  };

  const checkCollision = (rect1: GameObject, rect2: GameObject) => {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
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
      setWeapons(prev => ({
          ...prev,
          [editingWeapon]: {
              ...prev[editingWeapon],
              [field]: val
          }
      }));
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

    // --- Input Handling for Weapons ---
    ['1','2','3','4','5','6','7'].forEach(key => {
        if (keysRef.current[key]) switchWeapon(parseInt(key));
    });

    // --- Player Movement ---
    if (keysRef.current['ArrowRight'] || keysRef.current['d']) {
        player.vx += 1;
        player.facing = 1;
    } else if (keysRef.current['ArrowLeft'] || keysRef.current['a']) {
        player.vx -= 1;
        player.facing = -1;
    } else {
        player.vx *= FRICTION;
    }
    
    player.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, player.vx));

    player.vy += GRAVITY;
    player.x += player.vx;
    player.y += player.vy;

    // Floor Collision
    if (player.y + player.height >= groundLevel) {
        player.y = groundLevel - player.height;
        player.vy = 0;
        player.grounded = true;
        player.jumps = 0; 
    } else {
        player.grounded = false;
    }

    // Terrain Collision (Player)
    const crates = objectsRef.current.filter(o => o.type === 'crate');
    crates.forEach(crate => {
        if (checkCollision(player, crate)) {
            const overlapX = (player.width + crate.width)/2 - Math.abs((player.x + player.width/2) - (crate.x + crate.width/2));
            const overlapY = (player.height + crate.height)/2 - Math.abs((player.y + player.height/2) - (crate.y + crate.height/2));

            if (overlapX < overlapY) {
                if (player.x < crate.x) player.x = crate.x - player.width;
                else player.x = crate.x + crate.width;
                player.vx = 0;
            } else {
                if (player.y < crate.y) {
                    player.y = crate.y - player.height;
                    player.vy = 0;
                    player.grounded = true;
                    player.jumps = 0;
                } else {
                    player.y = crate.y + crate.height;
                    player.vy = 0;
                }
            }
        }
    });

    // --- Camera & Distance ---
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

    // --- Spawning Logic ---
    const enemySpawnInterval = Math.max(15, 30 - (stageRef.current * 2));
    if (currentDist > lastEnemySpawnDistRef.current + enemySpawnInterval) {
        spawnEnemy(canvas.width);
        lastEnemySpawnDistRef.current = currentDist;
    }

    const terrainSpawnInterval = 20;
    if (currentDist > lastTerrainSpawnDistRef.current + terrainSpawnInterval) {
        spawnTerrain(canvas.width, groundLevel);
        lastTerrainSpawnDistRef.current = currentDist;
    }

    // --- Shooting ---
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
            ctx.fillStyle = 'white';
            ctx.fillRect(0,0,canvas.width, canvas.height);
            objectsRef.current.forEach(o => {
                if (o.type.startsWith('enemy')) {
                    applyDamage(o, 9999);
                    spawnExplosion(o.x + o.width/2, o.y + o.height/2, 200, 0);
                }
            });
            spawnExplosion(player.x + 300, player.y, 400, 0); 
        } else {
             const createBullet = (angleOffset: number = 0) => {
                 const finalAngle = angle + angleOffset;
                 objectsRef.current.push({
                    id: `b-${now}-${Math.random()}`,
                    x: startX + (Math.cos(finalAngle) * 30),
                    y: startY + (Math.sin(finalAngle) * 30),
                    vx: Math.cos(finalAngle) * weapon.speed,
                    vy: Math.sin(finalAngle) * weapon.speed,
                    width: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 10, 
                    height: (weapon.id === 'grenade' || weapon.id === 'rocket') ? 12 : 4,
                    color: weapon.color,
                    type: 'bullet',
                    hp: 1, 
                    damage: weapon.damage,
                    explosionRadius: weapon.explosionRadius,
                    isGrenade: weapon.id === 'grenade',
                    isRocket: weapon.id === 'rocket'
                });
            };
            const count = weapon.projectileCount || 1;
            if (count > 1) {
                for (let i = 0; i < count; i++) {
                    createBullet((i - (count-1)/2) * 0.1);
                }
            } else {
                createBullet(0);
            }
        }
        lastShotTimeRef.current = now;
        player.facing = Math.abs(angle) > Math.PI/2 ? -1 : 1;
    }

    // --- Object Logic ---
    objectsRef.current.forEach(obj => {
        if (obj.type === 'crate') return;

        // --- GROUND ENEMY PHYSICS & AI ---
        // Includes: Soldier, Mech, Jumper, Dasher
        if (['enemy_ground', 'enemy_mech', 'enemy_jumper', 'enemy_dasher'].includes(obj.type)) {
            obj.vy += GRAVITY;
            
            // X Movement Logic based on type
            let moveSpeed = 0;
            const dx = player.x - obj.x;
            const dist = Math.abs(dx);

            if (dist < 1000) {
                // Determine base speed
                let speed = 2;
                if (obj.type === 'enemy_mech') speed = 0.5;
                if (obj.width > 100) speed = 0.8; // Boss

                // AI BEHAVIOR
                if (obj.type === 'enemy_jumper') {
                    // Jumper Logic
                    obj.aiTimer = (obj.aiTimer || 0) + 1;
                    if (obj.grounded && obj.aiTimer > 60 && dist < 400) {
                        // Jump!
                        if (Math.random() > 0.3) {
                            obj.vy = -12; // Big jump
                            obj.vx = dx > 0 ? 5 : -5;
                            obj.grounded = false;
                        }
                        obj.aiTimer = 0;
                    }
                    if (!obj.grounded) {
                        // Keep momentum in air
                        moveSpeed = obj.vx;
                    } else {
                        // Stop when landed to charge next jump
                        moveSpeed = 0;
                        obj.vx = 0;
                    }

                } else if (obj.type === 'enemy_dasher') {
                    // Dasher Logic
                    const dy = Math.abs(player.y - obj.y);
                    if (dist < 500 && dy < 50) {
                        // Charge mode
                        obj.aiTimer = 1; 
                        moveSpeed = dx > 0 ? 8 : -8;
                        obj.color = '#ef4444'; // Red when charging
                    } else {
                        // Patrol mode
                        obj.aiTimer = 0;
                        moveSpeed = dx > 0 ? 1 : -1;
                        obj.color = '#eab308'; // Yellow normal
                    }

                } else {
                    // Standard Soldier/Mech Tracking
                    moveSpeed = dx > 0 ? speed : -speed;
                    obj.facing = dx > 0 ? 1 : -1;
                }
            }

            // Apply X velocity if not overridden by special physics (like Jumper in air)
            if (obj.type !== 'enemy_jumper' || obj.grounded) {
                obj.vx = moveSpeed;
            }
            
            obj.x += obj.vx;

            // Horizontal Wall Collision
            const oldX = obj.x;
            let hitWall = false;
            for (const crate of crates) {
                if (checkCollision(obj, crate)) {
                    const overlapX = (obj.width + crate.width)/2 - Math.abs((obj.x + obj.width/2) - (crate.x + crate.width/2));
                    const overlapY = (obj.height + crate.height)/2 - Math.abs((obj.y + obj.height/2) - (crate.y + crate.height/2));
                    
                    if (overlapX < overlapY && overlapY > 2) {
                        obj.x = oldX;
                        hitWall = true;
                    }
                }
            }
            if (hitWall && obj.type !== 'enemy_jumper') {
                 // Dashers turn around on wall hit? Or jump?
                 if (obj.type === 'enemy_dasher') obj.vx = 0;
            }

            // Vertical Movement
            obj.y += obj.vy;
            obj.grounded = false; // Assume falling until hit floor

            // Floor/Crate Vertical Collision
            for (const crate of crates) {
                if (checkCollision(obj, crate)) {
                     const overlapX = (obj.width + crate.width)/2 - Math.abs((obj.x + obj.width/2) - (crate.x + crate.width/2));
                     const overlapY = (obj.height + crate.height)/2 - Math.abs((obj.y + obj.height/2) - (crate.y + crate.height/2));

                     if (overlapX >= overlapY) {
                         if (obj.vy > 0 && obj.y < crate.y) {
                             obj.y = crate.y - obj.height;
                             obj.vy = 0;
                             obj.grounded = true;
                         } 
                     }
                }
            }
            // Ground Collision
            if (obj.y + obj.height >= groundLevel) {
                obj.y = groundLevel - obj.height;
                obj.vy = 0;
                obj.grounded = true;
            }

        // --- AIR / SEEKER ENEMY PHYSICS ---
        } else if (obj.type === 'enemy_air' || obj.type === 'enemy_seeker') {
            const dx = player.x - obj.x;
            const dy = player.y - obj.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 1000) {
                if (obj.type === 'enemy_seeker') {
                    // Direct tracking
                    if (dist > 10) {
                        obj.vx = (dx / dist) * 3;
                        obj.vy = (dy / dist) * 3;
                    }
                    obj.x += obj.vx;
                    obj.y += obj.vy;
                } else {
                    // Standard Air (Sine wave)
                    obj.x += dx > 0 ? 1.5 : -1.5;
                    obj.y += Math.sin(frameCountRef.current * 0.05) * 1; 
                }
            }
        
        // --- BULLET PHYSICS ---
        } else if (obj.type === 'bullet') {
            if (obj.isGrenade) {
                obj.vy += GRAVITY * 0.5;
                if (obj.y > groundLevel) {
                    obj.hp = 0;
                    spawnExplosion(obj.x, obj.y, obj.explosionRadius || 150, obj.damage || 200);
                }
            } else if (obj.isRocket) {
                if (obj.y > groundLevel) {
                    obj.hp = 0;
                    spawnExplosion(obj.x, obj.y, obj.explosionRadius || 200, obj.damage || 300);
                }
            }
            obj.x += obj.vx;
            obj.y += obj.vy;
        
        // --- EFFECTS PHYSICS ---
        } else if (obj.type === 'explosion') {
            obj.hp--; 
        } else if (obj.type === 'particle') {
            obj.x += obj.vx;
            obj.y += obj.vy;
            obj.width *= 0.9;
            obj.height *= 0.9;
            if (obj.width < 0.5) obj.hp = 0;
        }
    });

    // --- Collisions ---
    const bullets = objectsRef.current.filter(o => o.type === 'bullet');
    const enemies = objectsRef.current.filter(o => o.type.startsWith('enemy'));

    bullets.forEach(b => {
        enemies.forEach(e => {
            if (checkCollision(b, e)) {
                if (b.isGrenade) {
                    b.hp = 0;
                    spawnExplosion(b.x, b.y, b.explosionRadius || 150, b.damage || 200);
                } else if (b.isRocket) {
                    b.hp = 0;
                    spawnExplosion(b.x, b.y, b.explosionRadius || 200, b.damage || 300);
                } else {
                    AudioService.hit();
                    applyDamage(e, b.damage || 1);
                    if (weapons[selectedWeaponIdx]?.id !== 'sniper') b.hp = 0; 
                    spawnParticle(b.x, b.y, '#fff', 3);
                }
            }
        });
        if (Math.abs(b.x - cameraRef.current) > canvas.width + 200) b.hp = 0;
    });

    enemies.forEach(e => {
        if (checkCollision(e, player)) {
            player.vy = -6;
            player.vx = player.x < e.x ? -10 : 10;
            player.hp -= 1;
            AudioService.hit();
            e.vx = -e.vx * 2;
            spawnParticle(player.x, player.y, '#ef4444', 15);

            if (player.hp <= 0) {
                setGameState('gameover');
                setStats(prev => {
                    const newHigh = Math.max(prev.highScore, scoreRef.current);
                    localStorage.setItem('tf_highscore_platformer', newHigh.toString());
                    return { ...prev, highScore: newHigh };
                });
            }
        }
    });

    objectsRef.current = objectsRef.current.filter(o => {
        const inRange = o.x > cameraRef.current - 400 && o.x < cameraRef.current + canvas.width + 400;
        return o.hp > 0 && inRange;
    });

    setStats(prev => ({...prev, distanceTraveled: distanceRef.current, currentStage: stageRef.current }));

    // --- Render ---
    ctx.fillStyle = '#1e293b'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgColors = ['#0f172a', '#1e1b4b', '#312e81', '#4c0519']; 
    const bgIdx = (stageRef.current - 1) % bgColors.length;
    ctx.fillStyle = bgColors[bgIdx];
    
    for (let i = 0; i < 8; i++) {
        const x = (i * 400) - (cameraRef.current * 0.2) % 3200;
        ctx.fillStyle = i % 2 === 0 ? '#1e293b' : '#334155';
        ctx.fillRect(x, canvas.height - 300 - (i*20), 200 + i*20, 400);
    }
    
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
    
    ctx.fillStyle = '#fbbf24';
    const nextLevelX = (stageRef.current * STAGE_LENGTH * 10) - cameraRef.current;
    if (nextLevelX > 0 && nextLevelX < canvas.width) {
        ctx.fillRect(nextLevelX, groundLevel, 10, 50);
    }

    const drawObj = (o: GameObject) => {
        const screenX = o.x - cameraRef.current;
        const screenY = o.y;
        
        if (o.type.startsWith('enemy') && o.maxHp) {
            const barWidth = o.width;
            const barHeight = 4;
            const pct = Math.max(0, o.hp / o.maxHp);
            ctx.fillStyle = '#1f2937'; 
            ctx.fillRect(screenX, screenY - 10, barWidth, barHeight);
            ctx.fillStyle = pct > 0.5 ? '#22c55e' : '#ef4444';
            ctx.fillRect(screenX, screenY - 10, barWidth * pct, barHeight);
        }

        ctx.save();
        ctx.translate(screenX + o.width/2, screenY + o.height/2);
        if (o.facing === -1) ctx.scale(-1, 1);
        ctx.translate(-o.width/2, -o.height/2);

        if (o.type === 'player') {
            ctx.fillStyle = o.color;
            ctx.fillRect(0, 0, o.width, o.height); 
            ctx.fillStyle = '#ef4444'; ctx.fillRect(0, 5, o.width, 10); // Visor
            
            ctx.save();
            ctx.translate(o.width/2, o.height/3);
            const playerScreenCenter = { x: screenX + o.width/2, y: screenY + o.height/3 };
            const aimAngle = Math.atan2(mouseRef.current.y - playerScreenCenter.y, mouseRef.current.x - playerScreenCenter.x);
            let rotation = aimAngle;
            if (o.facing === -1) rotation = Math.PI - aimAngle; 
            
            ctx.rotate(rotation);
            ctx.fillStyle = weapons[selectedWeaponIdx].color;
            ctx.fillRect(0, -4, 30, 8); 
            ctx.restore();

        } else if (o.type === 'enemy_mech') {
            // ... Mech drawing (unchanged) ...
            const isBoss = o.width > 100;
            ctx.fillStyle = o.color;
            ctx.fillRect(5, o.height - 25, 20, 25);
            ctx.fillRect(o.width - 25, o.height - 25, 20, 25);
            ctx.fillRect(0, 0, o.width, o.height - 20);
            
            const v = o.variant || 0;
            if (v === 1) { 
                ctx.fillStyle = '#9d174d';
                ctx.fillRect(0, 20, o.width, 10);
                ctx.fillRect(10, 10, o.width-20, o.height-50);
            } else if (v === 2) { 
                ctx.fillStyle = '#1e40af';
                ctx.fillRect(-5, 0, 15, 30);
                ctx.fillRect(o.width-10, 0, 15, 30);
            }
            ctx.fillStyle = isBoss ? '#facc15' : '#a855f7';
            ctx.fillRect(o.width/2 - 15, 10, 30, 20);
            ctx.fillStyle = '#334155';
            ctx.fillRect(-10, o.height/2 - 5, 20, 10);

        } else if (o.type === 'enemy_ground') {
            // ... Soldier drawing (unchanged) ...
             ctx.fillStyle = o.color;
            const v = o.variant || 0;
            if (v === 0) {
                ctx.fillRect(5, 10, o.width-10, o.height-10);
                ctx.fillStyle = '#c2410c';
                ctx.fillRect(5, 0, o.width-10, 12);
                ctx.fillStyle = '#000'; ctx.fillRect(5, 4, 10, 4);
                ctx.fillStyle = '#1f2937'; ctx.fillRect(-5, 20, 15, 6);
            } else if (v === 1) {
                ctx.fillRect(0, 10, o.width, o.height-10);
                ctx.fillStyle = '#065f46'; ctx.fillRect(0, 25, o.width, 10);
                ctx.fillStyle = '#047857'; ctx.fillRect(0, 0, o.width, 14);
                ctx.fillStyle = '#facc15'; ctx.fillRect(2, 4, 12, 5);
                ctx.fillStyle = '#000'; ctx.fillRect(-10, 22, 20, 5);
            } else {
                ctx.fillRect(2, 5, o.width-4, o.height-5);
                ctx.fillStyle = '#334155'; ctx.fillRect(-2, 8, 8, 15);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(2, -2, o.width-4, 15);
                ctx.fillStyle = '#ef4444'; ctx.fillRect(2, 3, 6, 2); ctx.fillRect(10, 3, 6, 2);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(-8, 20, 18, 8);
            }

        } else if (o.type === 'enemy_air') {
             // ... Air drawing (unchanged) ...
             const v = o.variant || 0;
             ctx.fillStyle = o.color;
             if (v === 0) {
                 ctx.beginPath();
                 ctx.moveTo(-5, o.height/2); ctx.lineTo(o.width, 0); ctx.lineTo(o.width, o.height);
                 ctx.fill();
                 ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(o.width, o.height/2, 4, 0, Math.PI*2); ctx.fill();
             } else if (v === 1) {
                 ctx.beginPath();
                 ctx.moveTo(0, o.height/2); ctx.lineTo(o.width/2, 0); ctx.lineTo(o.width, o.height/2); ctx.lineTo(o.width/2, o.height);
                 ctx.fill();
                 ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(o.width/2, o.height/2, 6, 0, Math.PI*2); ctx.fill();
                 ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(o.width/2, o.height/2, 3, 0, Math.PI*2); ctx.fill();
             } else {
                 ctx.beginPath();
                 ctx.moveTo(0, o.height/2); ctx.lineTo(10, 0); ctx.lineTo(o.width-10, 0); ctx.lineTo(o.width, o.height/2); ctx.lineTo(o.width-10, o.height); ctx.lineTo(10, o.height);
                 ctx.fill();
                 ctx.fillStyle = '#a855f7'; ctx.fillRect(10, o.height-5, o.width-20, 5);
             }

        } else if (o.type === 'enemy_jumper') {
            // JUMPER (Cricket/Frog)
            ctx.fillStyle = o.color;
            // Body
            ctx.beginPath();
            ctx.ellipse(o.width/2, o.height/2, o.width/2, o.height/3, 0, 0, Math.PI*2);
            ctx.fill();
            // Legs
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 4;
            ctx.beginPath();
            if (!o.grounded) {
                // Extended legs
                ctx.moveTo(5, o.height/2); ctx.lineTo(0, o.height);
                ctx.moveTo(o.width-5, o.height/2); ctx.lineTo(o.width, o.height);
            } else {
                // Folded legs
                ctx.moveTo(5, o.height/2); ctx.lineTo(-5, o.height/2 + 10); ctx.lineTo(5, o.height);
                ctx.moveTo(o.width-5, o.height/2); ctx.lineTo(o.width+5, o.height/2 + 10); ctx.lineTo(o.width-5, o.height);
            }
            ctx.stroke();
            // Eyes
            ctx.fillStyle = '#ef4444';
            ctx.beginPath(); ctx.arc(o.width-5, 5, 3, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'enemy_seeker') {
            // SEEKER (Ghost/Spike)
            ctx.fillStyle = o.color;
            // Pulsing core effect
            const pulse = 2 + Math.sin(frameCountRef.current * 0.2) * 2;
            
            ctx.beginPath();
            ctx.moveTo(0, o.height/2);
            ctx.lineTo(o.width/2, 0 - pulse);
            ctx.lineTo(o.width, o.height/2);
            ctx.lineTo(o.width/2, o.height + pulse);
            ctx.fill();

            // Inner Core
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(o.width/2, o.height/2, 5, 0, Math.PI*2); ctx.fill();
            
        } else if (o.type === 'enemy_dasher') {
            // DASHER (Blitz Bot)
            ctx.fillStyle = o.color;
            // Low profile body
            ctx.beginPath();
            ctx.moveTo(0, o.height);
            ctx.lineTo(10, 0);
            ctx.lineTo(o.width, 10);
            ctx.lineTo(o.width-5, o.height);
            ctx.fill();
            
            // Spikes
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(o.width, 15); ctx.lineTo(o.width + 10, 15); ctx.lineTo(o.width, 25);
            ctx.fill();

            // Wheel?
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.arc(o.width/2, o.height, 8, 0, Math.PI*2); ctx.fill();

        } else if (o.type === 'explosion') {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = o.color;
            ctx.beginPath();
            ctx.arc(o.width/2, o.height/2, o.width/2 * Math.random(), 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1;
        } else if (o.type === 'bullet') {
             ctx.fillStyle = o.color;
             if (o.isGrenade) {
                 ctx.beginPath(); ctx.arc(4,4,4,0,Math.PI*2); ctx.fill();
             } else if (o.isRocket) {
                 ctx.fillRect(0, 0, o.width, o.height);
                 ctx.fillStyle = '#fbbf24'; ctx.fillRect(-5, 2, 5, 2); 
             } else {
                 ctx.fillRect(0, 0, o.width, o.height);
             }
        } else if (o.type === 'crate') {
            ctx.fillStyle = '#475569';
            ctx.fillRect(0, 0, o.width, o.height);
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            for(let i=0; i < o.width; i+=20) {
                ctx.moveTo(i, 0); ctx.lineTo(i+10, 0); ctx.lineTo(i-10, o.height); ctx.lineTo(i-20, o.height);
            }
            ctx.fill();
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
            ctx.strokeRect(0,0,o.width,o.height);
        } else {
            ctx.fillStyle = o.color;
            ctx.fillRect(0, 0, o.width, o.height);
        }
        ctx.restore();
    };

    [...objectsRef.current, playerRef.current].forEach(o => {
        if (o.x + o.width < cameraRef.current || o.x > cameraRef.current + canvas.width) return;
        drawObj(o);
    });

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouseRef.current.x, mouseRef.current.y, 10, 0, Math.PI * 2);
    ctx.moveTo(mouseRef.current.x - 15, mouseRef.current.y);
    ctx.lineTo(mouseRef.current.x + 15, mouseRef.current.y);
    ctx.moveTo(mouseRef.current.x, mouseRef.current.y - 15);
    ctx.lineTo(mouseRef.current.x, mouseRef.current.y + 15);
    ctx.stroke();

    requestRef.current = requestAnimationFrame(loop);
  }, [gameState, selectedWeaponIdx, weapons]); // Dependencies

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        keysRef.current[e.key] = true;
        
        if (e.key === 'j') {
            autoFireRef.current = !autoFireRef.current;
            setAutoFire(autoFireRef.current);
            AudioService.switch();
        }
        
        if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') && gameState === 'playing') {
             const player = playerRef.current;
             if (player.grounded) {
                 player.vy = JUMP_FORCE;
                 player.grounded = false;
                 player.jumps = 1;
                 AudioService.jump();
             } else if (player.jumps < 2) {
                 player.vy = DOUBLE_JUMP_FORCE;
                 player.jumps = 2;
                 AudioService.jump();
             }
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    const handleMouseDown = () => keysRef.current['click'] = true;
    const handleMouseUp = () => keysRef.current['click'] = false;
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loop, gameState]);

  const progress = (stats.distanceTraveled % STAGE_LENGTH) / STAGE_LENGTH * 100;
  const currentWeapon = weapons[selectedWeaponIdx];

  const getWeaponIcon = (id: WeaponType, color: string) => {
      switch(id) {
          case 'pistol': return <Target size={20} color={color} />;
          case 'machinegun': return <Zap size={20} color={color} />;
          case 'sniper': return <Crosshair size={20} color={color} />;
          case 'shotgun': return <Shield size={20} color={color} />;
          case 'grenade': return <Bomb size={20} color={color} />;
          case 'rocket': return <Flame size={20} color={color} />;
          case 'quantum': return <Atom size={20} color={color} />;
          default: return <Target size={20} color={color} />;
      }
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-900 overflow-hidden cursor-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* --- UI OVERLAYS --- */}

      {showLevelUp && (
          <div className="absolute top-1/4 left-0 w-full text-center pointer-events-none animate-in zoom-in duration-300">
              <h1 className="text-6xl font-black text-yellow-400 arcade-font drop-shadow-lg tracking-widest stroke-black">
                  STAGE {stats.currentStage}
              </h1>
              <p className="text-xl text-white font-mono uppercase mt-2">Zone Danger Level Increasing</p>
          </div>
      )}
      
      {bossWarning && (
           <div className="absolute top-1/3 left-0 w-full text-center pointer-events-none animate-pulse">
              <h1 className="text-8xl font-black text-red-600 arcade-font drop-shadow-[0_0_20px_rgba(220,38,38,0.8)] tracking-tighter">
                  WARNING
              </h1>
          </div>
      )}

      {/* Top Left HUD */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none select-none z-10">
        <div className="flex flex-col gap-2">
            <div className="bg-slate-900/80 p-3 rounded-br-2xl border-l-4 border-cyan-500 backdrop-blur-sm max-w-md">
                <p className="text-xs uppercase tracking-widest text-cyan-400 mb-1">Objective</p>
                <p className="text-sm font-semibold text-slate-100 leading-snug">{missionBriefing}</p>
            </div>
            <div className="bg-black/40 text-white px-3 py-1 rounded inline-block font-mono text-sm border border-slate-700 min-w-[200px]">
                <div className="flex justify-between mb-1">
                    <span>STAGE {stats.currentStage}</span>
                    <span>{stats.distanceTraveled}m</span>
                </div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
            <div className="flex gap-1 mt-1">
                 {[...Array(maxHp)].map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-8 h-3 -skew-x-12 border border-slate-900 ${
                            i < playerRef.current.hp ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-slate-700'
                        }`} 
                    />
                ))}
            </div>
        </div>
      </div>
      
      {/* Auto Fire Indicator - Bottom Left area */}
      <div className="absolute bottom-8 left-20 pointer-events-none">
          <div className={`
              flex items-center gap-2 px-3 py-1 rounded font-mono text-sm border-l-4
              ${autoFire ? 'bg-green-900/80 text-green-400 border-green-500' : 'bg-slate-900/60 text-slate-500 border-slate-600'}
          `}>
              <Cpu size={16} />
              <span className="font-bold tracking-wider">AUTO-FIRE [J]: {autoFire ? 'ON' : 'OFF'}</span>
          </div>
      </div>

      {/* Top Right: Weapon Hotbar & Settings */}
      <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto z-20">
        {Object.keys(weapons).map((keyStr) => {
            const num = parseInt(keyStr);
            const w = weapons[num];
            const isSelected = selectedWeaponIdx === num;
            return (
                <div key={num} className="relative group">
                    <button
                        onClick={() => { 
                             if (isSelected) {
                                 setEditingWeapon(num);
                                 setGameState('paused');
                             } else {
                                 switchWeapon(num); 
                             }
                        }}
                        className={`
                            w-14 h-14 rounded-lg flex flex-col items-center justify-center relative transition-all border-2
                            ${isSelected ? 'bg-slate-800 border-cyan-400 shadow-lg scale-110 z-10' : 'bg-slate-900/80 border-slate-700 hover:bg-slate-800 opacity-80'}
                        `}
                    >
                        <span className="absolute top-0 left-1 text-[10px] text-slate-500 font-mono">{num}</span>
                        {getWeaponIcon(w.id, w.color)}
                        <span className="text-[9px] uppercase mt-1 font-bold text-slate-300 tracking-tighter">{w.name.split(' ')[0]}</span>
                    </button>
                    {isSelected && (
                         <div className="absolute -bottom-2 -right-2 bg-slate-700 rounded-full p-1 border border-slate-500">
                             <Settings size={10} className="text-white" />
                         </div>
                    )}
                </div>
            )
        })}
      </div>

      {/* Score */}
      <div className="absolute bottom-8 right-8 pointer-events-none">
          <div className="text-6xl font-bold arcade-font text-white/10 tracking-widest text-right">
                {stats.score.toString().padStart(6, '0')}
          </div>
      </div>

      {/* WEAPON CONFIG MODAL */}
      {editingWeapon !== null && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-default">
              <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-96 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-white flex items-center gap-2">
                          <Settings size={20} className="text-cyan-400" />
                          Config: {weapons[editingWeapon].name}
                      </h2>
                      <button onClick={() => { setEditingWeapon(null); setGameState('playing'); }} className="text-slate-500 hover:text-white">Close</button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs uppercase text-slate-500 font-bold">Fire Rate (Cooldown: {weapons[editingWeapon].cooldown}ms)</label>
                          <input 
                              type="range" min="20" max="2000" step="10"
                              value={weapons[editingWeapon].cooldown}
                              onChange={(e) => handleUpdateWeapon(e, 'cooldown')}
                              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          />
                      </div>
                      <div>
                          <label className="text-xs uppercase text-slate-500 font-bold">Damage ({weapons[editingWeapon].damage})</label>
                          <input 
                              type="range" min="1" max="1000" step="1"
                              value={weapons[editingWeapon].damage}
                              onChange={(e) => handleUpdateWeapon(e, 'damage')}
                              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                          />
                      </div>
                      <div>
                          <label className="text-xs uppercase text-slate-500 font-bold">Projectile Speed ({weapons[editingWeapon].speed})</label>
                          <input 
                              type="range" min="1" max="40" step="1"
                              value={weapons[editingWeapon].speed}
                              onChange={(e) => handleUpdateWeapon(e, 'speed')}
                              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                          />
                      </div>
                      <div>
                          <label className="text-xs uppercase text-slate-500 font-bold">Projectiles / Shot ({weapons[editingWeapon].projectileCount || 1})</label>
                          <input 
                              type="range" min="1" max="20" step="1"
                              value={weapons[editingWeapon].projectileCount || 1}
                              onChange={(e) => handleUpdateWeapon(e, 'projectileCount')}
                              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                          />
                      </div>
                      {(weapons[editingWeapon].id === 'grenade' || weapons[editingWeapon].id === 'rocket' || weapons[editingWeapon].id === 'quantum') && (
                          <div>
                            <label className="text-xs uppercase text-slate-500 font-bold">Explosion Radius ({weapons[editingWeapon].explosionRadius || 100}px)</label>
                            <input 
                                type="range" min="50" max="1000" step="10"
                                value={weapons[editingWeapon].explosionRadius || 100}
                                onChange={(e) => handleUpdateWeapon(e, 'explosionRadius')}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                            />
                          </div>
                      )}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800 text-center">
                      <p className="text-xs text-slate-500">Changes apply immediately</p>
                  </div>
              </div>
          </div>
      )}

      {/* Game Over */}
      {gameState === 'gameover' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm z-50 cursor-auto">
          <div className="text-center p-8 max-w-md w-full animate-in zoom-in duration-300">
            <h2 className="text-6xl font-black text-red-600 mb-2 arcade-font tracking-tighter skew-x-[-10deg]">MIA</h2>
            <p className="text-xl text-slate-300 mb-8 font-bold uppercase tracking-widest">Mission Failed</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                <div className="bg-slate-800 p-4 rounded border-l-4 border-slate-600">
                    <p className="text-xs text-slate-500 uppercase">Stage Reached</p>
                    <p className="text-2xl font-bold text-white">{stats.currentStage}</p>
                </div>
                 <div className="bg-slate-800 p-4 rounded border-l-4 border-slate-600">
                    <p className="text-xs text-slate-500 uppercase">Kills</p>
                    <p className="text-2xl font-bold text-white">{stats.enemiesDefeated}</p>
                </div>
            </div>

            <div className="space-y-3">
                <button 
                    onClick={resetGame}
                    className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 group clip-path-polygon"
                >
                    <RefreshCw className="group-hover:rotate-180 transition-transform duration-500" />
                    Respawn
                </button>
                <button 
                    onClick={onExit}
                    className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2"
                >
                    <ArrowLeft size={20} />
                    Abort Mission
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Button */}
       <button 
          onClick={onExit}
          className="absolute bottom-4 left-4 p-3 bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-white rounded-full transition-all pointer-events-auto z-40 border-2 border-slate-700 hover:border-red-500"
          title="Abort"
        >
          <ArrowLeft size={20} />
      </button>
    </div>
  );
};

export default RunAndGunGame;
