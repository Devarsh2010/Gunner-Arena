import * as THREE from "three";
import { InputManager } from "./InputManager";
import { Player } from "./Player";
import { Map as GameMap } from "./Map";
import { EnemyManager } from "./EnemyManager";
import { BulletTracer } from "./BulletTracer";
import { HUD } from "./HUD";
import { NetworkManager } from "./NetworkManager";
import { RemotePlayer } from "./RemotePlayer";
import type { RemotePlayerState } from "./NetworkManager";

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock: THREE.Clock;
  private input: InputManager;
  player: Player;
  private gameMap: GameMap;
  private enemyManager: EnemyManager;
  private bulletTracer: BulletTracer;
  private hud: HUD;
  private running = false;
  private animFrameId = 0;
  private canvas: HTMLCanvasElement;

  // Multiplayer
  private net: NetworkManager | null = null;
  private isMultiplayer = false;
  private remotePlayers: globalThis.Map<string, RemotePlayer> = new globalThis.Map();

  // UI event hooks — set by Game.tsx before connectMultiplayer
  onNetPlayerJoined:    ((p: RemotePlayerState) => void) | null = null;
  onNetPlayerLeft:      ((id: string) => void) | null = null;
  onNetPlayerState:     ((s: RemotePlayerState) => void) | null = null;
  onNetChat:            ((id: string, name: string, text: string) => void) | null = null;
  onNetKillFeed:        ((killerName: string, victimName: string) => void) | null = null;
  onLocalPlayerDied:    (() => void) | null = null;
  onLocalPlayerRespawned: (() => void) | null = null;

  private localDiedFired = false;

  constructor(canvas: HTMLCanvasElement, hud: HUD) {
    this.canvas = canvas;
    this.hud = hud;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

    this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 500);

    this.clock = new THREE.Clock();
    this.input = new InputManager(canvas);
    this.gameMap = new GameMap(this.scene);
    this.player = new Player(this.camera, this.input, this.gameMap);
    this.bulletTracer = new BulletTracer(this.scene);
    this.enemyManager = new EnemyManager(this.scene, this.player, this.gameMap);
    this.enemyManager.setTracer(this.bulletTracer);
    this.hud.setPlayer(this.player);
    this.hud.setEnemyManager(this.enemyManager);

    this.setupLighting();
    this.gameMap.build();
    this.player.init();

    window.addEventListener("resize", this.onResize);
  }

  connectMultiplayer(
    net: NetworkManager,
    spawnX = 0, spawnY = 1.75, spawnZ = 10, spawnYaw = 0,
  ) {
    this.net = net;
    this.isMultiplayer = true;

    // Apply server-assigned spawn position
    this.player.position.set(spawnX, spawnY, spawnZ);
    this.player.yaw = spawnYaw;

    net.onPlayerJoined = (state: RemotePlayerState) => {
      if (!this.remotePlayers.has(state.id)) {
        this.remotePlayers.set(state.id, new RemotePlayer(this.scene, state));
      }
      this.onNetPlayerJoined?.(state);
    };

    net.onPlayerLeft = (id: string) => {
      const rp = this.remotePlayers.get(id);
      if (rp) { rp.dispose(); this.remotePlayers.delete(id); }
      this.onNetPlayerLeft?.(id);
    };

    net.onPlayerState = (state: RemotePlayerState) => {
      let rp = this.remotePlayers.get(state.id);
      if (!rp) {
        // Late-join guard
        rp = new RemotePlayer(this.scene, state);
        this.remotePlayers.set(state.id, rp);
        this.onNetPlayerJoined?.(state);
      }
      rp.state = state;
      this.onNetPlayerState?.(state);
    };

    net.onChat = (id, name, text) => this.onNetChat?.(id, name, text);

    // Hit confirmed by server — trigger hit marker
    net.onHitConfirm = (_targetId, _targetName, _amount, _killed) => {
      this.hud.triggerHitMarker();
    };

    // Kill feed from server
    net.onKillFeed = (killerName, victimName) => {
      this.onNetKillFeed?.(killerName, victimName);
    };

    // Receive incoming damage
    net.onDamage = (amount: number, _fromId: string) => {
      if (this.player.isDead()) return;
      this.player.takeDamage(amount);
      this.hud.triggerDamage();
      if (this.player.isDead() && !this.localDiedFired) {
        this.localDiedFired = true;
        this.onLocalPlayerDied?.();
      }
    };

    // Receive respawn ack
    net.onRespawnAck = (x: number, y: number, z: number) => {
      this.player.health = 100;
      this.player.position.set(x, y, z);
      this.localDiedFired = false;
      this.onLocalPlayerRespawned?.();
    };

    // Send our position/state at 20 Hz
    net.startSending(() => {
      const vx = this.player.velocity.x;
      const vz = this.player.velocity.z;
      const speed = Math.sqrt(vx * vx + vz * vz);
      return {
        x:        this.player.position.x,
        y:        this.player.position.y,
        z:        this.player.position.z,
        yaw:      this.player.yaw,
        pitch:    this.player.pitch,
        health:   this.player.health,
        dead:     this.player.isDead(),
        shooting: this.player.firedThisFrame,
        crouching: this.player.crouching,
        moving:   speed > 0.5,
        sprinting: speed > 12,
      };
    });
  }

  respawnPlayer() {
    this.net?.sendRespawn();
  }

  // Check if a wall blocks the line of sight between two world points
  isWallBlocking(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return false;
    dir.normalize();
    const ray = new THREE.Raycaster(from, dir, 0, dist - 0.1);
    const wallMeshes = this.gameMap.walls.map((w) => w.mesh);
    const hits = ray.intersectObjects(wallMeshes, false);
    return hits.length > 0;
  }

  private checkPvPHits() {
    if (!this.player.firedThisFrame || !this.net) return;

    const ray = this.player.getShootRay();
    const origin = this.player.camera.position.clone();

    // Find the closest target hit (not blocked by walls)
    let closest: { id: string; point: THREE.Vector3; dist: number } | null = null;
    for (const [id, rp] of this.remotePlayers) {
      if (rp.state.dead) continue;
      const box = rp.getBoundingBox();
      const target = new THREE.Vector3(rp.state.x, rp.state.y + 0.9, rp.state.z);

      if (ray.ray.intersectsBox(box)) {
        const dist = origin.distanceTo(target);
        if (!closest || dist < closest.dist) {
          // Check wall blocking
          if (!this.isWallBlocking(origin, target)) {
            closest = { id, point: target, dist };
          }
        }
      }
    }

    if (closest) {
      // Damage scales with distance: 25 base, -0.5 per unit past 10, min 10
      const dmg = Math.max(10, Math.round(25 - Math.max(0, closest.dist - 10) * 0.5));
      this.net.sendHit(closest.id, dmg);

      // Bullet tracer from muzzle to hit point
      const muzzle = this.player.getMuzzleWorldPosition();
      this.bulletTracer.spawn(muzzle, closest.point);
    } else {
      // Tracer into the void (missed shot)
      const muzzle = this.player.getMuzzleWorldPosition();
      const end = ray.ray.origin.clone().addScaledVector(ray.ray.direction, 80);
      this.bulletTracer.spawn(muzzle, end);
    }
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd9a0, 1.2);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8ac4ff, 0.3);
    fill.position.set(-30, 20, -20);
    this.scene.add(fill);
  }

  start() {
    if (!this.isMultiplayer) {
      this.enemyManager.spawn();
    }
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animFrameId);
    this.input.dispose();
    this.bulletTracer.dispose();
    this.net?.disconnect();
    for (const rp of this.remotePlayers.values()) rp.dispose();
    this.remotePlayers.clear();
    window.removeEventListener("resize", this.onResize);
    this.renderer.dispose();
  }

  private loop = () => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.render();
  };

  private update(dt: number) {
    if (!this.player.isDead()) {
      this.player.update(dt);
    }

    if (!this.isMultiplayer) {
      this.enemyManager.update(dt);
    } else {
      this.checkPvPHits();
      if (!this.localDiedFired && this.player.isDead()) {
        this.localDiedFired = true;
        this.onLocalPlayerDied?.();
      }
    }

    this.bulletTracer.update(dt);

    for (const rp of this.remotePlayers.values()) {
      rp.update(dt, rp.state);
    }

    this.hud.update(this.isMultiplayer);
  }

  private render() {
    const gunCam = this.player.getGunCamera();
    const gunScene = this.player.getGunScene();

    gunCam.position.copy(this.camera.position);
    gunCam.quaternion.copy(this.camera.quaternion);
    gunCam.fov = this.camera.fov;
    gunCam.aspect = this.camera.aspect;
    gunCam.updateProjectionMatrix();

    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(gunScene, gunCam);
  }

  private onResize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}
