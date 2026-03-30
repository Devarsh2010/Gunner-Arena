import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { randomUUID } from "crypto";

export interface PlayerState {
  id: string;
  name: string;
  room: string;
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

interface Client {
  ws: WebSocket;
  state: PlayerState;
  kills: number;
}

const clients = new Map<string, Client>();

// Spread spawns around the map so players don't all start on top of each other
const SPAWN_POINTS = [
  { x:  0,   y: 1.75, z:  10,  yaw: 0 },
  { x: -12,  y: 1.75, z: -8,   yaw: Math.PI * 0.75 },
  { x:  15,  y: 1.75, z:  5,   yaw: Math.PI * 1.5 },
  { x:  8,   y: 1.75, z: -15,  yaw: Math.PI },
  { x: -18,  y: 1.75, z:  12,  yaw: Math.PI * 0.25 },
  { x:  20,  y: 1.75, z: -20,  yaw: Math.PI * 1.25 },
  { x: -25,  y: 1.75, z: -5,   yaw: Math.PI * 0.5 },
  { x:  5,   y: 1.75, z:  25,  yaw: Math.PI },
];

function randomSpawn() {
  const sp = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  // Add small jitter so players at the same spawn point don't overlap
  return {
    x:   sp.x + (Math.random() - 0.5) * 4,
    y:   sp.y,
    z:   sp.z + (Math.random() - 0.5) * 4,
    yaw: sp.yaw + (Math.random() - 0.5) * 0.5,
  };
}

function getRoomPlayers(room: string): PlayerState[] {
  const result: PlayerState[] = [];
  for (const client of clients.values()) {
    if (client.state.room === room) result.push(client.state);
  }
  return result;
}

function broadcast(room: string, excludeId: string, data: object) {
  const msg = JSON.stringify(data);
  for (const [id, client] of clients) {
    if (
      client.state.room === room &&
      id !== excludeId &&
      client.ws.readyState === WebSocket.OPEN
    ) {
      client.ws.send(msg);
    }
  }
}

function broadcastAll(room: string, data: object) {
  const msg = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.state.room === room && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(msg);
    }
  }
}

function sendTo(id: string, data: object) {
  const client = clients.get(id);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(data));
  }
}

export function attachMultiplayerServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    const id = randomUUID();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        // ── JOIN ──────────────────────────────────────────────────────────
        if (msg.type === "join") {
          const room: string = (msg.room || "default").trim().toLowerCase().slice(0, 16);
          const name: string = (msg.name || "Soldier").trim().slice(0, 20);

          const spawn = randomSpawn();

          const state: PlayerState = {
            id,
            name,
            room,
            x:        spawn.x,
            y:        spawn.y,
            z:        spawn.z,
            yaw:      spawn.yaw,
            pitch:    0,
            health:   100,
            dead:     false,
            shooting: false,
            crouching: false,
            moving:   false,
            sprinting: false,
          };

          clients.set(id, { ws, state, kills: 0 });

          const others = getRoomPlayers(room).filter((p) => p.id !== id);
          sendTo(id, {
            type:     "welcome",
            id,
            spawnX:   spawn.x,
            spawnY:   spawn.y,
            spawnZ:   spawn.z,
            spawnYaw: spawn.yaw,
            players:  others,
          });

          broadcast(room, id, { type: "player_joined", player: state });

          console.log(`[MP] ${name} (${id.slice(0, 8)}) joined room "${room}" — ${getRoomPlayers(room).length} players`);
        }

        // ── STATE UPDATE ──────────────────────────────────────────────────
        else if (msg.type === "state") {
          const client = clients.get(id);
          if (!client) return;
          const s = client.state;
          if (typeof msg.x === "number") s.x = msg.x;
          if (typeof msg.y === "number") s.y = msg.y;
          if (typeof msg.z === "number") s.z = msg.z;
          if (typeof msg.yaw   === "number") s.yaw   = msg.yaw;
          if (typeof msg.pitch === "number") s.pitch = msg.pitch;
          s.dead      = !!msg.dead;
          s.shooting  = !!msg.shooting;
          s.crouching = !!msg.crouching;
          s.moving    = !!msg.moving;
          s.sprinting = !!msg.sprinting;
          broadcast(s.room, id, { type: "state", ...s });
        }

        // ── CHAT ──────────────────────────────────────────────────────────
        else if (msg.type === "chat") {
          const client = clients.get(id);
          if (!client) return;
          const text = String(msg.text || "").slice(0, 200);
          const packet = { type: "chat", id, name: client.state.name, text };
          broadcastAll(client.state.room, packet);
        }

        // ── HIT ───────────────────────────────────────────────────────────
        else if (msg.type === "hit") {
          const attacker = clients.get(id);
          if (!attacker) return;

          const targetId = String(msg.targetId || "");
          const rawDamage = Number(msg.damage) || 0;
          const damage = Math.min(50, Math.max(0, rawDamage));  // cap at 50/shot

          const target = clients.get(targetId);
          if (!target || target.state.room !== attacker.state.room) return;
          if (target.state.dead) return;

          target.state.health = Math.max(0, target.state.health - damage);

          let killed = false;
          if (target.state.health <= 0) {
            target.state.dead = true;
            killed = true;
            attacker.kills++;
            // Kill feed to everyone in the room
            broadcastAll(attacker.state.room, {
              type:        "kill_feed",
              killerName:  attacker.state.name,
              victimName:  target.state.name,
            });
          }

          // Tell attacker the hit landed
          sendTo(id, {
            type:       "hit_confirm",
            targetId,
            targetName: target.state.name,
            amount:     damage,
            killed,
          });

          // Tell target they took damage
          sendTo(targetId, { type: "damage", amount: damage, fromId: id });

          // Broadcast updated target state to room
          broadcastAll(target.state.room, { type: "state", ...target.state });
        }

        // ── RESPAWN ───────────────────────────────────────────────────────
        else if (msg.type === "respawn") {
          const client = clients.get(id);
          if (!client) return;

          const spawn = randomSpawn();
          client.state.health   = 100;
          client.state.dead     = false;
          client.state.x        = spawn.x;
          client.state.y        = spawn.y;
          client.state.z        = spawn.z;
          client.state.yaw      = spawn.yaw;

          sendTo(id, {
            type: "respawn_ack",
            x:    spawn.x,
            y:    spawn.y,
            z:    spawn.z,
          });

          broadcastAll(client.state.room, { type: "state", ...client.state });
        }

      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      const client = clients.get(id);
      if (client) {
        console.log(`[MP] ${client.state.name} left room "${client.state.room}"`);
        broadcast(client.state.room, id, { type: "player_left", id });
        clients.delete(id);
      }
    });

    ws.on("error", () => {
      clients.delete(id);
    });
  });

  console.log("[MP] Multiplayer WebSocket server ready at /ws");
}
