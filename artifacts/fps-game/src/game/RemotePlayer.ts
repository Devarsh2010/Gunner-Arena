import * as THREE from "three";
import type { RemotePlayerState } from "./NetworkManager";

function mat(color: number, rough = 0.7, metal = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

export class RemotePlayer {
  private group: THREE.Group;
  private scene: THREE.Scene;

  // Animated limb groups
  private bodyGroup: THREE.Group;   // rotates on Y (yaw)
  private upperBody: THREE.Group;   // slight lean/bob
  private headPivot: THREE.Group;   // rotates on Y+X (yaw+pitch)
  private leftLegPivot: THREE.Group;
  private rightLegPivot: THREE.Group;
  private leftArmPivot: THREE.Group;
  private rightArmPivot: THREE.Group;

  private nameSprite: THREE.Sprite;
  private shootFlash: THREE.PointLight;
  private muzzleObj: THREE.Object3D;

  // Animation state
  private animTime = 0;
  private shootFlashTimer = 0;
  private prevPos = new THREE.Vector3();
  private smoothSpeed = 0;
  private smoothYaw = 0;

  state: RemotePlayerState;

  constructor(scene: THREE.Scene, initialState: RemotePlayerState) {
    this.scene = scene;
    this.state = { ...initialState };

    this.group = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.upperBody = new THREE.Group();
    this.headPivot = new THREE.Group();
    this.leftLegPivot = new THREE.Group();
    this.rightLegPivot = new THREE.Group();
    this.leftArmPivot = new THREE.Group();
    this.rightArmPivot = new THREE.Group();

    this.muzzleObj = new THREE.Object3D();
    this.muzzleObj.position.set(0.18, 1.05, -0.65);

    this.buildModel();

    this.nameSprite = this.buildNameTag(initialState.name);
    this.nameSprite.position.set(0, 2.35, 0);
    this.group.add(this.nameSprite);

    this.shootFlash = new THREE.PointLight(0xffaa22, 0, 5);
    this.shootFlash.position.copy(this.muzzleObj.position);
    this.group.add(this.shootFlash);
    this.group.add(this.muzzleObj);

    this.group.position.set(initialState.x, 0, initialState.z);
    this.prevPos.copy(this.group.position);
    this.smoothYaw = initialState.yaw;

    scene.add(this.group);
  }

  private buildModel() {
    const olive  = mat(0x4a5a2a);
    const dark   = mat(0x252515, 0.5, 0.2);
    const black  = mat(0x111111, 0.6, 0.3);
    const skin   = mat(0xc68642, 0.9, 0.0);
    const tan    = mat(0x8a7255, 0.85, 0.05);

    // ── TORSO ──
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.55, 0.28), olive);
    torso.position.y = 0;
    torso.castShadow = true;

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.20), dark);
    vest.position.set(0, 0.02, 0.05);

    // Ammo pouches
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.08), black);
      p.position.set(-0.15 + i * 0.15, -0.12, 0.15);
      this.upperBody.add(p);
    }

    this.upperBody.add(torso, vest);
    this.upperBody.position.y = 1.1;
    this.bodyGroup.add(this.upperBody);

    // ── HEAD (pivot at neck) ──
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
    head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.36), dark);
    helmet.position.y = 0.10;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.08), mat(0x223344, 0.2, 0.8));
    visor.position.set(0, 0.04, 0.16);

    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.06), skin);
    earL.position.set(-0.19, 0, 0);
    const earR = earL.clone(); earR.position.x = 0.19;

    const hsArc = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 12, Math.PI), black);
    hsArc.rotation.z = Math.PI / 2;
    hsArc.position.y = 0.05;

    this.headPivot.add(head, helmet, visor, earL, earR, hsArc);
    this.headPivot.position.y = 1.55;   // world height when bodyGroup at y=0
    this.group.add(this.headPivot);

    // ── LEFT LEG (pivot at hip ~y=0.82) ──
    const lLegMesh = this.buildLeg(olive, black);
    this.leftLegPivot.add(lLegMesh);
    this.leftLegPivot.position.set(-0.13, 0.82, 0);
    this.bodyGroup.add(this.leftLegPivot);

    // ── RIGHT LEG ──
    const rLegMesh = this.buildLeg(olive, black);
    this.rightLegPivot.add(rLegMesh);
    this.rightLegPivot.position.set(0.13, 0.82, 0);
    this.bodyGroup.add(this.rightLegPivot);

    // ── LEFT ARM (pivot at shoulder ~upperBody y offset) ──
    const lArmMesh = this.buildArm(olive, black);
    this.leftArmPivot.add(lArmMesh);
    this.leftArmPivot.position.set(-0.30, 1.32, 0);
    this.bodyGroup.add(this.leftArmPivot);

    // ── RIGHT ARM with rifle ──
    const rArmMesh = this.buildArm(olive, black);
    this.rightArmPivot.add(rArmMesh);
    // Add rifle to right arm
    const rifle = this.buildRifle(black, dark, tan);
    rifle.position.set(0.04, -0.15, -0.22);
    rifle.rotation.x = 0.15;
    this.rightArmPivot.add(rifle);
    this.rightArmPivot.position.set(0.30, 1.32, 0);
    this.bodyGroup.add(this.rightArmPivot);

    this.group.add(this.bodyGroup);
  }

  private buildLeg(olive: THREE.Material, black: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    // Upper leg - positioned relative to pivot (hip)
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.30, 0.22), olive as THREE.MeshStandardMaterial);
    upper.position.y = -0.15;
    upper.castShadow = true;

    // Knee pad
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.10), black as THREE.MeshStandardMaterial);
    knee.position.set(0, -0.28, 0.10);

    // Lower leg
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.20), olive as THREE.MeshStandardMaterial);
    lower.position.y = -0.45;
    lower.castShadow = true;

    // Boot
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.18, 0.30), black as THREE.MeshStandardMaterial);
    boot.position.set(0, -0.64, 0.04);

    g.add(upper, knee, lower, boot);
    return g;
  }

  private buildArm(olive: THREE.Material, black: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.18), olive as THREE.MeshStandardMaterial);
    upper.position.y = -0.13;
    upper.castShadow = true;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.16), olive as THREE.MeshStandardMaterial);
    lower.position.y = -0.35;
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.16), black as THREE.MeshStandardMaterial);
    glove.position.y = -0.50;
    g.add(upper, lower, glove);
    return g;
  }

  private buildRifle(black: THREE.MeshStandardMaterial, dark: THREE.MeshStandardMaterial, tan: THREE.MeshStandardMaterial): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.55), black);
    body.position.z = -0.05;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 8), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.38);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.056), dark);
    mag.position.set(0, -0.10, 0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.17), tan);
    stock.position.set(0, -0.01, 0.26);
    g.add(body, barrel, mag, stock);
    return g;
  }

  private buildNameTag(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 10);
    ctx.fill();
    ctx.fillStyle = "#00ff88";
    ctx.font = "bold 26px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 14), 128, 34);
    const tex = new THREE.CanvasTexture(canvas);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.6, 0.4, 1);
    spr.renderOrder = 999;
    return spr;
  }

  update(dt: number, state: RemotePlayerState) {
    this.state = state;

    // ── Position lerp (smooth movement, including Y for elevations/jumps) ──
    const lerpFactor = Math.min(1, dt * 18);
    this.group.position.x += (state.x - this.group.position.x) * lerpFactor;
    this.group.position.z += (state.z - this.group.position.z) * lerpFactor;
    // Use slower Y lerp so platforms/jumps look smooth without snapping
    const yLerp = Math.min(1, dt * 10);
    const targetY = state.y - 1.75; // convert eye-height Y to feet Y
    this.group.position.y += (targetY - this.group.position.y) * yLerp;

    // Compute horizontal speed from position delta for animation
    const dx = this.group.position.x - this.prevPos.x;
    const dz = this.group.position.z - this.prevPos.z;
    const instantSpeed = Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001);
    this.prevPos.copy(this.group.position);
    this.smoothSpeed += (instantSpeed - this.smoothSpeed) * Math.min(1, dt * 8);

    const isMoving = this.smoothSpeed > 0.3;
    const isSprinting = state.sprinting && isMoving;
    const bobFreq = isSprinting ? 14 : 10;
    const legSwing = isSprinting ? 0.55 : isMoving ? 0.38 : 0;
    const armSwing = legSwing * 0.6;

    if (isMoving) this.animTime += dt * bobFreq;
    else this.animTime *= 0.85; // decay when stopped

    // ── Leg animation ──
    this.leftLegPivot.rotation.x  =  Math.sin(this.animTime) * legSwing;
    this.rightLegPivot.rotation.x = -Math.sin(this.animTime) * legSwing;

    // ── Arm swing (opposite to legs) ──
    this.leftArmPivot.rotation.x  = -Math.sin(this.animTime) * armSwing;
    this.rightArmPivot.rotation.x =  Math.sin(this.animTime) * armSwing;

    // Shooting: raise right arm
    if (state.shooting) this.shootFlashTimer = 0.10;
    if (this.shootFlashTimer > 0) {
      this.shootFlashTimer -= dt;
      this.rightArmPivot.rotation.x = -0.3;
      this.shootFlash.intensity = (this.shootFlashTimer / 0.10) * 5;
    } else {
      this.shootFlash.intensity = 0;
    }

    // ── Body bob (subtle vertical bounce when moving) ──
    const bobY = isMoving ? Math.abs(Math.sin(this.animTime)) * -0.03 : 0;
    this.upperBody.position.y = bobY;

    // ── Crouch ──
    const crouchOffset = state.crouching ? -0.45 : 0;
    this.bodyGroup.position.y += (crouchOffset - this.bodyGroup.position.y) * Math.min(1, dt * 12);

    // ── Yaw smoothing (body rotation) ──
    let dy = state.yaw - this.smoothYaw;
    while (dy >  Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.smoothYaw += dy * Math.min(1, dt * 14);

    this.bodyGroup.rotation.y = this.smoothYaw;
    this.headPivot.rotation.y = this.smoothYaw;

    // Head looks up/down (pitch)
    this.headPivot.rotation.x += (state.pitch * 0.6 - this.headPivot.rotation.x) * Math.min(1, dt * 12);

    // ── Visibility ──
    this.group.visible = !state.dead;
    this.nameSprite.visible = !state.dead;
  }

  getBoundingBox(): THREE.Box3 {
    // Capsule-ish AABB centered on the player position
    const pos = new THREE.Vector3(this.state.x, this.state.y, this.state.z);
    const halfW = 0.4;
    const height = this.state.crouching ? 0.9 : 1.8;
    return new THREE.Box3(
      new THREE.Vector3(pos.x - halfW, pos.y - 0.1, pos.z - halfW),
      new THREE.Vector3(pos.x + halfW, pos.y + height, pos.z + halfW)
    );
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
      if (obj instanceof THREE.Sprite) {
        (obj.material as THREE.SpriteMaterial).map?.dispose();
        obj.material.dispose();
      }
    });
  }
}
