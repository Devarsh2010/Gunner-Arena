import * as THREE from "three";

export interface Wall {
  mesh: THREE.Mesh;
  aabb: THREE.Box3;
}

export class Map {
  private scene: THREE.Scene;
  walls: Wall[] = [];
  private floorMeshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  build() {
    this.buildGround();
    this.buildWalls();
    this.buildStructures();
    this.buildDecorations();
  }

  private mat(color: number, rough = 0.9, metal = 0.0): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  private box(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    color: number, rough = 0.9, metal = 0.0,
    isSolid = true
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, this.mat(color, rough, metal));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (isSolid) {
      const hw = w / 2, hh = h / 2, hd = d / 2;
      const aabb = new THREE.Box3(
        new THREE.Vector3(x - hw, y - hh, z - hd),
        new THREE.Vector3(x + hw, y + hh, z + hd)
      );
      this.walls.push({ mesh, aabb });
    }
    return mesh;
  }

  private buildGround() {
    const groundGeo = new THREE.PlaneGeometry(200, 200, 40, 40);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 1.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.floorMeshes.push(ground);

    for (let i = 0; i < 30; i++) {
      const r = Math.random() * 60 + 10;
      const a = Math.random() * Math.PI * 2;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      const s = Math.random() * 3 + 1;
      const rockGeo = new THREE.DodecahedronGeometry(s * 0.4, 0);
      const rock = new THREE.Mesh(rockGeo, this.mat(0x888888));
      rock.position.set(px, s * 0.2, pz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    }
  }

  private buildWalls() {
    const perimeter = 50;
    const h = 6;
    const t = 1;
    const wallColor = 0x8b6914;

    this.box(perimeter * 2, h, t, 0, h / 2, -perimeter, wallColor);
    this.box(perimeter * 2, h, t, 0, h / 2, perimeter, wallColor);
    this.box(t, h, perimeter * 2, -perimeter, h / 2, 0, wallColor);
    this.box(t, h, perimeter * 2, perimeter, h / 2, 0, wallColor);
  }

  private buildStructures() {
    const concColor = 0x909090;
    const brickColor = 0xcc6633;
    const metalColor = 0x556677;

    this.box(12, 5, 1, -20, 2.5, -15, brickColor);
    this.box(12, 5, 1, -20, 2.5, -5, brickColor);
    this.box(1, 5, 10, -26, 2.5, -10, brickColor);
    this.box(8, 5, 0.5, -14, 2.5, -10, brickColor, 0.9, 0, false);

    this.box(16, 4, 14, -20, 2, -10, 0x7a6030, 1.0, 0, false);

    this.box(1, 4, 12, 15, 2, -15, concColor);
    this.box(12, 4, 1, 20, 2, -20, concColor);
    this.box(1, 4, 12, 25, 2, -15, concColor);
    this.box(12, 4, 1, 20, 2, -10, concColor);

    this.box(3, 8, 3, 15, 4, -20, metalColor, 0.4, 0.9);
    this.box(3, 8, 3, 25, 4, -20, metalColor, 0.4, 0.9);
    this.box(3, 8, 3, 15, 4, -10, metalColor, 0.4, 0.9);
    this.box(3, 8, 3, 25, 4, -10, metalColor, 0.4, 0.9);

    this.box(16, 2.5, 2, 20, 5, -15, metalColor, 0.5, 0.8, false);
    this.box(2, 2.5, 16, 15, 5, -15, metalColor, 0.5, 0.8, false);
    this.box(2, 2.5, 16, 25, 5, -15, metalColor, 0.5, 0.8, false);

    this.box(2, 3, 2, 5, 1.5, 10, 0x8B4513);
    this.box(2, 3, 2, 5, 1.5, 15, 0x8B4513);
    this.box(2, 3, 2, 10, 1.5, 10, 0x8B4513);
    this.box(2, 3, 2, 10, 1.5, 15, 0x8B4513);
    this.box(7, 0.3, 7, 7.5, 3, 12.5, 0x6B3410, 0.7, 0, false);
    this.box(2, 1, 7, 5, 0.5, 12.5, 0x4a3010);
    this.box(2, 1, 7, 10, 0.5, 12.5, 0x4a3010);

    this.box(4, 1.5, 4, -10, 0.75, 15, 0x888888);
    this.box(2, 1.2, 2, -14, 0.6, 20, 0x888888);
    this.box(6, 0.4, 2, -10, 1.7, 15, 0xaaaaaa, 0.5, 0, false);

    this.box(1, 2, 8, 30, 1, 10, brickColor);
    this.box(1, 2, 8, 30, 1, 25, brickColor);
    this.box(8, 2, 1, 34, 1, 28, brickColor);
    this.box(5, 0.3, 8, 30.5, 2.15, 17.5, concColor, 0.6, 0, false);

    this.addCrateCluster(-5, 0, -30);
    this.addCrateCluster(30, 0, -5);
    this.addCrateCluster(-35, 0, 20);

    this.addTunnel(0, 0, 0);
  }

  private addCrateCluster(cx: number, cy: number, cz: number) {
    const crateColor = 0x8B6914;
    const positions = [
      [0, 0, 0], [2.2, 0, 0], [0, 0, 2.2], [2.2, 0, 2.2],
      [1.1, 2.2, 1.1], [0, 2.2, 0]
    ];
    for (const [dx, dy, dz] of positions) {
      this.box(2, 2, 2, cx + dx, cy + 1 + dy, cz + dz, crateColor, 0.8);
    }
  }

  private addTunnel(cx: number, cy: number, cz: number) {
    const col = 0x777777;
    const len = 18;
    const w = 4;
    const h = 3;

    this.box(w, 0.4, len, cx, cy + h + 0.2, cz - len / 2, col, 0.7, 0, false);
    this.box(0.4, h, len, cx - w / 2, cy + h / 2, cz - len / 2, col);
    this.box(0.4, h, len, cx + w / 2, cy + h / 2, cz - len / 2, col);
  }

  private buildDecorations() {
    for (let i = 0; i < 20; i++) {
      const r = Math.random() * 35 + 5;
      const a = Math.random() * Math.PI * 2;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      if (Math.abs(px) < 8 && Math.abs(pz) < 8) continue;
      const h = Math.random() * 8 + 5;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, h, 6),
        this.mat(0x5c3d1e)
      );
      trunk.position.set(px, h / 2, pz);
      trunk.castShadow = true;
      this.scene.add(trunk);

      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(2, 4, 7),
        this.mat(0x2d5a1a, 1.0)
      );
      foliage.position.set(px, h + 1.5, pz);
      foliage.castShadow = true;
      this.scene.add(foliage);

      const foliage2 = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 3, 7),
        this.mat(0x3a6e22, 1.0)
      );
      foliage2.position.set(px, h + 3.5, pz);
      foliage2.castShadow = true;
      this.scene.add(foliage2);
    }

    const lampColor = 0xfff5cc;
    const lampPositions = [[-20, 5], [20, -15], [7.5, 12.5], [-10, 15], [30, 17.5]];
    for (const [lx, lz] of lampPositions) {
      const light = new THREE.PointLight(lampColor, 1.5, 15);
      light.position.set(lx, 5.5, lz);
      this.scene.add(light);
      const glowGeo = new THREE.SphereGeometry(0.15, 6, 6);
      const glowMat = new THREE.MeshBasicMaterial({ color: lampColor });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(light.position);
      this.scene.add(glow);
    }
  }

  collidesXZ(pos: THREE.Vector3, height: number): boolean {
    const r = 0.45;
    const yMin = pos.y - height + 0.05;
    const yMax = pos.y - 0.05;
    const playerBox = new THREE.Box3(
      new THREE.Vector3(pos.x - r, yMin, pos.z - r),
      new THREE.Vector3(pos.x + r, yMax, pos.z + r)
    );
    for (const w of this.walls) {
      if (playerBox.intersectsBox(w.aabb)) return true;
    }
    return false;
  }

  getFloor(pos: THREE.Vector3): number {
    return 0;
  }

  getSpawnPoints(): THREE.Vector3[] {
    return [
      new THREE.Vector3(-22, 1, -10),
      new THREE.Vector3(-18, 1, -8),
      new THREE.Vector3(20, 1, -15),
      new THREE.Vector3(20, 1, -20),
      new THREE.Vector3(7, 1, 12),
      new THREE.Vector3(-10, 1, 16),
      new THREE.Vector3(30, 1, 10),
      new THREE.Vector3(30, 1, 25),
      new THREE.Vector3(-35, 1, 20),
      new THREE.Vector3(-5, 1, -30),
      new THREE.Vector3(5, 1, -10),
      new THREE.Vector3(-5, 1, 5),
    ];
  }

  updateWallAABBs() {
    for (const w of this.walls) {
      w.aabb.setFromObject(w.mesh);
    }
  }

  getCollidableObjects(): THREE.Object3D[] {
    return this.walls.map(w => w.mesh);
  }
}
