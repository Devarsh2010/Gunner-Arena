import * as THREE from "three";
import { Enemy } from "./Enemy";
import type { Player } from "./Player";
import type { Map } from "./Map";
import { BulletTracer } from "./BulletTracer";

export class EnemyManager {
  enemies: Enemy[] = [];
  private scene: THREE.Scene;
  private player: Player;
  private map: Map;
  private tracer: BulletTracer | null = null;
  private totalKills = 0;
  private wave = 1;
  private waveTimer = 0;
  private waveDelay = 30;
  private waveEnemies = 6;

  constructor(scene: THREE.Scene, player: Player, map: Map) {
    this.scene = scene;
    this.player = player;
    this.map = map;
  }

  setTracer(tracer: BulletTracer) {
    this.tracer = tracer;
  }

  spawn() {
    const spawnPoints = this.map.getSpawnPoints();
    const count = this.waveEnemies;
    for (let i = 0; i < count; i++) {
      const sp = spawnPoints[i % spawnPoints.length];
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        0,
        (Math.random() - 0.5) * 4
      );
      const pos = sp.clone().add(offset);
      pos.y = 1;

      const patrol = this.generatePatrolPoints(pos);
      const enemy = new Enemy(pos, patrol);
      this.enemies.push(enemy);
      this.scene.add(enemy.mesh);
    }
  }

  private generatePatrolPoints(base: THREE.Vector3): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 5 + Math.random() * 8;
      points.push(new THREE.Vector3(
        base.x + Math.cos(angle) * r,
        1,
        base.z + Math.sin(angle) * r
      ));
    }
    return points;
  }

  update(dt: number) {
    const playerPos = this.player.position.clone();
    const aliveEnemies: Enemy[] = [];

    for (const enemy of this.enemies) {
      if (enemy.isDeadAndGone()) {
        this.scene.remove(enemy.mesh);
        continue;
      }

      const canSeePlayer = this.hasLineOfSight(enemy.position, playerPos);
      enemy.position.x += enemy.velocity.x * dt;
      enemy.position.z += enemy.velocity.z * dt;
      enemy.update(dt, playerPos, canSeePlayer);

      if (enemy.canAttack() && canSeePlayer) {
        const dist = enemy.position.distanceTo(playerPos);
        if (dist < 20) {
          this.enemyShoot(enemy, playerPos);
        }
      }

      aliveEnemies.push(enemy);
    }

    this.enemies = aliveEnemies;

    this.waveTimer += dt;
    const livingEnemies = this.enemies.filter(e => e.state !== "dead");
    if (livingEnemies.length === 0 && this.waveTimer > this.waveDelay) {
      this.waveTimer = 0;
      this.wave++;
      this.waveEnemies = 6 + this.wave * 2;
      this.spawn();
    }

    if (this.player.firedThisFrame) {
      this.processPlayerShot();
    }

    if (this.tracer) this.tracer.update(dt);
  }

  private processPlayerShot() {
    const ray = this.player.getShootRay();
    const muzzlePos = this.player.getMuzzleWorldPosition();
    const maxRange = 200;

    let closestDist = Infinity;
    let hitEnemy: Enemy | null = null;
    let headShot = false;
    let hitPoint: THREE.Vector3 | null = null;

    for (const enemy of this.enemies) {
      if (enemy.state === "dead") continue;
      const box = enemy.getHitBox();
      const headBox = enemy.getHeadHitBox();

      const inter = ray.ray.intersectBox(box, new THREE.Vector3());
      if (inter) {
        const d = ray.ray.origin.distanceTo(inter);
        if (d < closestDist) {
          closestDist = d;
          hitEnemy = enemy;
          hitPoint = inter.clone();
          const headInter = ray.ray.intersectBox(headBox, new THREE.Vector3());
          headShot = !!headInter;
        }
      }
    }

    if (hitEnemy && hitPoint) {
      const damage = headShot ? 100 : 25 + Math.floor(Math.random() * 10);
      const killed = hitEnemy.takeDamage(damage);
      if (killed) {
        this.totalKills++;
        this.player.kills++;
      }
      this.spawnHitEffect(hitPoint, headShot);
      if (this.tracer) this.tracer.spawn(muzzlePos, hitPoint);
    } else {
      const endPoint = ray.ray.origin.clone().addScaledVector(ray.ray.direction, maxRange);
      if (this.tracer) this.tracer.spawn(muzzlePos, endPoint);
    }
  }

  private spawnHitEffect(pos: THREE.Vector3, headShot: boolean) {
    const color = headShot ? 0xff2222 : 0xff8800;
    const geo = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    let t = 0;
    const anim = () => {
      t += 0.016;
      mesh.scale.setScalar(1 - t * 3);
      if (t > 0.3) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      } else {
        requestAnimationFrame(anim);
      }
    };
    requestAnimationFrame(anim);
  }

  private enemyShoot(enemy: Enemy, playerPos: THREE.Vector3) {
    enemy.resetAttackCooldown();
    if (this.player.isDead()) return;

    const dist = enemy.position.distanceTo(playerPos);
    const accuracy = Math.max(0.1, 1 - dist / 25);
    if (Math.random() < accuracy * 0.3) {
      const baseDamage = 8;
      this.player.takeDamage(baseDamage);
    }
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    ray.set(from.clone().setY(1.2), dir);
    ray.far = from.distanceTo(to);

    const hits = ray.intersectObjects(this.map.getCollidableObjects(), false);
    return hits.length === 0;
  }

  getAliveCount(): number {
    return this.enemies.filter(e => e.state !== "dead").length;
  }

  getTotalKills(): number {
    return this.totalKills;
  }

  getWave(): number {
    return this.wave;
  }
}
