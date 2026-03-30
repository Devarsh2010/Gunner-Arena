export interface RemotePlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  dead: boolean;
  shooting: boolean;
  crouching: boolean;
  moving: boolean;
  sprinting: boolean;
}

export type NetworkEvent =
  | { type: "welcome"; id: string; spawnX: number; spawnY: number; spawnZ: number; spawnYaw: number; players: RemotePlayerState[] }
  | { type: "player_joined"; player: RemotePlayerState }
  | { type: "player_left"; id: string }
  | ({ type: "state" } & RemotePlayerState)
  | { type: "chat"; id: string; name: string; text: string }
  | { type: "damage"; amount: number; fromId: string }
  | { type: "hit_confirm"; targetId: string; targetName: string; amount: number; killed: boolean }
  | { type: "kill_feed"; killerName: string; victimName: string }
  | { type: "respawn_ack"; x: number; y: number; z: number };

export interface WelcomeResult {
  id: string;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  spawnYaw: number;
}

export class NetworkManager {
  myId: string | null = null;
  private ws: WebSocket | null = null;
  private stateInterval: ReturnType<typeof setInterval> | null = null;

  private _welcomeBuffer: RemotePlayerState[] = [];

  private _onPlayerJoined: ((p: RemotePlayerState) => void) | null = null;
  get onPlayerJoined() { return this._onPlayerJoined; }
  set onPlayerJoined(cb: ((p: RemotePlayerState) => void) | null) {
    this._onPlayerJoined = cb;
    if (cb && this._welcomeBuffer.length > 0) {
      for (const p of this._welcomeBuffer) cb(p);
      this._welcomeBuffer = [];
    }
  }

  onPlayerLeft:   ((id: string) => void) | null = null;
  onPlayerState:  ((state: RemotePlayerState) => void) | null = null;
  onChat:         ((id: string, name: string, text: string) => void) | null = null;
  onDamage:       ((amount: number, fromId: string) => void) | null = null;
  onHitConfirm:   ((targetId: string, targetName: string, amount: number, killed: boolean) => void) | null = null;
  onKillFeed:     ((killerName: string, victimName: string) => void) | null = null;
  onRespawnAck:   ((x: number, y: number, z: number) => void) | null = null;
  onDisconnect:   (() => void) | null = null;

  connect(name: string, room: string): Promise<WelcomeResult> {
    return new Promise((resolve, reject) => {
      // Use same-origin — Vite dev server proxies /ws → ws://localhost:8080
      const proto  = window.location.protocol === "https:" ? "wss:" : "ws:";
      const WS_URL = `${proto}//${window.location.host}/ws`;

      try {
        this.ws = new WebSocket(WS_URL);
      } catch (e) {
        reject(e);
        return;
      }

      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 8000);

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected:", WS_URL);
        this.ws!.send(JSON.stringify({ type: "join", name, room }));
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: NetworkEvent = JSON.parse(event.data);

          if (msg.type === "welcome") {
            clearTimeout(timeout);
            this.myId = msg.id;

            if (this._onPlayerJoined) {
              for (const p of msg.players) this._onPlayerJoined(p);
            } else {
              this._welcomeBuffer = msg.players;
            }

            resolve({
              id:       msg.id,
              spawnX:   msg.spawnX,
              spawnY:   msg.spawnY,
              spawnZ:   msg.spawnZ,
              spawnYaw: msg.spawnYaw,
            });

          } else if (msg.type === "player_joined") {
            this._onPlayerJoined?.(msg.player);

          } else if (msg.type === "player_left") {
            this.onPlayerLeft?.(msg.id);

          } else if (msg.type === "state") {
            this.onPlayerState?.(msg as unknown as RemotePlayerState);

          } else if (msg.type === "chat") {
            this.onChat?.(msg.id, msg.name, msg.text);

          } else if (msg.type === "damage") {
            this.onDamage?.(msg.amount, msg.fromId);

          } else if (msg.type === "hit_confirm") {
            this.onHitConfirm?.(msg.targetId, msg.targetName, msg.amount, msg.killed);

          } else if (msg.type === "kill_feed") {
            this.onKillFeed?.(msg.killerName, msg.victimName);

          } else if (msg.type === "respawn_ack") {
            this.onRespawnAck?.(msg.x, msg.y, msg.z);
          }

        } catch (err) {
          console.warn("⚠️ Invalid message:", event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.error("❌ WebSocket error", err);
        clearTimeout(timeout);
        reject(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        console.warn("🔌 WebSocket disconnected");
        this.myId = null;
        this.onDisconnect?.();
      };
    });
  }

  startSending(getState: () => Omit<RemotePlayerState, "id" | "name">) {
    this.stateInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "state", ...getState() }));
      }
    }, 50);
  }

  sendHit(targetId: string, damage: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "hit", targetId, damage }));
    }
  }

  sendRespawn() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "respawn" }));
    }
  }

  sendChat(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "chat", text }));
    }
  }

  disconnect() {
    if (this.stateInterval) clearInterval(this.stateInterval);
    this.ws?.close();
    this.ws = null;
    this.myId = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
