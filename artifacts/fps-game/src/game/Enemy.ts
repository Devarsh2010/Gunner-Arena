import * as THREE from "three";

export type EnemyState = "patrol" | "chase" | "attack" | "dead";

export class Enemy {
  mesh: THREE.Group;
  health = 100;
  maxHealth = 100;
  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  state: EnemyState = "patrol";
  private patrolTarget: THREE.Vector3;
  private patrolPoints: THREE.Vector3[];
  private patrolIndex = 0;
  private attackCooldown = 0;
  private attackRate = 1.5;
  private stateTimer = 0;
  private alertness = 0;
  id: number;
  private static nextId = 0;
  private headMesh: THREE.Mesh;
  private bodyMesh: THREE.Mesh;
  private healthBar: THREE.Mesh;
  private healthBarBg: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private walkTime = 0;
  private deathTimer = 0;
  private DETECTION_RANGE = 25;
  private ATTACK_RANGE = 20;
  private MELEE_RANGE = 2.5;

  constructor(spawnPos: THREE.Vector3, patrolPoints: THREE.Vector3[]) {
    this.id = Enemy.nextId++;
    this.position = spawnPos.clone();
    this.patrolPoints = patrolPoints;
    this.patrolTarget = patrolPoints[0]?.clone() ?? spawnPos.clone();

    this.mesh = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1a, roughness: 0.8 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.bodyMesh.position.y = 0.45;
    this.bodyMesh.castShadow = true;

    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.9 });
    this.headMesh = new THREE.Mesh(headGeo, headMat);
    this.headMesh.position.y = 1.15;
    this.headMesh.castShadow = true;

    const helmetGeo = new THREE.BoxGeometry(0.52, 0.3, 0.52);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0x4a4a2a, roughness: 0.7, metalness: 0.3 });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.3;
    helmet.castShadow = true;

    const legGeo = new THREE.BoxGeometry(0.28, 0.65, 0.28);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a1a, roughness: 0.9 });
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.17, -0.33, 0);
    this.legL.castShadow = true;
    this.legR = new THREE.Mesh(legGeo, legMat);
    this.legR.position.set(0.17, -0.33, 0);
    this.legR.castShadow = true;
    this.bodyMesh.add(this.legL, this.legR);

    const armGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1a, roughness: 0.8 });
    this.armL = new THREE.Mesh(armGeo, armMat);
    this.armL.position.set(-0.46, 0, 0);
    this.armL.castShadow = true;
    this.armR = new THREE.Mesh(armGeo, armMat);
    this.armR.position.set(0.46, 0, 0);
    this.armR.castShadow = true;
    this.bodyMesh.add(this.armL, this.armR);

    const gunGeo = new THREE.BoxGeometry(0.07, 0.07, 0.4);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.8 });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0, -0.2, -0.25);
    this.armR.add(gun);

    const hpBgGeo = new THREE.PlaneGeometry(0.7, 0.08);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x440000, depthTest: false, transparent: true, opacity: 0.8 });
    this.healthBarBg = new THREE.Mesh(hpBgGeo, hpBgMat);
    this.healthBarBg.position.y = 1.7;
    this.healthBarBg.renderOrder = 1;

    const hpGeo = new THREE.PlaneGeometry(0.7, 0.08);
    const hpMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, depthTest: false, transparent: true, opacity: 0.9 });
    this.healthBar = new THREE.Mesh(hpGeo, hpMat);
    this.healthBar.position.y = 1.7;
    this.healthBar.renderOrder = 2;

    this.mesh.add(this.bodyMesh, this.headMesh, helmet, this.healthBarBg, this.healthBar);
    this.mesh.position.copy(this.position);
  }

  update(dt: number, playerPos: THREE.Vector3, playerVisible: boolean) {
    if (this.state === "dead") {
      this.deathTimer += dt;
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stateTimer += dt;

    const distToPlayer = this.position.distanceTo(playerPos);

    if (playerVisible && distToPlayer < this.DETECTION_RANGE) {
      this.alertness = Math.min(1, this.alertness + dt * 2);
    } else {
      this.alertness = Math.max(0, this.alertness - dt * 0.5);
    }

    if (this.alertness > 0.5 && distToPlayer < this.DETECTION_RANGE) {
      if (distToPlayer < this.ATTACK_RANGE) {
        this.state = "attack";
      } else {
        this.state = "chase";
      }
    } else if (this.alertness < 0.2) {
      this.state = "patrol";
    }

    switch (this.state) {
      case "patrol":
        this.doPatrol(dt);
        break;
      case "chase":
        this.doChase(dt, playerPos);
        break;
      case "attack":
        this.doAttack(dt, playerPos);
        break;
    }

    this.mesh.position.copy(this.position);

    const hpRatio = this.health / this.maxHealth;
    this.healthBar.scale.x = hpRatio;
    this.healthBar.position.x = -(1 - hpRatio) * 0.35;

    this.healthBarBg.lookAt(playerPos);
    this.healthBar.lookAt(playerPos);
  }

  private doPatrol(dt: number) {
    const dist = this.position.distanceTo(this.patrolTarget);
    if (dist < 1.5) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
      this.patrolTarget.copy(this.patrolPoints[this.patrolIndex]);
    }
    const dir = new THREE.Vector3().subVectors(this.patrolTarget, this.position).setY(0).normalize();
    this.velocity.x = dir.x * 2.5;
    this.velocity.z = dir.z * 2.5;
    this.walkTime += dt * 3;
    this.animateWalk(dt);
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
  }

  private doChase(dt: number, playerPos: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(playerPos, this.position).setY(0).normalize();
    this.velocity.x = dir.x * 5;
    this.velocity.z = dir.z * 5;
    this.walkTime += dt * 8;
    this.animateWalk(dt);
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
  }

  private doAttack(dt: number, playerPos: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(playerPos, this.position).setY(0).normalize();
    const dist = this.position.distanceTo(playerPos);

    if (dist > this.ATTACK_RANGE * 0.6) {
      this.velocity.x = dir.x * 3;
      this.velocity.z = dir.z * 3;
      this.walkTime += dt * 5;
      this.animateWalk(dt);
    } else {
      this.velocity.set(0, 0, 0);
    }
    const angle = Math.atan2(dir.x, dir.z);
    this.mesh.rotation.y = angle;
  }

  canAttack(): boolean {
    return this.state === "attack" && this.attackCooldown <= 0;
  }

  resetAttackCooldown() {
    this.attackCooldown = this.attackRate;
  }

  getAttackRay(): THREE.Ray {
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.mesh.rotation);
    return new THREE.Ray(this.position.clone().setY(1.2), dir);
  }

  private animateWalk(dt: number) {
    const swing = Math.sin(this.walkTime) * 0.4;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.5;
    this.armR.rotation.x = swing * 0.5;
    this.bodyMesh.position.y = 0.45 + Math.abs(Math.sin(this.walkTime * 2)) * 0.02;
  }

  takeDamage(amount: number): boolean {
    if (this.state === "dead") return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
      return true;
    }
    this.state = "chase";
    this.alertness = 1;
    return false;
  }

  private die() {
    this.state = "dead";
    this.velocity.set(0, 0, 0);
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = -0.5;
    this.healthBarBg.visible = false;
    this.healthBar.visible = false;
  }

  isDeadAndGone(): boolean {
    return this.state === "dead" && this.deathTimer > 5;
  }

  getHitBox(): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(this.position.x - 0.4, this.position.y, this.position.z - 0.4),
      new THREE.Vector3(this.position.x + 0.4, this.position.y + 1.8, this.position.z + 0.4)
    );
  }

  getHeadHitBox(): THREE.Box3 {
    return new THREE.Box3(
      new THREE.Vector3(this.position.x - 0.25, this.position.y + 0.9, this.position.z - 0.25),
      new THREE.Vector3(this.position.x + 0.25, this.position.y + 1.4, this.position.z + 0.25)
    );
  }
}
