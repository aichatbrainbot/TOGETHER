import { getPaletteForSlot } from './constants.js';
import {
  INPUT_BITS,
  LEVEL_CHAMBER_01,
  type LevelDefinition,
  PHYSICS,
  type Rect,
  getSpawnPositionForSlot,
} from './level.js';

export type SimEventType =
  | 'jump'
  | 'land'
  | 'switch_on'
  | 'bridge_on'
  | 'bridge_lock'
  | 'door_unlock'
  | 'respawn'
  | 'level_complete';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  color?: string;
  playerId?: string;
}

export interface SimPlayerState {
  id: string;
  displayName: string;
  slot: number;
  color: string;
  badge: string;
  isSoloPuppet: boolean;
  connected: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  standingOnId: string | null;
  coyoteTicks: number;
  jumpBufferTicks: number;
  prevJumpDown: boolean;
  invulnTicks: number;
  atExit: boolean;
  lastProcessedSeq: number;
}

export interface SwitchRuntimeState {
  id: string;
  pressed: boolean;
  latched: boolean;
}

export interface BridgeRuntimeState {
  id: string;
  active: boolean;
  locked: boolean;
}

export interface ExitDoorRuntimeState {
  unlocked: boolean;
  chargeTicks: number;
  chargeRequired: number;
  playersInside: number;
  playersRequired: number;
  exitHoldTicks: number;
}

export interface GameWorldState {
  levelId: string;
  tick: number;
  elapsedMs: number;
  soloPractice: boolean;
  soloActiveId: string | null;
  status: 'playing' | 'completed';
  completionTimeMs: number | null;
  respawnCount: number;
  players: SimPlayerState[];
  switches: SwitchRuntimeState[];
  bridges: BridgeRuntimeState[];
  exitDoor: ExitDoorRuntimeState;
}

export interface SimPlayerSeed {
  id: string;
  displayName: string;
  slot: number;
  connected: boolean;
  isSoloPuppet?: boolean;
}

export interface PlayerTickInput {
  buttons: number;
  seq?: number;
}

export const SOLO_PUPPET_ID = '__solo_partner__';

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerRect(p: { x: number; y: number }): { x: number; y: number; w: number; h: number } {
  return {
    x: p.x,
    y: p.y,
    w: PHYSICS.PLAYER_WIDTH,
    h: PHYSICS.PLAYER_HEIGHT,
  };
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function createPlayerEntity(level: LevelDefinition, seed: SimPlayerSeed): SimPlayerState {
  const palette = getPaletteForSlot(seed.slot);
  const spawn = getSpawnPositionForSlot(level, seed.slot);
  return {
    id: seed.id,
    displayName: seed.displayName,
    slot: seed.slot,
    color: palette.color,
    badge: palette.badge,
    isSoloPuppet: Boolean(seed.isSoloPuppet),
    connected: seed.connected,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    standingOnId: null,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    prevJumpDown: false,
    invulnTicks: 0,
    atExit: false,
    lastProcessedSeq: 0,
  };
}

export function createGameWorld(
  seeds: readonly SimPlayerSeed[],
  options: { level?: LevelDefinition; soloPractice?: boolean } = {},
): GameWorldState {
  const level = options.level ?? LEVEL_CHAMBER_01;
  const soloPractice = Boolean(options.soloPractice);

  const players = seeds.map((s) => createPlayerEntity(level, s));
  if (soloPractice && players.length === 1) {
    const owner = players[0]!;
    const puppetSlot = owner.slot === 0 ? 1 : 0;
    players.push(
      createPlayerEntity(level, {
        id: SOLO_PUPPET_ID,
        displayName: 'Partner (Solo)',
        slot: puppetSlot,
        connected: true,
        isSoloPuppet: true,
      }),
    );
  }

  const activeCount = players.filter((p) => p.connected).length;

  return {
    levelId: level.id,
    tick: 0,
    elapsedMs: 0,
    soloPractice,
    soloActiveId: soloPractice ? (players[0]?.id ?? null) : null,
    status: 'playing',
    completionTimeMs: null,
    respawnCount: 0,
    players,
    switches: level.switches.map((sw) => ({
      id: sw.id,
      pressed: false,
      latched: false,
    })),
    bridges: level.bridges.map((br) => ({
      id: br.id,
      active: false,
      locked: false,
    })),
    exitDoor: {
      unlocked: false,
      chargeTicks: 0,
      chargeRequired: PHYSICS.VAULT_CHARGE_TICKS,
      playersInside: 0,
      playersRequired: Math.max(1, activeCount),
      exitHoldTicks: 0,
    },
  };
}

export function cloneGameWorld(world: GameWorldState): GameWorldState {
  return {
    ...world,
    players: world.players.map((p) => ({ ...p })),
    switches: world.switches.map((s) => ({ ...s })),
    bridges: world.bridges.map((b) => ({ ...b })),
    exitDoor: { ...world.exitDoor },
  };
}

function getSolidRects(level: LevelDefinition, world: GameWorldState): Rect[] {
  const solids: Rect[] = [...level.solids];
  for (let i = 0; i < level.bridges.length; i += 1) {
    const def = level.bridges[i]!;
    const state = world.bridges[i];
    if (state?.active) {
      solids.push(def);
    }
  }
  return solids;
}

function resolveHorizontalSolids(p: SimPlayerState, solids: readonly Rect[]): void {
  const box = playerRect(p);
  for (const solid of solids) {
    if (!rectsOverlap(box, solid)) continue;
    const overlapLeft = box.x + box.w - solid.x;
    const overlapRight = solid.x + solid.w - box.x;
    if (overlapLeft < overlapRight) {
      p.x = solid.x - box.w;
    } else {
      p.x = solid.x + solid.w;
    }
    p.vx = 0;
    box.x = p.x;
  }
}

/**
 * Advances the entire cooperative world by exactly one deterministic tick (1/60 s).
 * Mutates `world` in place and returns discrete gameplay events triggered during this tick.
 */
export function stepGameWorld(
  world: GameWorldState,
  inputsByPlayerId: Readonly<Record<string, PlayerTickInput | undefined>>,
  level: LevelDefinition = LEVEL_CHAMBER_01,
): SimEvent[] {
  const events: SimEvent[] = [];

  if (world.status === 'completed') {
    return events;
  }

  const dt = PHYSICS.DT;
  world.tick += 1;
  world.elapsedMs = Math.round(world.tick * dt * 1000);

  const activePlayers = world.players.filter((p) => p.connected);
  const solids = getSolidRects(level, world);

  // Record previous tick standing relationships for smooth horizontal head-carry.
  const prevStandingOn = new Map<string, string | null>();
  const prevX = new Map<string, number>();
  const prevGrounded = new Map<string, boolean>();
  for (const p of activePlayers) {
    prevStandingOn.set(p.id, p.standingOnId);
    prevX.set(p.id, p.x);
    prevGrounded.set(p.id, p.grounded);
  }

  // 1. Apply validated player inputs, coyote time, jump buffer, and gravity
  for (const p of activePlayers) {
    if (p.invulnTicks > 0) p.invulnTicks -= 1;

    const input = inputsByPlayerId[p.id];
    const buttons = input ? input.buttons : 0;
    if (input?.seq !== undefined && input.seq > p.lastProcessedSeq) {
      p.lastProcessedSeq = input.seq;
    }

    const moveLeft = (buttons & INPUT_BITS.LEFT) !== 0;
    const moveRight = (buttons & INPUT_BITS.RIGHT) !== 0;
    const jumpDown = (buttons & INPUT_BITS.JUMP) !== 0;
    const jumpJustPressed = jumpDown && !p.prevJumpDown;
    const jumpJustReleased = !jumpDown && p.prevJumpDown;
    p.prevJumpDown = jumpDown;

    const dir = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    if (dir !== 0) {
      p.facing = dir > 0 ? 1 : -1;
    }

    const targetVx = dir * PHYSICS.MOVE_SPEED;
    const accel = p.grounded
      ? dir !== 0
        ? PHYSICS.GROUND_ACCEL
        : PHYSICS.GROUND_FRICTION
      : dir !== 0
        ? PHYSICS.AIR_ACCEL
        : PHYSICS.AIR_FRICTION;

    p.vx = moveToward(p.vx, targetVx, accel * dt);

    if (p.grounded) {
      p.coyoteTicks = PHYSICS.COYOTE_TICKS;
    } else if (p.coyoteTicks > 0) {
      p.coyoteTicks -= 1;
    }

    if (jumpJustPressed) {
      p.jumpBufferTicks = PHYSICS.JUMP_BUFFER_TICKS;
    } else if (p.jumpBufferTicks > 0) {
      p.jumpBufferTicks -= 1;
    }

    if (p.jumpBufferTicks > 0 && p.coyoteTicks > 0) {
      p.vy = PHYSICS.JUMP_VELOCITY;
      p.grounded = false;
      p.standingOnId = null;
      p.coyoteTicks = 0;
      p.jumpBufferTicks = 0;
      events.push({
        type: 'jump',
        x: p.x + PHYSICS.PLAYER_WIDTH / 2,
        y: p.y + PHYSICS.PLAYER_HEIGHT,
        color: p.color,
        playerId: p.id,
      });
    } else if (jumpJustReleased && p.vy < PHYSICS.JUMP_CUT_THRESHOLD) {
      p.vy *= PHYSICS.JUMP_CUT_MULTIPLIER;
    }

    p.vy = Math.min(PHYSICS.MAX_FALL_SPEED, p.vy + PHYSICS.GRAVITY * dt);
  }

  // 2. Horizontal movement in bottom-to-top order so stacked riders inherit horizontal carry smoothly
  const bottomToTop = [...activePlayers].sort(
    (a, b) => b.y - a.y || a.slot - b.slot || a.id.localeCompare(b.id),
  );
  const deltaXById = new Map<string, number>();

  for (const p of bottomToTop) {
    const startX = p.x;
    const carrierId = prevStandingOn.get(p.id);
    const carryDx = carrierId ? (deltaXById.get(carrierId) ?? 0) : 0;

    p.x += p.vx * dt + carryDx;
    resolveHorizontalSolids(p, solids);
    deltaXById.set(p.id, p.x - startX);
  }

  // 3. Gentle horizontal player-vs-player body separation (only when genuinely overlapping vertically > 4 px)
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < bottomToTop.length; i += 1) {
      for (let j = i + 1; j < bottomToTop.length; j += 1) {
        const a = bottomToTop[i]!;
        const b = bottomToTop[j]!;
        const overlapY =
          Math.min(a.y + PHYSICS.PLAYER_HEIGHT, b.y + PHYSICS.PLAYER_HEIGHT) - Math.max(a.y, b.y);
        if (overlapY <= 4) continue;

        const overlapX =
          Math.min(a.x + PHYSICS.PLAYER_WIDTH, b.x + PHYSICS.PLAYER_WIDTH) - Math.max(a.x, b.x);
        if (overlapX <= 0) continue;

        const halfPush = overlapX / 2 + 0.01;
        const aCenter = a.x + PHYSICS.PLAYER_WIDTH / 2;
        const bCenter = b.x + PHYSICS.PLAYER_WIDTH / 2;
        const dir = aCenter < bCenter || (aCenter === bCenter && a.slot < b.slot) ? -1 : 1;

        a.x += dir * halfPush;
        b.x -= dir * halfPush;
        resolveHorizontalSolids(a, solids);
        resolveHorizontalSolids(b, solids);
      }
    }
  }

  // 4. Vertical movement + solid surfaces + bottom-to-top head stacking
  const settled: SimPlayerState[] = [];
  for (const p of bottomToTop) {
    const prevTop = p.y;
    const prevBottom = p.y + PHYSICS.PLAYER_HEIGHT;

    p.grounded = false;
    p.standingOnId = null;
    p.y += p.vy * dt;

    // Resolve against solid level geometry & active bridges
    const box = playerRect(p);
    for (const solid of solids) {
      if (!rectsOverlap(box, solid)) continue;
      if (p.vy >= 0 && prevBottom <= solid.y + 8) {
        p.y = solid.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
        p.grounded = true;
      } else if (p.vy < 0 && prevTop >= solid.y + solid.h - 8) {
        p.y = solid.y + solid.h;
        p.vy = 0;
      } else {
        // Fallback minimum push out (e.g. bridge materialized around feet)
        const pushUp = box.y + box.h - solid.y;
        const pushDown = solid.y + solid.h - box.y;
        if (pushUp <= pushDown) {
          p.y = solid.y - PHYSICS.PLAYER_HEIGHT;
          if (p.vy > 0) p.vy = 0;
          p.grounded = true;
        } else {
          p.y = solid.y + solid.h;
          if (p.vy < 0) p.vy = 0;
        }
      }
      box.y = p.y;
    }

    // Resolve vertical stacking on already-settled lower players
    for (const other of settled) {
      const horizOverlap =
        p.x + PHYSICS.PLAYER_WIDTH > other.x + 2 && p.x < other.x + PHYSICS.PLAYER_WIDTH - 2;
      if (!horizOverlap) continue;

      // Landing on top of another player's head
      if (p.vy >= 0 && prevBottom <= other.y + 8 && p.y + PHYSICS.PLAYER_HEIGHT >= other.y) {
        p.y = other.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = Math.min(0, other.vy);
        p.grounded = true;
        p.standingOnId = other.id;
      } else if (
        // Rising into the underside of a player above
        p.vy < 0 &&
        prevTop >= other.y + PHYSICS.PLAYER_HEIGHT - 8 &&
        p.y <= other.y + PHYSICS.PLAYER_HEIGHT
      ) {
        p.y = other.y + PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
      }
    }

    if (p.grounded && !prevGrounded.get(p.id)) {
      events.push({
        type: 'land',
        x: p.x + PHYSICS.PLAYER_WIDTH / 2,
        y: p.y + PHYSICS.PLAYER_HEIGHT,
        color: p.color,
        playerId: p.id,
      });
    }

    settled.push(p);
  }

  // 5. Evaluate hazards & void respawn
  for (const p of activePlayers) {
    const box = playerRect(p);
    const fellOut = p.y > level.height + 24;
    const hitHazard = level.hazards.some((h) => rectsOverlap(box, h));
    if (fellOut || hitHazard) {
      const spawn = getSpawnPositionForSlot(level, p.slot);
      events.push({
        type: 'respawn',
        x: p.x + PHYSICS.PLAYER_WIDTH / 2,
        y: Math.min(p.y + PHYSICS.PLAYER_HEIGHT / 2, level.height - 16),
        color: p.color,
        playerId: p.id,
      });
      p.x = spawn.x;
      p.y = spawn.y;
      p.vx = 0;
      p.vy = 0;
      p.grounded = false;
      p.standingOnId = null;
      p.invulnTicks = PHYSICS.RESPAWN_INVULN_TICKS;
      world.respawnCount += 1;
    }
  }

  // 6. Evaluate switches (hold, latch, and dual vault plates)
  for (let i = 0; i < level.switches.length; i += 1) {
    const def = level.switches[i]!;
    const state = world.switches[i]!;
    const triggerZone: Rect = {
      x: def.x - 1,
      y: def.y - 3,
      w: def.w + 2,
      h: def.h + 5,
    };

    const wasPressed = state.pressed;
    const wasLatched = state.latched;
    const nowPressed = activePlayers.some((p) => rectsOverlap(playerRect(p), triggerZone));

    state.pressed = nowPressed;
    if (def.kind === 'latch' && nowPressed) {
      state.latched = true;
    }

    if (nowPressed && !wasPressed) {
      events.push({
        type: def.kind === 'latch' && !wasLatched ? 'bridge_lock' : 'switch_on',
        x: def.x + def.w / 2,
        y: def.y,
        color: def.accent === 'mint' ? '#54D6C5' : '#8B72FF',
      });
    }
  }

  // 7. Update bridges from linked switches
  const switchById = new Map(world.switches.map((s) => [s.id, s]));
  for (let i = 0; i < level.bridges.length; i += 1) {
    const def = level.bridges[i]!;
    const state = world.bridges[i]!;
    const wasActive = state.active;
    const holdSw = switchById.get(def.poweredBySwitchId);
    const lockSw = switchById.get(def.latchedBySwitchId);

    state.locked = Boolean(lockSw?.latched);
    state.active = Boolean(holdSw?.pressed || state.locked);

    if (state.active && !wasActive) {
      events.push({
        type: 'bridge_on',
        x: def.x + def.w / 2,
        y: def.y,
        color: state.locked ? '#54D6C5' : '#8B72FF',
      });
    }
  }

  // 8. Evaluate simultaneous dual vault pressure plates -> Exit Door unlock
  const vaultSwitches = level.switches
    .filter((sw) => sw.kind === 'vault')
    .map((sw) => switchById.get(sw.id));

  if (!world.exitDoor.unlocked && vaultSwitches.length > 0) {
    const allVaultPressed = vaultSwitches.every((sw) => sw?.pressed);
    if (allVaultPressed) {
      world.exitDoor.chargeTicks = Math.min(
        world.exitDoor.chargeRequired,
        world.exitDoor.chargeTicks + 1,
      );
      if (world.exitDoor.chargeTicks >= world.exitDoor.chargeRequired) {
        world.exitDoor.unlocked = true;
        events.push({
          type: 'door_unlock',
          x: level.exitDoor.x + level.exitDoor.w / 2,
          y: level.exitDoor.y + level.exitDoor.h / 2,
          color: '#54D6C5',
        });
      }
    } else if (world.exitDoor.chargeTicks > 0) {
      world.exitDoor.chargeTicks -= 1;
    }
  }

  // 9. Evaluate exit door win condition (all active connected players at unlocked exit)
  let insideCount = 0;
  for (const p of world.players) {
    if (!p.connected) {
      p.atExit = false;
      continue;
    }
    p.atExit = world.exitDoor.unlocked && rectsOverlap(playerRect(p), level.exitDoor);
    if (p.atExit) insideCount += 1;
  }

  world.exitDoor.playersInside = insideCount;
  world.exitDoor.playersRequired = Math.max(1, activePlayers.length);

  if (
    world.exitDoor.unlocked &&
    activePlayers.length > 0 &&
    insideCount === activePlayers.length
  ) {
    world.exitDoor.exitHoldTicks += 1;
    if (world.exitDoor.exitHoldTicks >= PHYSICS.EXIT_HOLD_TICKS) {
      world.status = 'completed';
      world.completionTimeMs = world.elapsedMs;
      events.push({
        type: 'level_complete',
        x: level.exitDoor.x + level.exitDoor.w / 2,
        y: level.exitDoor.y + level.exitDoor.h / 2,
        color: '#54D6C5',
      });
    }
  } else {
    world.exitDoor.exitHoldTicks = 0;
  }

  return events;
}
