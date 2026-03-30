import { useEffect, useRef, useState, useCallback } from "react";
import { Engine } from "../game/Engine";
import { HUD } from "../game/HUD";
import { NetworkManager } from "../game/NetworkManager";
import type { RemotePlayerState } from "../game/NetworkManager";

type Screen = "menu" | "playing";

interface PlayerListEntry {
  id: string;
  name: string;
  health: number;
  dead: boolean;
}

const GlowText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={className} style={{ textShadow: "0 0 20px currentColor, 0 0 40px currentColor" }}>
    {children}
  </span>
);

export default function Game() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const engineRef    = useRef<Engine | null>(null);
  const netRef       = useRef<NetworkManager | null>(null);
  const myIdRef      = useRef<string | null>(null);
  const isMultiRef   = useRef(false);

  const [screen,       setScreen]       = useState<Screen>("menu");
  const [dead,         setDead]         = useState(false);
  const [locked,       setLocked]       = useState(false);
  const [connecting,   setConnecting]   = useState(false);
  const [connectError, setConnectError] = useState("");
  const [playerName,   setPlayerName]   = useState(() => localStorage.getItem("wz_name") || "");
  const [roomCode,     setRoomCode]     = useState(() => localStorage.getItem("wz_room") || "default");
  const [playerList,   setPlayerList]   = useState<PlayerListEntry[]>([]);
  const [chatLines,    setChatLines]    = useState<string[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatOpen,     setChatOpen]     = useState(false);
  const [killCount,    setKillCount]    = useState(0);

  // HUD refs
  const healthRef     = useRef<HTMLDivElement>(null);
  const ammoRef       = useRef<HTMLSpanElement>(null);
  const totalAmmoRef  = useRef<HTMLSpanElement>(null);
  const reloadRef     = useRef<HTMLDivElement>(null);
  const crosshairRef  = useRef<HTMLDivElement>(null);
  const killsRef      = useRef<HTMLSpanElement>(null);
  const waveRef       = useRef<HTMLSpanElement>(null);
  const enemyCountRef = useRef<HTMLSpanElement>(null);
  const hitMarkerRef  = useRef<HTMLDivElement>(null);
  const damageRef     = useRef<HTMLDivElement>(null);

  const addChat = useCallback((line: string) => {
    setChatLines((prev) => [...prev.slice(-29), line]);
  }, []);

  const stopGame = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    netRef.current?.disconnect();
    netRef.current = null;
    myIdRef.current = null;
    isMultiRef.current = false;
  }, []);

  const launchEngine = useCallback((
    net: NetworkManager | null,
    spawnX = 0, spawnY = 1.75, spawnZ = 10, spawnYaw = 0,
  ) => {
    if (!canvasRef.current) return;

    const hud = new HUD(
      healthRef.current, ammoRef.current, totalAmmoRef.current,
      reloadRef.current, crosshairRef.current, killsRef.current,
      waveRef.current, enemyCountRef.current, hitMarkerRef.current, damageRef.current,
    );

    const engine = new Engine(canvasRef.current, hud);
    engineRef.current = engine;

    if (net) {
      engine.onNetPlayerJoined = (p: RemotePlayerState) => {
        setPlayerList((prev) => {
          if (prev.find((x) => x.id === p.id)) return prev;
          return [...prev, { id: p.id, name: p.name, health: p.health, dead: p.dead }];
        });
        addChat(`» ${p.name} joined`);
      };
      engine.onNetPlayerLeft = (id: string) => {
        setPlayerList((prev) => {
          const p = prev.find((x) => x.id === id);
          if (p) addChat(`« ${p.name} left`);
          return prev.filter((x) => x.id !== id);
        });
      };
      engine.onNetPlayerState = (s: RemotePlayerState) => {
        setPlayerList((prev) =>
          prev.map((p) => p.id === s.id ? { ...p, health: s.health, dead: s.dead } : p),
        );
      };
      engine.onNetChat     = (_id, name, text) => addChat(`[${name}] ${text}`);
      engine.onNetKillFeed = (killerName, victimName) =>
        addChat(`☠ ${killerName} eliminated ${victimName}`);
      engine.onLocalPlayerDied      = () => {
        setKillCount(engineRef.current?.player.kills ?? 0);
        setDead(true);
      };
      engine.onLocalPlayerRespawned = () => setDead(false);

      engine.connectMultiplayer(net, spawnX, spawnY, spawnZ, spawnYaw);
    } else {
      const checkDead = setInterval(() => {
        if (engineRef.current?.player?.isDead()) {
          setKillCount(engineRef.current.player.kills);
          setDead(true);
          clearInterval(checkDead);
        }
      }, 500);
    }

    engine.start();

    const onLockChange = () => setLocked(document.pointerLockElement === canvasRef.current);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => document.removeEventListener("pointerlockchange", onLockChange);
  }, [addChat]);

  const handleSolo = useCallback(() => {
    setConnectError(""); setPlayerList([]); setChatLines([]); setDead(false);
    isMultiRef.current = false;
    setScreen("playing");
    setTimeout(() => launchEngine(null), 0);
  }, [launchEngine]);

  const handleMultiplayer = useCallback(async () => {
    const name = playerName.trim() || "Soldier";
    const room = roomCode.trim().toLowerCase() || "default";
    localStorage.setItem("wz_name", name);
    localStorage.setItem("wz_room", room);

    setConnecting(true); setConnectError("");
    const net = new NetworkManager();
    netRef.current = net;

    try {
      const { id, spawnX, spawnY, spawnZ, spawnYaw } = await net.connect(name, room);
      myIdRef.current = id;
      isMultiRef.current = true;
      setPlayerList([{ id, name, health: 100, dead: false }]);
      setChatLines([]); setDead(false);
      setScreen("playing");
      setTimeout(() => launchEngine(net, spawnX, spawnY, spawnZ, spawnYaw), 0);
    } catch {
      setConnectError("Could not reach server — try Solo mode.");
      net.disconnect(); netRef.current = null;
    } finally {
      setConnecting(false);
    }
  }, [playerName, roomCode, launchEngine]);

  const handleBackToMenu = useCallback(() => {
    stopGame(); setDead(false); setScreen("menu");
    setPlayerList([]); setChatLines([]);
  }, [stopGame]);

  const handleRespawn = useCallback(() => {
    engineRef.current?.respawnPlayer();
  }, []);

  useEffect(() => () => stopGame(), [stopGame]);

  useEffect(() => {
    if (screen !== "playing" || chatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "KeyT" && document.pointerLockElement === canvasRef.current) {
        document.exitPointerLock();
        setChatOpen(true);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, chatOpen]);

  const sendChat = () => {
    const txt = chatInput.trim();
    if (!txt || !netRef.current) return;
    netRef.current.sendChat(txt);
    setChatInput("");
  };

  const handleChatKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendChat();
    if (e.key === "Escape") setChatOpen(false);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none">
      {/* ── 3-D canvas ── */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: locked ? "none" : "default" }}
      />

      {/* ════════════════════════════════════════════
          MAIN MENU
      ════════════════════════════════════════════ */}
      {screen === "menu" && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            background: "radial-gradient(ellipse at 50% 30%, rgba(0,60,20,0.55) 0%, rgba(0,0,0,0.98) 70%)",
          }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.15) 2px,rgba(0,0,0,0.15) 4px)",
              zIndex: 1,
            }}
          />

          <div className="relative z-10 w-full max-w-lg px-6">
            {/* Hero title */}
            <div className="text-center mb-8">
              <div
                className="font-black tracking-tighter leading-none mb-1"
                style={{
                  fontSize: "clamp(3.5rem, 10vw, 5.5rem)",
                  color: "#00ff55",
                  textShadow: "0 0 30px rgba(0,255,85,0.7), 0 0 80px rgba(0,255,85,0.3)",
                }}
              >
                WAR ZONE
              </div>
              <div
                className="text-xs font-mono tracking-[0.35em] uppercase"
                style={{ color: "rgba(0,255,85,0.45)" }}
              >
                ── First Person Shooter ──
              </div>
            </div>

            {/* Controls grid */}
            <div
              className="rounded-2xl mb-5 px-5 py-4"
              style={{
                background: "rgba(0,20,8,0.7)",
                border: "1px solid rgba(0,255,85,0.12)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="text-xs font-mono tracking-[0.2em] uppercase mb-3"
                style={{ color: "rgba(0,255,85,0.5)" }}>Controls</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ["WASD", "Move"],   ["SHIFT", "Sprint"],
                  ["SPACE", "Jump"],  ["C", "Crouch"],
                  ["LMB", "Shoot"],   ["RMB", "Aim"],
                  ["R", "Reload"],    ["T", "Chat"],
                ].map(([key, action]) => (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className="font-mono text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        background: "rgba(0,255,85,0.1)",
                        border: "1px solid rgba(0,255,85,0.25)",
                        color: "#00ff55",
                        minWidth: "3.2rem",
                        textAlign: "center",
                        display: "inline-block",
                      }}
                    >
                      {key}
                    </span>
                    <span className="text-xs text-gray-400">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div
              className="rounded-2xl mb-4 px-5 py-5"
              style={{
                background: "rgba(0,20,8,0.7)",
                border: "1px solid rgba(0,255,85,0.12)",
                backdropFilter: "blur(12px)",
              }}
            >
              <label className="block text-xs font-mono tracking-widest uppercase mb-1.5"
                style={{ color: "rgba(0,255,85,0.5)" }}>Callsign</label>
              <input
                type="text"
                placeholder="e.g. Ghost"
                maxLength={20}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleMultiplayer(); }}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono text-white outline-none mb-4"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,255,85,0.2)", transition: "border-color 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(0,255,85,0.6)")}
                onBlur={(e)  => (e.target.style.borderColor = "rgba(0,255,85,0.2)")}
              />

              <label className="block text-xs font-mono tracking-widest uppercase mb-1.5"
                style={{ color: "rgba(0,255,85,0.5)" }}>Room Code</label>
              <input
                type="text"
                placeholder="e.g. squad1"
                maxLength={16}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleMultiplayer(); }}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(0,255,85,0.2)", transition: "border-color 0.2s" }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(0,255,85,0.6)")}
                onBlur={(e)  => (e.target.style.borderColor = "rgba(0,255,85,0.2)")}
              />

              {connectError && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: "rgba(200,0,0,0.15)", border: "1px solid rgba(200,0,0,0.3)" }}>
                  <span className="text-red-400 text-xs">⚠</span>
                  <span className="text-red-400 text-xs font-mono">{connectError}</span>
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleSolo}
                className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-[0.12em] uppercase"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "#bbb",
                  border: "1px solid rgba(255,255,255,0.14)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.color = "#fff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.color = "#bbb";
                }}
              >
                ⚔ Solo
              </button>
              <button
                onClick={handleMultiplayer}
                disabled={connecting}
                className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-[0.12em] uppercase"
                style={{
                  background: connecting
                    ? "rgba(0,130,45,0.35)"
                    : "linear-gradient(135deg, #00dd44 0%, #008f2b 100%)",
                  color: "white",
                  border: connecting ? "1px solid rgba(0,200,60,0.2)" : "1px solid rgba(0,255,85,0.4)",
                  cursor: connecting ? "wait" : "pointer",
                  boxShadow: connecting ? "none" : "0 4px 24px rgba(0,200,60,0.4)",
                }}
                onMouseEnter={(e) => { if (!connecting) e.currentTarget.style.filter = "brightness(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
              >
                {connecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white"
                      style={{ animation: "spin 0.8s linear infinite" }} />
                    Connecting…
                  </span>
                ) : "🌐 Multiplayer"}
              </button>
            </div>

            <div className="mt-4 text-center text-xs font-mono tracking-wider"
              style={{ color: "rgba(255,255,255,0.15)" }}>
              v1.0 · War Zone FPS
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          IN-GAME HUD
      ════════════════════════════════════════════ */}
      {screen === "playing" && !dead && (
        <>
          {/* Damage vignette */}
          <div
            ref={damageRef as any}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, transparent 35%, rgba(255,0,0,0.85) 100%)",
              opacity: 0,
              transition: "opacity 0.08s",
            }}
          />

          {/* Crosshair */}
          <div ref={crosshairRef as any} className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-7 h-7">
              <div className="absolute top-0    left-1/2 -translate-x-1/2 w-px h-2.5 bg-white/85" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-2.5 bg-white/85" />
              <div className="absolute left-0   top-1/2  -translate-y-1/2  h-px w-2.5 bg-white/85" />
              <div className="absolute right-0  top-1/2  -translate-y-1/2  h-px w-2.5 bg-white/85" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-0.5 h-0.5 rounded-full bg-white/60" />
              </div>
            </div>
          </div>

          {/* Hit marker */}
          <div
            ref={hitMarkerRef as any}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: 0 }}
          >
            <div className="relative w-9 h-9">
              <div className="absolute top-1/2 left-0    -translate-y-1/2 w-2.5 h-0.5 bg-red-400" style={{ filter: "drop-shadow(0 0 4px #ff4444)" }} />
              <div className="absolute top-1/2 right-0   -translate-y-1/2 w-2.5 h-0.5 bg-red-400" style={{ filter: "drop-shadow(0 0 4px #ff4444)" }} />
              <div className="absolute left-1/2 top-0    -translate-x-1/2 w-0.5 h-2.5 bg-red-400" style={{ filter: "drop-shadow(0 0 4px #ff4444)" }} />
              <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-0.5 h-2.5 bg-red-400" style={{ filter: "drop-shadow(0 0 4px #ff4444)" }} />
            </div>
          </div>

          {/* Bottom HUD bar */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-6 pb-5 pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
              paddingTop: "4rem",
            }}
          >
            {/* Health */}
            <div className="font-mono">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs tracking-widest uppercase" style={{ color: "rgba(0,255,85,0.6)" }}>Health</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-red-400 text-lg font-bold">♥</span>
                <div ref={healthRef as any} className="text-3xl font-black text-white leading-none">100</div>
              </div>
              <div className="rounded-full overflow-hidden"
                style={{ width: "10rem", height: "6px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div
                  id="health-bar"
                  className="h-full rounded-full"
                  style={{ width: "100%", background: "#00ff55", transition: "width 0.15s ease, background 0.3s ease", boxShadow: "0 0 8px rgba(0,255,85,0.6)" }}
                />
              </div>
            </div>

            {/* Center hint */}
            <div className="hidden lg:block text-center font-mono text-xs tracking-wider"
              style={{ color: "rgba(255,255,255,0.2)" }}>
              WASD · SHIFT · SPACE · C · R · RMB
            </div>

            {/* Ammo */}
            <div className="font-mono text-right">
              <div className="text-xs tracking-widest uppercase mb-1.5" style={{ color: "rgba(0,255,85,0.6)" }}>Ammo</div>
              <div className="flex items-baseline gap-1.5 justify-end mb-1">
                <span ref={ammoRef as any} className="text-3xl font-black text-white leading-none">30</span>
                <span className="text-base font-bold" style={{ color: "rgba(255,255,255,0.3)" }}>/</span>
                <span ref={totalAmmoRef as any} className="text-base font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>90</span>
              </div>
              <div
                ref={reloadRef as any}
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: "#fbbf24", opacity: 0, transition: "opacity 0.1s", textShadow: "0 0 12px rgba(251,191,36,0.8)" }}
              >
                ↻ RELOADING
              </div>
            </div>
          </div>

          {/* Top-left: Kills */}
          <div
            className="absolute top-5 left-5 font-mono pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              borderRadius: "0.75rem",
              padding: "0.5rem 1rem",
            }}
          >
            <div className="text-xs tracking-widest uppercase mb-0.5" style={{ color: "rgba(0,255,85,0.5)" }}>Kills</div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: "rgba(0,255,85,0.7)" }}>✕</span>
              <span ref={killsRef as any} className="text-xl font-black" style={{ color: "#00ff55" }}>0</span>
            </div>
          </div>

          {/* Top-right: Wave + Enemies */}
          <div
            className="absolute top-5 right-5 font-mono text-right pointer-events-none"
            style={{
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              borderRadius: "0.75rem",
              padding: "0.5rem 1rem",
            }}
          >
            <div className="text-xs tracking-widest uppercase mb-0.5" style={{ color: "rgba(255,190,0,0.5)" }}>Wave</div>
            <span ref={waveRef as any} className="text-xl font-black text-yellow-400">1</span>
            <div className="text-xs tracking-widest uppercase mt-2 mb-0.5" style={{ color: "rgba(255,80,80,0.5)" }}>Enemies</div>
            <span ref={enemyCountRef as any} className="text-xl font-black text-red-400">0</span>
          </div>

          {/* Multiplayer scoreboard */}
          {playerList.length > 0 && isMultiRef.current && (
            <div
              className="absolute pointer-events-none"
              style={{
                top: "5rem",
                left: "1.25rem",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(8px)",
                borderRadius: "0.75rem",
                padding: "0.6rem 0.9rem",
                minWidth: "11rem",
              }}
            >
              <div className="text-xs font-mono tracking-widest uppercase mb-2" style={{ color: "rgba(0,255,85,0.5)" }}>
                Players
              </div>
              {playerList.map((p) => (
                <div key={p.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
                  <span
                    className="text-xs font-mono truncate"
                    style={{ maxWidth: "7rem", color: p.id === myIdRef.current ? "#00ff55" : "#ccc", opacity: p.dead ? 0.35 : 1 }}
                  >
                    {p.id === myIdRef.current ? "▶ " : "· "}{p.name}
                  </span>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: "4px", background: "rgba(255,255,255,0.1)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(0, p.health)}%`,
                        background: p.health > 50 ? "#22cc55" : p.health > 25 ? "#ffaa00" : "#cc2222",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Chat feed */}
          {chatLines.length > 0 && !chatOpen && (
            <div
              className="absolute pointer-events-none font-mono"
              style={{ bottom: "6.5rem", left: "1.5rem", maxWidth: "22rem" }}
            >
              {chatLines.slice(-5).map((line, i) => (
                <div key={i} className="text-xs leading-5 truncate"
                  style={{ color: "rgba(255,255,255,0.65)", textShadow: "0 1px 4px #000" }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Chat input */}
          {chatOpen && (
            <div className="absolute font-mono"
              style={{ bottom: "6.5rem", left: "1.5rem", width: "22rem", zIndex: 100 }}>
              <div className="mb-2 max-h-36 overflow-y-auto rounded-xl p-2.5"
                style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(0,255,85,0.15)" }}>
                {chatLines.slice(-12).map((line, i) => (
                  <div key={i} className="text-xs text-white leading-5 truncate">{line}</div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  maxLength={200}
                  placeholder="Say something…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKey}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-mono text-white outline-none"
                  style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(0,255,85,0.35)" }}
                />
                <button
                  onClick={sendChat}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-white"
                  style={{ background: "linear-gradient(135deg,#00cc44,#009933)", border: "1px solid rgba(0,255,85,0.4)", cursor: "pointer" }}
                >
                  Send
                </button>
              </div>
              <div className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>Enter to send · Esc to close</div>
            </div>
          )}

          {/* Mouse-lock overlay — onClick must be here, not on the canvas,
              because this div sits on top and intercepts all pointer events */}
          {!locked && !chatOpen && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(2px)", cursor: "pointer" }}
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                try {
                  // Try with unadjustedMovement for better accuracy (Chrome 88+)
                  (canvas.requestPointerLock as any)({ unadjustedMovement: true });
                } catch {
                  canvas.requestPointerLock();
                }
              }}
            >
              <div className="text-center" style={{ pointerEvents: "none" }}>
                <div
                  className="text-4xl font-black mb-4"
                  style={{ color: "#00ff55", textShadow: "0 0 30px rgba(0,255,85,0.7)" }}
                >
                  WAR ZONE
                </div>
                <div
                  className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-base tracking-wider uppercase"
                  style={{
                    background: "linear-gradient(135deg,#00cc44,#009933)",
                    color: "white",
                    boxShadow: "0 4px 28px rgba(0,200,60,0.55)",
                  }}
                >
                  <span>🖱</span> Click to Play
                </div>
                <div className="mt-3 text-sm font-mono" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Click anywhere to capture mouse
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════
          DEATH SCREEN
      ════════════════════════════════════════════ */}
      {dead && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: "radial-gradient(ellipse at center, rgba(80,0,0,0.6) 0%, rgba(0,0,0,0.92) 70%)", backdropFilter: "blur(3px)" }}
        >
          <div className="text-center font-mono">
            <div
              className="font-black mb-1 leading-none"
              style={{
                fontSize: "clamp(3rem, 10vw, 5.5rem)",
                color: "#ff2222",
                textShadow: "0 0 40px rgba(255,30,30,0.8), 0 0 100px rgba(255,0,0,0.3)",
              }}
            >
              YOU DIED
            </div>
            <div className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.4)" }}>
              {isMultiRef.current ? "You were eliminated from the battlefield." : "Better luck next time, soldier."}
            </div>

            {/* Stats card */}
            <div
              className="inline-flex items-center gap-8 px-8 py-4 rounded-2xl mb-8"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div>
                <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(0,255,85,0.5)" }}>Kills</div>
                <GlowText className="text-3xl font-black text-green-400">{killCount}</GlowText>
              </div>
              <div style={{ width: "1px", height: "2.5rem", background: "rgba(255,255,255,0.1)" }} />
              <div>
                <div className="text-xs tracking-widest uppercase mb-1" style={{ color: "rgba(255,200,0,0.5)" }}>Mode</div>
                <span className="text-xl font-bold text-yellow-400">
                  {isMultiRef.current ? "PvP" : "Solo"}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 justify-center">
              {isMultiRef.current && (
                <button
                  onClick={handleRespawn}
                  className="px-8 py-3.5 rounded-xl font-bold text-sm tracking-[0.12em] uppercase"
                  style={{
                    background: "linear-gradient(135deg,#00dd44,#008f2b)",
                    color: "white",
                    border: "1px solid rgba(0,255,85,0.4)",
                    cursor: "pointer",
                    boxShadow: "0 4px 24px rgba(0,200,60,0.4)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
                >
                  ↺ Respawn
                </button>
              )}
              <button
                onClick={handleBackToMenu}
                className="px-8 py-3.5 rounded-xl font-bold text-sm tracking-[0.12em] uppercase"
                style={{
                  background: "rgba(180,20,20,0.35)",
                  color: "#ff8888",
                  border: "1px solid rgba(200,0,0,0.35)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(180,20,20,0.55)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(180,20,20,0.35)"; }}
              >
                ← Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
