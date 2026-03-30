import type { Player } from "./Player";
import type { EnemyManager } from "./EnemyManager";

export class HUD {
  private player: Player | null = null;
  private enemyManager: EnemyManager | null = null;

  private healthEl: HTMLElement | null;
  private ammoEl: HTMLElement | null;
  private totalAmmoEl: HTMLElement | null;
  private reloadEl: HTMLElement | null;
  private crosshairEl: HTMLElement | null;
  private killsEl: HTMLElement | null;
  private waveEl: HTMLElement | null;
  private enemyCountEl: HTMLElement | null;
  private hitMarkerEl: HTMLElement | null;
  private hitMarkerTimer = 0;
  private damageOverlayEl: HTMLElement | null;
  private damageTimer = 0;
  private prevHealth = 100;

  constructor(
    healthEl: HTMLElement | null,
    ammoEl: HTMLElement | null,
    totalAmmoEl: HTMLElement | null,
    reloadEl: HTMLElement | null,
    crosshairEl: HTMLElement | null,
    killsEl: HTMLElement | null,
    waveEl: HTMLElement | null,
    enemyCountEl: HTMLElement | null,
    hitMarkerEl: HTMLElement | null,
    damageOverlayEl: HTMLElement | null
  ) {
    this.healthEl = healthEl;
    this.ammoEl = ammoEl;
    this.totalAmmoEl = totalAmmoEl;
    this.reloadEl = reloadEl;
    this.crosshairEl = crosshairEl;
    this.killsEl = killsEl;
    this.waveEl = waveEl;
    this.enemyCountEl = enemyCountEl;
    this.hitMarkerEl = hitMarkerEl;
    this.damageOverlayEl = damageOverlayEl;
  }

  setPlayer(player: Player) {
    this.player = player;
    this.prevHealth = player.health;
  }

  setEnemyManager(em: EnemyManager) {
    this.enemyManager = em;
  }

  triggerHitMarker() {
    this.hitMarkerTimer = 0.2;
  }

  triggerDamage() {
    this.damageTimer = 0.5;
  }

  update(isMultiplayer = false) {
    if (!this.player) return;
    const p = this.player;

    if (p.health < this.prevHealth) {
      this.damageTimer = 0.4;
    }
    this.prevHealth = p.health;

    if (this.healthEl) {
      this.healthEl.textContent = `${Math.ceil(p.health)}`;
      const pct = p.health / p.maxHealth;
      this.healthEl.style.color = pct > 0.5 ? "#00ff88" : pct > 0.25 ? "#ffaa00" : "#ff3300";
    }

    if (this.ammoEl) {
      this.ammoEl.textContent = `${p.ammo}`;
      this.ammoEl.style.color = p.ammo === 0 ? "#ff3300" : "#ffffff";
    }

    if (this.totalAmmoEl) {
      this.totalAmmoEl.textContent = `/ ${p.totalAmmo}`;
    }

    if (this.reloadEl) {
      this.reloadEl.style.opacity = (p as any).reloading ? "1" : "0";
    }

    if (this.killsEl) {
      this.killsEl.textContent = `${p.kills}`;
    }

    // Wave / enemy count only shown in solo mode
    if (!isMultiplayer && this.enemyManager) {
      if (this.waveEl) this.waveEl.textContent = `${this.enemyManager.getWave()}`;
      if (this.enemyCountEl) this.enemyCountEl.textContent = `${this.enemyManager.getAliveCount()}`;
    }

    this.hitMarkerTimer -= 0.016;
    if (this.hitMarkerEl) {
      this.hitMarkerEl.style.opacity = this.hitMarkerTimer > 0 ? "1" : "0";
    }

    this.damageTimer -= 0.016;
    if (this.damageOverlayEl) {
      this.damageOverlayEl.style.opacity = this.damageTimer > 0 ? `${Math.min(0.5, this.damageTimer)}` : "0";
    }

    if (this.crosshairEl && p.isAiming) {
      this.crosshairEl.style.opacity = "0.5";
    } else if (this.crosshairEl) {
      this.crosshairEl.style.opacity = "1";
    }
  }
}
