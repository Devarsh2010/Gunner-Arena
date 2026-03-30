import * as THREE from "three";

interface Tracer {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  lifetime: number;
  maxLifetime: number;
}

export class BulletTracer {
  private scene: THREE.Scene;
  private tracers: Tracer[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(start: THREE.Vector3, end: THREE.Vector3) {
    const points = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 10;
    this.scene.add(line);

    const lt = 0.12;
    this.tracers.push({ line, material: mat, lifetime: lt, maxLifetime: lt });

    const glowGeo = new THREE.BufferGeometry().setFromPoints(points);
    const glowMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      linewidth: 2,
    });
    const glow = new THREE.Line(glowGeo, glowMat);
    glow.renderOrder = 9;
    this.scene.add(glow);
    this.tracers.push({ line: glow, material: glowMat, lifetime: lt * 0.7, maxLifetime: lt * 0.7 });
  }

  update(dt: number) {
    const alive: Tracer[] = [];
    for (const t of this.tracers) {
      t.lifetime -= dt;
      if (t.lifetime <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.material.dispose();
      } else {
        t.material.opacity = (t.lifetime / t.maxLifetime) * (t === this.tracers[0] ? 0.9 : 0.5);
        alive.push(t);
      }
    }
    this.tracers = alive;
  }

  dispose() {
    for (const t of this.tracers) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      t.material.dispose();
    }
    this.tracers = [];
  }
}
