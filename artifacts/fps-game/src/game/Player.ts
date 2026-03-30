import * as THREE from "three";
import type { InputManager } from "./InputManager";
import type { Map } from "./Map";

const WALK_SPEED = 8;
const SPRINT_SPEED = 16;
const CROUCH_SPEED = 4;
const JUMP_FORCE = 12;
const GRAVITY = -32;
const SENSITIVITY = 0.0015;
const STAND_HEIGHT = 1.75;
const CROUCH_HEIGHT = 0.9;

export class Player {
  camera: THREE.PerspectiveCamera;
  position = new THREE.Vector3(0, STAND_HEIGHT, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  crouching = false;
  health = 100;
  maxHealth = 100;
  ammo = 30;
  maxAmmo = 30;
  totalAmmo = 90;
  kills = 0;
  private height = STAND_HEIGHT;
  shootCooldown = 0;
  reloading = false;
  firedThisFrame = false;
  private reloadTimer = 0;
  private reloadTime = 2.0;
  private bobTime = 0;
  private bobAmount = 0;
  private gunBobY = 0;
  private gunBobX = 0;
  private muzzleFlashTimer = 0;
  private input: InputManager;
  private map: Map;
  private jumpPressed = false;
  private crouchPressed = false;

  // Gun scene objects
  private gunGroup: THREE.Group;
  private gunScene: THREE.Scene;
  private gunCamera: THREE.PerspectiveCamera;
  muzzlePoint: THREE.Object3D;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashLight: THREE.PointLight;
  private gunTargetX = 0.18;
  private gunTargetZ = -0.45;
  private gunCurrentX = 0.18;
  private gunCurrentZ = -0.45;
  private recoilY = 0;
  private recoilZ = 0;

  constructor(camera: THREE.PerspectiveCamera, input: InputManager, map: Map) {
    this.camera = camera;
    this.input = input;
    this.map = map;

    // Dedicated gun scene so the gun always renders on top
    this.gunScene = new THREE.Scene();
    this.gunCamera = new THREE.PerspectiveCamera(65, camera.aspect, 0.01, 10);

    // Lighting for gun scene
    const gunAmbient = new THREE.AmbientLight(0xffffff, 0.6);
    this.gunScene.add(gunAmbient);
    const gunKey = new THREE.DirectionalLight(0xfff0d0, 1.2);
    gunKey.position.set(1, 2, -1);
    this.gunScene.add(gunKey);
    const gunFill = new THREE.DirectionalLight(0x88aaff, 0.4);
    gunFill.position.set(-1, 0, 1);
    this.gunScene.add(gunFill);

    this.muzzleFlashLight = new THREE.PointLight(0xffcc44, 0, 2);
    this.gunScene.add(this.muzzleFlashLight);

    // Attach gunCamera to scene, then attach gunGroup to gunCamera
    // so the gun is always rendered in camera-local (hand) space
    this.gunScene.add(this.gunCamera);
    this.gunGroup = new THREE.Group();
    this.gunCamera.add(this.gunGroup);

    this.muzzlePoint = new THREE.Object3D();
    this.muzzlePoint.position.set(0, 0.01, -0.62);
    this.gunGroup.add(this.muzzlePoint);

    this.buildGun();

    const flashGeo = new THREE.SphereGeometry(0.025, 8, 8);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffee66, transparent: true, opacity: 0 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.copy(this.muzzlePoint.position);
    this.gunGroup.add(this.muzzleFlashMesh);
  }

  private mk(color: number, rough = 0.3, metal = 0.9, emissive = 0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal,
      emissive: new THREE.Color(emissive), emissiveIntensity: 0.05
    });
  }

  private buildGun() {
    const steel = this.mk(0x1c1c1c, 0.3, 0.95);
    const dark = this.mk(0x111111, 0.5, 0.8);
    const mid = this.mk(0x2d2d2d, 0.4, 0.85);
    const gripTex = this.mk(0x1a1008, 0.95, 0.05);
    const tan = this.mk(0x8a7355, 0.8, 0.1);

    // === LOWER RECEIVER ===
    const lowerRec = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.20), mid);
    lowerRec.position.set(0, -0.012, 0.04);
    this.gunGroup.add(lowerRec);

    // === UPPER RECEIVER ===
    const upperRec = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.06, 0.24), steel);
    upperRec.position.set(0, 0.055, 0.02);
    this.gunGroup.add(upperRec);

    // charging handle notch
    const chargeGeo = new THREE.BoxGeometry(0.02, 0.025, 0.035);
    const charge = new THREE.Mesh(chargeGeo, mid);
    charge.position.set(0, 0.075, 0.0);
    this.gunGroup.add(charge);

    // === BARREL (long, goes forward/toward -Z) ===
    const barrelBody = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 10), steel);
    barrelBody.rotation.x = Math.PI / 2;
    barrelBody.position.set(0, 0.04, -0.30);
    this.gunGroup.add(barrelBody);

    // Gas tube above barrel
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.30, 8), dark);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.065, -0.18);
    this.gunGroup.add(gasTube);

    // === HANDGUARD (M-LOK style - octagonal tube) ===
    const hgOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.38, 8), dark);
    hgOuter.rotation.x = Math.PI / 2;
    hgOuter.position.set(0, 0.04, -0.15);
    this.gunGroup.add(hgOuter);

    // Handguard slots (visual grooves)
    for (let i = 0; i < 5; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.04), steel);
      slot.position.set(0.035, 0.04, -0.08 - i * 0.06);
      this.gunGroup.add(slot);
      const slot2 = slot.clone();
      slot2.position.x = -0.035;
      this.gunGroup.add(slot2);
    }

    // === MUZZLE DEVICE (flash hider) ===
    const muzzleGeo = new THREE.CylinderGeometry(0.016, 0.022, 0.06, 6);
    const muzzleDev = new THREE.Mesh(muzzleGeo, steel);
    muzzleDev.rotation.x = Math.PI / 2;
    muzzleDev.position.set(0, 0.04, -0.59);
    this.gunGroup.add(muzzleDev);

    // Muzzle slots
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.018, 0.01), dark);
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
      slot.position.set(Math.cos(angle) * 0.02, 0.04 + Math.sin(angle) * 0.02, -0.585);
      this.gunGroup.add(slot);
    }

    // === PISTOL GRIP ===
    const gripBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.07), gripTex);
    gripBody.position.set(0, -0.09, 0.08);
    gripBody.rotation.x = 0.25;
    this.gunGroup.add(gripBody);

    // Grip base
    const gripBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.065), gripTex);
    gripBase.position.set(0, -0.15, 0.075);
    gripBase.rotation.x = 0.25;
    this.gunGroup.add(gripBase);

    // === MAGAZINE ===
    const magBody = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.14, 0.063), dark);
    magBody.position.set(0, -0.115, 0.01);
    magBody.rotation.x = -0.08;
    this.gunGroup.add(magBody);

    // Magazine curve detail
    const magBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.01, 8), mid);
    magBottom.position.set(0, -0.185, 0.01);
    this.gunGroup.add(magBottom);

    // Mag ribs
    for (let i = 0; i < 4; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.004, 0.065), steel);
      rib.position.set(0, -0.08 - i * 0.022, 0.01);
      this.gunGroup.add(rib);
    }

    // === STOCK (collapsed M4 style) ===
    const stockTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 8), dark);
    stockTube.rotation.x = Math.PI / 2;
    stockTube.position.set(0, 0.01, 0.27);
    this.gunGroup.add(stockTube);

    const stockButt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.025), tan);
    stockButt.position.set(0, 0.01, 0.39);
    this.gunGroup.add(stockButt);

    const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.065, 0.10), dark);
    stockBody.position.set(0, 0.01, 0.29);
    this.gunGroup.add(stockBody);

    // Stock latch
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.04), steel);
    latch.position.set(0, -0.025, 0.29);
    this.gunGroup.add(latch);

    // === IRON SIGHTS ===
    const rearSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.018), mid);
    rearSightBase.position.set(0, 0.09, 0.06);
    this.gunGroup.add(rearSightBase);

    const rearSightL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.004), steel);
    rearSightL.position.set(-0.012, 0.103, 0.06);
    this.gunGroup.add(rearSightL);
    const rearSightR = rearSightL.clone();
    rearSightR.position.x = 0.012;
    this.gunGroup.add(rearSightR);

    const frontSightPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), steel);
    frontSightPost.position.set(0, 0.09, -0.32);
    this.gunGroup.add(frontSightPost);

    const frontSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.01, 0.025), dark);
    frontSightBase.position.set(0, 0.082, -0.32);
    this.gunGroup.add(frontSightBase);

    // === RIGHT HAND (shooting hand) ===
    const skinColor = 0xc68642;
    const skin = this.mk(skinColor, 0.9, 0.0);
    const glove = this.mk(0x1a1008, 0.95, 0.0);

    // Glove on shooting hand
    const rPalm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.09), glove);
    rPalm.position.set(0.01, -0.09, 0.082);
    rPalm.rotation.x = 0.25;
    this.gunGroup.add(rPalm);

    // Thumb
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.009, 0.055, 6), glove);
    thumb.position.set(-0.04, -0.07, 0.06);
    thumb.rotation.z = -0.6;
    thumb.rotation.x = 0.3;
    this.gunGroup.add(thumb);

    // Trigger finger
    const trigFinger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.007, 0.05, 6), glove);
    trigFinger.position.set(0.028, -0.115, 0.06);
    trigFinger.rotation.z = 0.2;
    trigFinger.rotation.x = -0.6;
    this.gunGroup.add(trigFinger);

    // Other fingers (curled around grip)
    for (let i = 0; i < 3; i++) {
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.055, 6), glove);
      finger.position.set(-0.005 - i * 0.003, -0.16 + i * 0.01, 0.07 - i * 0.005);
      finger.rotation.x = -Math.PI / 2 + 0.3;
      finger.rotation.z = 0.05 * i;
      this.gunGroup.add(finger);
    }

    // Right wrist / forearm
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.18, 8), glove);
    rForearm.position.set(0.01, -0.22, 0.16);
    rForearm.rotation.x = -0.4;
    rForearm.rotation.z = 0.05;
    this.gunGroup.add(rForearm);

    // === LEFT HAND (support hand on handguard) ===
    const lPalm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.10), glove);
    lPalm.position.set(-0.005, 0.006, -0.16);
    lPalm.rotation.z = -1.5;
    lPalm.rotation.x = 0.1;
    this.gunGroup.add(lPalm);

    // Left thumb wrapping top
    const lThumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.009, 0.05, 6), glove);
    lThumb.position.set(0.038, 0.025, -0.16);
    lThumb.rotation.z = 1.2;
    lThumb.rotation.x = 0.2;
    this.gunGroup.add(lThumb);

    // Left fingers wrapping bottom
    for (let i = 0; i < 4; i++) {
      const lFinger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.06, 6), glove);
      lFinger.position.set(-0.038, -0.01 - i * 0.002, -0.14 + i * 0.012);
      lFinger.rotation.z = 1.4 - i * 0.05;
      lFinger.rotation.x = 0.1;
      this.gunGroup.add(lFinger);
    }

    // Left forearm
    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.20, 8), glove);
    lForearm.position.set(-0.005, -0.04, -0.02);
    lForearm.rotation.x = -1.4;
    lForearm.rotation.z = 0.04;
    this.gunGroup.add(lForearm);

    // Position the whole gun group at a default local position
    this.gunGroup.position.set(0.18, -0.18, -0.45);
  }

  init() {
    this.position.set(0, STAND_HEIGHT, 10);
  }

  getGunScene(): THREE.Scene { return this.gunScene; }
  getGunCamera(): THREE.PerspectiveCamera { return this.gunCamera; }

  get isAiming(): boolean {
    return this.input.isMouseDown(2);
  }

  update(dt: number) {
    this.firedThisFrame = false;
    this.input.consumeMouse();
    this.handleLook();
    this.handleMovement(dt);
    this.handleShooting(dt);
    this.handleReload(dt);
    this.updateCamera();
    this.updateGun(dt);
    this.updateMuzzleFlash(dt);
  }

  private handleLook() {
    if (!this.input.locked) return;
    this.yaw -= this.input.mouseDX * SENSITIVITY;
    this.pitch -= this.input.mouseDY * SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.pitch));
  }

  private handleMovement(dt: number) {
    const crouchWanted = this.input.isDown("KeyC");
    if (crouchWanted !== this.crouchPressed) {
      this.crouchPressed = crouchWanted;
      this.crouching = crouchWanted;
    }

    this.height = this.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;

    const sprint = this.input.isDown("ShiftLeft") && !this.crouching;
    const speed = this.crouching ? CROUCH_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const move = new THREE.Vector3();
    if (this.input.isDown("KeyW")) move.add(forward);
    if (this.input.isDown("KeyS")) move.sub(forward);
    if (this.input.isDown("KeyA")) move.sub(right);
    if (this.input.isDown("KeyD")) move.add(right);

    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    this.velocity.x = move.x;
    this.velocity.z = move.z;

    const jumpWanted = this.input.isDown("Space");
    if (jumpWanted && !this.jumpPressed && this.onGround && !this.crouching) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }
    this.jumpPressed = jumpWanted;

    if (!this.onGround) this.velocity.y += GRAVITY * dt;

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    const dy = this.velocity.y * dt;

    this.position.x += dx;
    if (this.map.collidesXZ(this.position, this.height)) this.position.x -= dx;

    this.position.z += dz;
    if (this.map.collidesXZ(this.position, this.height)) this.position.z -= dz;

    this.position.y += dy;
    const floor = this.map.getFloor(this.position);
    if (this.position.y - this.height <= floor + 0.02) {
      this.position.y = floor + this.height;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.onGround = true;
    } else if (this.velocity.y < 0) {
      this.onGround = false;
    }

    const isMoving = move.lengthSq() > 0 && this.onGround;
    const bobSpeed = sprint ? 14 : this.crouching ? 6 : 10;
    if (isMoving) {
      this.bobTime += dt * bobSpeed;
      this.bobAmount += (Math.sin(this.bobTime) * (sprint ? 0.05 : 0.025) - this.bobAmount) * 0.3;
      this.gunBobY += (Math.sin(this.bobTime) * (sprint ? 0.018 : 0.009) - this.gunBobY) * 0.25;
      this.gunBobX += (Math.sin(this.bobTime * 0.5) * (sprint ? 0.01 : 0.005) - this.gunBobX) * 0.25;
    } else {
      this.bobAmount *= 0.88;
      this.gunBobY *= 0.88;
      this.gunBobX *= 0.88;
    }
  }

  private handleShooting(dt: number) {
    this.shootCooldown -= dt;
    const fireRate = 0.1;

    if (this.input.isMouseDown(0) && this.shootCooldown <= 0 && !this.reloading && this.ammo > 0 && this.input.locked) {
      this.ammo--;
      this.firedThisFrame = true;
      this.shootCooldown = fireRate;
      this.muzzleFlashTimer = 0.07;
      this.recoilY = 0.04;
      this.recoilZ = 0.025;
    }

    if (this.ammo === 0 && !this.reloading && this.totalAmmo > 0) {
      this.startReload();
    }
  }

  getShootRay(): THREE.Raycaster {
    const ray = new THREE.Raycaster();
    const spread = this.isAiming ? 0.004 : 0.018;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      -1
    );
    dir.applyQuaternion(this.camera.quaternion);
    ray.set(this.camera.position, dir.normalize());
    return ray;
  }

  private handleReload(dt: number) {
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.maxAmmo - this.ammo;
        const take = Math.min(needed, this.totalAmmo);
        this.ammo += take;
        this.totalAmmo -= take;
        this.reloading = false;
      }
    }
    if (this.input.isDown("KeyR") && !this.reloading && this.ammo < this.maxAmmo && this.totalAmmo > 0) {
      this.startReload();
    }
  }

  private startReload() {
    this.reloading = true;
    this.reloadTimer = this.reloadTime;
  }

  private updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.position.y += this.bobAmount;
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Keep gun camera in sync
    this.gunCamera.aspect = this.camera.aspect;
    this.gunCamera.updateProjectionMatrix();
  }

  private updateGun(dt: number) {
    const aimFov = this.isAiming ? 50 : 75;
    this.camera.fov += (aimFov - this.camera.fov) * dt * 10;
    this.camera.updateProjectionMatrix();

    const aimX = this.isAiming ? 0.0 : 0.18;
    const aimZ = this.isAiming ? -0.36 : -0.45;
    this.gunTargetX = aimX;
    this.gunTargetZ = aimZ;
    this.gunCurrentX += (this.gunTargetX - this.gunCurrentX) * dt * 14;
    this.gunCurrentZ += (this.gunTargetZ - this.gunCurrentZ) * dt * 14;

    // Recoil spring
    this.recoilY *= 0.75;
    this.recoilZ *= 0.75;

    const px = this.gunCurrentX + this.gunBobX;
    const py = -0.18 + this.gunBobY - this.recoilY;
    const pz = this.gunCurrentZ + this.recoilZ;

    this.gunGroup.position.set(px, py, pz);

    // Reload animation
    if (this.reloading) {
      const t = 1 - this.reloadTimer / this.reloadTime;
      const swing = Math.sin(t * Math.PI);
      this.gunGroup.position.y -= swing * 0.12;
      this.gunGroup.rotation.x = swing * 0.6;
      this.gunGroup.rotation.z = swing * -0.2;
    } else {
      this.gunGroup.rotation.x *= 0.8;
      this.gunGroup.rotation.z *= 0.8;
    }

    // Apply slight sway from look direction
    this.gunGroup.rotation.y *= 0.85;
  }

  private updateMuzzleFlash(dt: number) {
    const mat = this.muzzleFlashMesh.material as THREE.MeshBasicMaterial;
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      const t = this.muzzleFlashTimer / 0.07;
      mat.opacity = t;
      this.muzzleFlashMesh.scale.setScalar(1 + Math.random() * 2);
      this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
      // Position the point light at the muzzle world position for scene illumination
      this.muzzleFlashLight.position.copy(this.getMuzzleWorldPosition());
      this.muzzleFlashLight.intensity = t * 3;
    } else {
      mat.opacity = 0;
      this.muzzleFlashLight.intensity = 0;
    }
  }

  getMuzzleWorldPosition(): THREE.Vector3 {
    // The muzzlePoint local position in gun-group space is (0, 0.01, -0.62)
    // gun-group is a child of gunCamera at (px, py, pz) ≈ (0.18, -0.18, -0.45..−1.07 total Z from cam)
    // We compute this analytically from the main camera's world transform.
    const localOffset = new THREE.Vector3(
      this.gunGroup.position.x,
      this.gunGroup.position.y + 0.01,
      this.gunGroup.position.z - 0.62
    );
    localOffset.applyQuaternion(this.camera.quaternion);
    return this.camera.position.clone().add(localOffset);
  }

  takeDamage(amount: number) {
    this.health = Math.max(0, this.health - amount);
  }

  heal(amount: number) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  isDead(): boolean {
    return this.health <= 0;
  }
}
