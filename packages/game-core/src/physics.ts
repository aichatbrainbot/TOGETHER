import { type ChallengeModifier, getPaletteForSlot } from './constants.js';
import {
  LEVEL_CHAMBER_01,
  computeMedal,
  getSpawnPositionForSlot,
} from './levels/index.js';
import {
  type BridgeRuntimeState,
  type CrateRuntimeState,
  type CrumbleRuntimeState,
  type GameWorldState,
  INPUT_BITS,
  type KeyRuntimeState,
  type LaserRuntimeState,
  type LevelDefinition,
  type LockedGateRuntimeState,
  type MovingPlatformRuntimeState,
  PHYSICS,
  type PlayerContribution,
  type Rect,
  type SimEvent,
  type SimPlayerState,
} from './types.js';

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

function crateRect(c: CrateRuntimeState): { x: number; y: number; w: number; h: number } {
  return { x: c.x, y: c.y, w: c.w, h: c.h };
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function ensureContribution(world: GameWorldState, playerId: string): PlayerContribution {
  let c = world.contributions[playerId];
  if (!c) {
    c = { switchesTriggered: 0, keysCollected: 0, respawns: 0 };
    world.contributions[playerId] = c;
  }
  return c;
}

function getRespawnPoint(
  level: LevelDefinition,
  world: GameWorldState,
  slot: number,
): { x: number; y: number } {
  if (world.activeCheckpointId && level.checkpoints) {
    const cp = level.checkpoints.find((c) => c.id === world.activeCheckpointId);
    if (cp) {
      const clampedSlot = Math.max(0, Math.min(7, slot));
      return {
        x: Math.min(level.width - 48, cp.spawnX + (clampedSlot % 4) * 14),
        y: cp.spawnFloorY - PHYSICS.PLAYER_HEIGHT,
      };
    }
  }
  return getSpawnPositionForSlot(level, slot);
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
    standingOnPlatformId: null,
    standingOnCrateId: null,
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
  options: {
    level?: LevelDefinition;
    soloPractice?: boolean;
    modifier?: ChallengeModifier;
  } = {},
): GameWorldState {
  const level = options.level ?? LEVEL_CHAMBER_01;
  const soloPractice = Boolean(options.soloPractice);
  const modifier: ChallengeModifier = options.modifier ?? 'standard';

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
  const contributions: Record<string, PlayerContribution> = {};
  for (const p of players) {
    contributions[p.id] = { switchesTriggered: 0, keysCollected: 0, respawns: 0 };
  }

  const movingPlatforms: MovingPlatformRuntimeState[] = level.movingPlatforms.map((mp) => {
    const phase = mp.phaseOffset ?? 0;
    const t = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    return {
      id: mp.id,
      x: mp.startX + (mp.endX - mp.startX) * t,
      y: mp.startY + (mp.endY - mp.startY) * t,
      dx: 0,
      dy: 0,
      w: mp.w,
      h: mp.h,
      progress: phase,
      active: !mp.poweredBySwitchId,
    };
  });

  const crumblePlatforms: CrumbleRuntimeState[] = (level.crumblePlatforms ?? []).map((cp) => ({
    id: cp.id,
    state: 'solid',
    timerTicks: 0,
  }));

  const lasers: LaserRuntimeState[] = (level.lasers ?? []).map((l) => ({
    id: l.id,
    active: true,
  }));

  const crates: CrateRuntimeState[] = level.crates.map((cr) => ({
    id: cr.id,
    x: cr.x,
    y: cr.y,
    vx: 0,
    vy: 0,
    w: cr.w,
    h: cr.h,
    requiredPushers: cr.requiredPushers,
    activePushers: 0,
    grounded: false,
    standingOnPlatformId: null,
  }));

  const keys: KeyRuntimeState[] = level.keys.map((k) => ({
    id: k.id,
    x: k.x,
    y: k.y,
    carrierPlayerId: null,
    used: false,
  }));

  const lockedGates: LockedGateRuntimeState[] = level.lockedGates.map((g) => ({
    id: g.id,
    unlocked: false,
  }));

  return {
    levelId: level.id,
    proceduralSeed: level.proceduralSeed ?? null,
    modifier,
    tick: 0,
    elapsedMs: 0,
    soloPractice,
    soloActiveId: soloPractice ? (players[0]?.id ?? null) : null,
    status: 'playing',
    completionTimeMs: null,
    medal: null,
    respawnCount: 0,
    activeCheckpointId: null,
    players,
    switches: level.switches.map((sw) => ({
      id: sw.id,
      pressed: false,
      latched: false,
      remainingTicks: 0,
      maxTicks: sw.durationTicks ?? 0,
    })),
    bridges: level.bridges.map((br) => ({
      id: br.id,
      active: false,
      locked: false,
      remainingTicks: 0,
      maxTicks: 0,
    })),
    movingPlatforms,
    crumblePlatforms,
    lasers,
    crates,
    keys,
    lockedGates,
    exitDoor: {
      unlocked: !level.requiresVaultSwitches,
      chargeTicks: 0,
      chargeRequired: PHYSICS.VAULT_CHARGE_TICKS,
      playersInside: 0,
      playersRequired: Math.max(1, activeCount),
      exitHoldTicks: 0,
    },
    contributions,
  };
}

export function cloneGameWorld(world: GameWorldState): GameWorldState {
  return {
    ...world,
    players: world.players.map((p) => ({ ...p })),
    switches: world.switches.map((s) => ({ ...s })),
    bridges: world.bridges.map((b) => ({ ...b })),
    movingPlatforms: world.movingPlatforms.map((m) => ({ ...m })),
    crumblePlatforms: world.crumblePlatforms.map((c) => ({ ...c })),
    lasers: world.lasers.map((l) => ({ ...l })),
    crates: world.crates.map((c) => ({ ...c })),
    keys: world.keys.map((k) => ({ ...k })),
    lockedGates: world.lockedGates.map((g) => ({ ...g })),
    exitDoor: { ...world.exitDoor },
    contributions: Object.fromEntries(
      Object.entries(world.contributions).map(([k, v]) => [k, { ...v }]),
    ),
  };
}

function getStaticSolidRects(level: LevelDefinition, world: GameWorldState): Rect[] {
  const solids: Rect[] = [...level.solids];
  for (let i = 0; i < level.bridges.length; i += 1) {
    const def = level.bridges[i]!;
    const state = world.bridges[i];
    if (state?.active) {
      solids.push(def);
    }
  }
  const crumbleDefs = level.crumblePlatforms ?? [];
  for (let i = 0; i < crumbleDefs.length; i += 1) {
    const def = crumbleDefs[i]!;
    const state = world.crumblePlatforms[i];
    if (state && state.state !== 'gone') {
      solids.push(def);
    }
  }
  for (let i = 0; i < level.lockedGates.length; i += 1) {
    const def = level.lockedGates[i]!;
    const state = world.lockedGates[i];
    if (!state?.unlocked) {
      solids.push(def);
    }
  }
  return solids;
}

function resolveBoxHorizontal(
  box: { x: number; y: number; w: number; h: number },
  solids: readonly Rect[],
): boolean {
  let hit = false;
  for (const solid of solids) {
    if (!rectsOverlap(box, solid)) continue;
    const overlapLeft = box.x + box.w - solid.x;
    const overlapRight = solid.x + solid.w - box.x;
    if (overlapLeft < overlapRight) {
      box.x = solid.x - box.w;
    } else {
      box.x = solid.x + solid.w;
    }
    hit = true;
  }
  return hit;
}

/**
 * Celeste-style upward corner correction: if a rising player clips the corner of a solid tile
 * by <= CORNER_CORRECTION_PX, nudge horizontally around the edge instead of killing jump momentum.
 */
function tryUpwardCornerCorrection(
  p: SimPlayerState,
  solid: Rect,
  allSolids: readonly Rect[],
): boolean {
  const maxNudge = PHYSICS.CORNER_CORRECTION_PX;
  // Clipping the left edge of `solid` -> try nudging left
  const clipLeft = p.x + PHYSICS.PLAYER_WIDTH - solid.x;
  if (clipLeft > 0 && clipLeft <= maxNudge) {
    const candidate = { x: solid.x - PHYSICS.PLAYER_WIDTH - 0.1, y: p.y, w: PHYSICS.PLAYER_WIDTH, h: PHYSICS.PLAYER_HEIGHT };
    if (!allSolids.some((s) => rectsOverlap(candidate, s))) {
      p.x = candidate.x;
      return true;
    }
  }
  // Clipping the right edge of `solid` -> try nudging right
  const clipRight = solid.x + solid.w - p.x;
  if (clipRight > 0 && clipRight <= maxNudge) {
    const candidate = { x: solid.x + solid.w + 0.1, y: p.y, w: PHYSICS.PLAYER_WIDTH, h: PHYSICS.PLAYER_HEIGHT };
    if (!allSolids.some((s) => rectsOverlap(candidate, s))) {
      p.x = candidate.x;
      return true;
    }
  }
  return false;
}

/**
 * Advances the cooperative world by exactly one deterministic tick (1/60 s).
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
  const baseGravity =
    world.modifier === 'low_gravity'
      ? PHYSICS.GRAVITY * PHYSICS.LOW_GRAVITY_FACTOR
      : PHYSICS.GRAVITY;

  world.tick += 1;
  world.elapsedMs = Math.round(world.tick * dt * 1000);

  const activePlayers = world.players.filter((p) => p.connected);
  const switchById = new Map(world.switches.map((s) => [s.id, s]));

  const prevStandingOn = new Map<string, string | null>();
  const prevStandingOnCrate = new Map<string, string | null>();
  const prevGrounded = new Map<string, boolean>();
  for (const p of activePlayers) {
    prevStandingOn.set(p.id, p.standingOnId);
    prevStandingOnCrate.set(p.id, p.standingOnCrateId);
    prevGrounded.set(p.id, p.grounded);
  }

  // 1. Advance Crumbling Platforms timers
  const crumbleDefs = level.crumblePlatforms ?? [];
  for (let i = 0; i < crumbleDefs.length; i += 1) {
    const def = crumbleDefs[i]!;
    const state = world.crumblePlatforms[i]!;
    if (state.state === 'shaking') {
      state.timerTicks -= 1;
      if (state.timerTicks <= 0) {
        state.state = 'gone';
        state.timerTicks = def.respawnTicks ?? 144;
        events.push({
          type: 'crumble',
          x: def.x + def.w / 2,
          y: def.y + def.h / 2,
          color: '#FFB84D',
        });
      }
    } else if (state.state === 'gone') {
      state.timerTicks -= 1;
      if (state.timerTicks <= 0) {
        state.state = 'solid';
        state.timerTicks = 0;
      }
    }
  }

  // 2. Advance Moving Platforms & carry riding players and crates first
  for (let i = 0; i < level.movingPlatforms.length; i += 1) {
    const def = level.movingPlatforms[i]!;
    const plat = world.movingPlatforms[i]!;
    const prevX = plat.x;
    const prevY = plat.y;

    if (def.poweredBySwitchId) {
      const sw = switchById.get(def.poweredBySwitchId);
      plat.active = Boolean(sw?.pressed || sw?.latched || (sw && sw.remainingTicks > 0));
    } else {
      plat.active = true;
    }

    if (plat.active && def.cycleSeconds > 0) {
      plat.progress = (plat.progress + dt / def.cycleSeconds) % 1;
      const ease = 0.5 - 0.5 * Math.cos(plat.progress * Math.PI * 2);
      plat.x = def.startX + (def.endX - def.startX) * ease;
      plat.y = def.startY + (def.endY - def.startY) * ease;
    }

    plat.dx = plat.x - prevX;
    plat.dy = plat.y - prevY;

    if (plat.dx !== 0 || plat.dy !== 0) {
      for (const p of activePlayers) {
        if (p.standingOnPlatformId === plat.id) {
          p.x += plat.dx;
          p.y += plat.dy;
        }
      }
      for (const c of world.crates) {
        if (c.standingOnPlatformId === plat.id) {
          c.x += plat.dx;
          c.y += plat.dy;
        }
      }
    }
  }

  const staticSolids = getStaticSolidRects(level, world);
  const allSolidsWithPlatforms: Rect[] = [
    ...staticSolids,
    ...world.movingPlatforms.map((mp) => ({ x: mp.x, y: mp.y, w: mp.w, h: mp.h })),
  ];

  // 3. Apply validated player inputs with Celeste Apex Hang + Fall Gravity Multiplier
  const intendedDirByPlayer = new Map<string, number>();
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
    intendedDirByPlayer.set(p.id, dir);
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
      p.standingOnPlatformId = null;
      p.standingOnCrateId = null;
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

    // Celeste-style asymmetric gravity: apex hang when holding jump near peak, snappy fall downward
    let effectiveGravity = baseGravity;
    if (!p.grounded && jumpDown && Math.abs(p.vy) < PHYSICS.APEX_VELOCITY_THRESHOLD) {
      effectiveGravity = baseGravity * PHYSICS.APEX_GRAVITY_MULTIPLIER;
    } else if (p.vy > 0) {
      effectiveGravity = baseGravity * PHYSICS.FALL_GRAVITY_MULTIPLIER;
    }

    p.vy = Math.min(PHYSICS.MAX_FALL_SPEED, p.vy + effectiveGravity * dt);
  }

  // 4. Cooperative Pushable Crates (x1 and x2 pushers)
  const crateDeltaX = new Map<string, number>();
  for (let i = 0; i < world.crates.length; i += 1) {
    const crate = world.crates[i]!;
    const startCrateX = crate.x;

    let pushRight = 0;
    let pushLeft = 0;

    for (const p of activePlayers) {
      const dir = intendedDirByPlayer.get(p.id) ?? 0;
      if (dir === 0) continue;

      const verticalOverlap =
        Math.min(p.y + PHYSICS.PLAYER_HEIGHT, crate.y + crate.h) - Math.max(p.y, crate.y);
      if (verticalOverlap < 6) continue;

      if (dir > 0 && p.x + PHYSICS.PLAYER_WIDTH >= crate.x - 24 && p.x < crate.x + crate.w / 2) {
        pushRight += 1;
      } else if (
        dir < 0 &&
        p.x <= crate.x + crate.w + 24 &&
        p.x + PHYSICS.PLAYER_WIDTH > crate.x + crate.w / 2
      ) {
        pushLeft += 1;
      }
    }

    const effectiveReq = world.soloPractice ? 1 : crate.requiredPushers;
    crate.activePushers = Math.max(pushRight, pushLeft);

    if (pushRight >= effectiveReq && pushLeft === 0) {
      crate.vx = PHYSICS.CRATE_PUSH_SPEED;
    } else if (pushLeft >= effectiveReq && pushRight === 0) {
      crate.vx = -PHYSICS.CRATE_PUSH_SPEED;
    } else {
      crate.vx = moveToward(crate.vx, 0, PHYSICS.CRATE_FRICTION * dt);
    }

    crate.vy = Math.min(PHYSICS.MAX_FALL_SPEED, crate.vy + baseGravity * dt);

    crate.x += crate.vx * dt;
    const cBoxX = crateRect(crate);
    const otherCrates = world.crates
      .filter((other) => other.id !== crate.id)
      .map((other) => crateRect(other));
    if (resolveBoxHorizontal(cBoxX, [...staticSolids, ...otherCrates])) {
      crate.x = cBoxX.x;
      crate.vx = 0;
    }
    crateDeltaX.set(crate.id, crate.x - startCrateX);

    const prevBottom = crate.y + crate.h;
    crate.grounded = false;
    crate.standingOnPlatformId = null;
    crate.y += crate.vy * dt;
    const cBoxY = crateRect(crate);

    for (const solid of staticSolids) {
      if (!rectsOverlap(cBoxY, solid)) continue;
      if (crate.vy >= 0 && prevBottom <= solid.y + 10) {
        crate.y = solid.y - crate.h;
        crate.vy = 0;
        crate.grounded = true;
      } else if (crate.vy < 0) {
        crate.y = solid.y + solid.h;
        crate.vy = 0;
      }
      cBoxY.y = crate.y;
    }

    for (const mp of world.movingPlatforms) {
      const mRect: Rect = { x: mp.x, y: mp.y, w: mp.w, h: mp.h };
      if (!rectsOverlap(cBoxY, mRect)) continue;
      if (crate.vy >= 0 && prevBottom <= mp.y + 12) {
        crate.y = mp.y - crate.h;
        crate.vy = 0;
        crate.grounded = true;
        crate.standingOnPlatformId = mp.id;
        cBoxY.y = crate.y;
      }
    }

    // Crate hazard respawn safety
    const fellOut = crate.y > level.height + 24;
    const hitHazard = level.hazards.some((h) => rectsOverlap(crateRect(crate), h));
    if (fellOut || hitHazard) {
      const def = level.crates[i]!;
      crate.x = def.x;
      crate.y = def.y;
      crate.vx = 0;
      crate.vy = 0;
      crate.grounded = false;
      crate.standingOnPlatformId = null;
    }
  }

  // 5. Horizontal movement for players (bottom-to-top carry)
  const bottomToTop = [...activePlayers].sort(
    (a, b) => b.y - a.y || a.slot - b.slot || a.id.localeCompare(b.id),
  );
  const deltaXById = new Map<string, number>();
  const crateRects: Rect[] = world.crates.map((c) => crateRect(c));
  const playerHorizSolids: Rect[] = [...allSolidsWithPlatforms, ...crateRects];

  for (const p of bottomToTop) {
    const startX = p.x;
    const carrierId = prevStandingOn.get(p.id);
    const carryFromPlayer = carrierId ? (deltaXById.get(carrierId) ?? 0) : 0;
    const carrierCrateId = prevStandingOnCrate.get(p.id);
    const carryFromCrate = carrierCrateId ? (crateDeltaX.get(carrierCrateId) ?? 0) : 0;

    p.x += p.vx * dt + carryFromPlayer + carryFromCrate;
    const pBox = playerRect(p);
    if (resolveBoxHorizontal(pBox, playerHorizSolids)) {
      p.x = pBox.x;
      p.vx = 0;
    }
    deltaXById.set(p.id, p.x - startX);
  }

  // 6. Gentle player-vs-player horizontal separation
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

        const boxA = playerRect(a);
        if (resolveBoxHorizontal(boxA, playerHorizSolids)) a.x = boxA.x;
        const boxB = playerRect(b);
        if (resolveBoxHorizontal(boxB, playerHorizSolids)) b.x = boxB.x;
      }
    }
  }

  // 7. Vertical movement + corner correction + one-way + moving platforms + crates + head stacking
  const settled: SimPlayerState[] = [];
  const oneWays = level.oneWayPlatforms ?? [];
  const bouncePads = level.bouncePads ?? [];

  for (const p of bottomToTop) {
    const prevTop = p.y;
    const prevBottom = p.y + PHYSICS.PLAYER_HEIGHT;

    p.grounded = false;
    p.standingOnId = null;
    p.standingOnPlatformId = null;
    p.standingOnCrateId = null;
    p.y += p.vy * dt;

    const box = playerRect(p);

    // 7a. Static solids, active bridges, crumbling platforms, locked gates
    for (const solid of staticSolids) {
      if (!rectsOverlap(box, solid)) continue;
      if (p.vy >= 0 && prevBottom <= solid.y + 8) {
        p.y = solid.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
        p.grounded = true;
      } else if (p.vy < 0 && prevTop >= solid.y + solid.h - 8) {
        // Celeste corner correction before cancelling upward jump!
        if (!tryUpwardCornerCorrection(p, solid, staticSolids)) {
          p.y = solid.y + solid.h;
          p.vy = 0;
        }
      } else {
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
      box.x = p.x;
      box.y = p.y;
    }

    // 7b. One-way platforms (jump up through freely, land solidly from above!)
    if (p.vy >= 0) {
      for (const ow of oneWays) {
        if (rectsOverlap(box, ow) && prevBottom <= ow.y + 8) {
          p.y = ow.y - PHYSICS.PLAYER_HEIGHT;
          p.vy = 0;
          p.grounded = true;
          box.y = p.y;
        }
      }
    }

    // 7c. Moving platforms
    for (const mp of world.movingPlatforms) {
      const mRect: Rect = { x: mp.x, y: mp.y, w: mp.w, h: mp.h };
      if (!rectsOverlap(box, mRect)) continue;
      if (p.vy >= 0 && prevBottom <= mp.y + Math.max(10, Math.abs(mp.dy) + 8)) {
        p.y = mp.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
        p.grounded = true;
        p.standingOnPlatformId = mp.id;
      } else if (p.vy < 0 && prevTop >= mp.y + mp.h - 10) {
        p.y = mp.y + mp.h;
        p.vy = 0;
      }
      box.y = p.y;
    }

    // 7d. Pushable crates (standable tops)
    for (const cr of world.crates) {
      const cRect = crateRect(cr);
      if (!rectsOverlap(box, cRect)) continue;
      if (p.vy >= 0 && prevBottom <= cr.y + 10) {
        p.y = cr.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
        p.grounded = true;
        p.standingOnCrateId = cr.id;
      } else if (p.vy < 0 && prevTop >= cr.y + cr.h - 8) {
        p.y = cr.y + cr.h;
        p.vy = 0;
      }
      box.y = p.y;
    }

    // 7e. Player-on-player head stacking
    for (const other of settled) {
      const horizOverlap =
        p.x + PHYSICS.PLAYER_WIDTH > other.x + 2 && p.x < other.x + PHYSICS.PLAYER_WIDTH - 2;
      if (!horizOverlap) continue;

      if (p.vy >= 0 && prevBottom <= other.y + 8 && p.y + PHYSICS.PLAYER_HEIGHT >= other.y) {
        p.y = other.y - PHYSICS.PLAYER_HEIGHT;
        p.vy = Math.min(0, other.vy);
        p.grounded = true;
        p.standingOnId = other.id;
      } else if (
        p.vy < 0 &&
        prevTop >= other.y + PHYSICS.PLAYER_HEIGHT - 8 &&
        p.y <= other.y + PHYSICS.PLAYER_HEIGHT
      ) {
        p.y = other.y + PHYSICS.PLAYER_HEIGHT;
        p.vy = 0;
      }
    }

    // 7f. Trigger shaking on any crumbling platform currently stood upon
    if (p.grounded) {
      const footBox: Rect = { x: p.x + 2, y: p.y + PHYSICS.PLAYER_HEIGHT, w: PHYSICS.PLAYER_WIDTH - 4, h: 3 };
      for (let ci = 0; ci < crumbleDefs.length; ci += 1) {
        const cDef = crumbleDefs[ci]!;
        const cState = world.crumblePlatforms[ci]!;
        if (cState.state === 'solid' && rectsOverlap(footBox, cDef)) {
          cState.state = 'shaking';
          cState.timerTicks = cDef.delayTicks ?? 50;
        }
      }
    }

    // 7g. Bounce / Spring Pads
    for (const pad of bouncePads) {
      const padTrigger: Rect = { x: pad.x - 1, y: pad.y - 3, w: pad.w + 2, h: pad.h + 4 };
      if (rectsOverlap(playerRect(p), padTrigger) && p.vy >= -80) {
        p.vy = pad.velocityY ?? PHYSICS.BOUNCE_VELOCITY;
        p.grounded = false;
        p.standingOnId = null;
        p.standingOnPlatformId = null;
        p.standingOnCrateId = null;
        p.coyoteTicks = 0;
        events.push({
          type: 'bounce',
          x: pad.x + pad.w / 2,
          y: pad.y,
          color: pad.accent === 'amber' ? '#FFB84D' : '#54D6C5',
          playerId: p.id,
        });
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

  // 8. Checkpoints
  for (const cp of level.checkpoints ?? []) {
    if (world.activeCheckpointId === cp.id) continue;
    if (activePlayers.some((p) => rectsOverlap(playerRect(p), cp))) {
      world.activeCheckpointId = cp.id;
      events.push({
        type: 'checkpoint',
        x: cp.x + cp.w / 2,
        y: cp.y + cp.h / 2,
        color: '#4FF0D6',
      });
    }
  }

  // 9. Update Switch-Controlled Laser Beams
  const laserDefs = level.lasers ?? [];
  for (let i = 0; i < laserDefs.length; i += 1) {
    const def = laserDefs[i]!;
    const state = world.lasers[i]!;
    const sw1 = switchById.get(def.disabledBySwitchId);
    const sw2 = def.alsoDisabledBySwitchId ? switchById.get(def.alsoDisabledBySwitchId) : undefined;
    const disabled = Boolean(
      sw1?.pressed ||
        sw1?.latched ||
        (sw1 && sw1.remainingTicks > 0) ||
        sw2?.pressed ||
        sw2?.latched ||
        (sw2 && sw2.remainingTicks > 0),
    );
    state.active = !disabled;
  }

  // 10. Hazards, Active Lasers & Void Respawn
  for (const p of activePlayers) {
    const box = playerRect(p);
    const fellOut = p.y > level.height + 24;
    const hitHazard = level.hazards.some((h) => rectsOverlap(box, h));
    const hitLaser =
      p.invulnTicks === 0 &&
      laserDefs.some((ld, idx) => world.lasers[idx]?.active && rectsOverlap(box, ld));

    if (fellOut || hitHazard || hitLaser) {
      const spawn = getRespawnPoint(level, world, p.slot);
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
      p.standingOnPlatformId = null;
      p.standingOnCrateId = null;
      p.invulnTicks = PHYSICS.RESPAWN_INVULN_TICKS;
      world.respawnCount += 1;
      ensureContribution(world, p.id).respawns += 1;

      // Return any carried key cleanly back to spawn
      for (let kIdx = 0; kIdx < world.keys.length; kIdx += 1) {
        const k = world.keys[kIdx]!;
        if (k.carrierPlayerId === p.id && !k.used) {
          const def = level.keys[kIdx]!;
          k.carrierPlayerId = null;
          k.x = def.x;
          k.y = def.y;
        }
      }
    }
  }

  // 11. Keys & Locked Gates
  const playerById = new Map(activePlayers.map((p) => [p.id, p]));
  for (let i = 0; i < level.keys.length; i += 1) {
    const def = level.keys[i]!;
    const key = world.keys[i]!;
    if (key.used) continue;

    if (key.carrierPlayerId && !playerById.has(key.carrierPlayerId)) {
      key.carrierPlayerId = null;
      key.x = def.x;
      key.y = def.y;
    }

    if (!key.carrierPlayerId) {
      const pickupRect: Rect = { x: key.x - 10, y: key.y - 10, w: 20, h: 20 };
      const picker = activePlayers.find((p) => rectsOverlap(playerRect(p), pickupRect));
      if (picker) {
        key.carrierPlayerId = picker.id;
        ensureContribution(world, picker.id).keysCollected += 1;
        events.push({
          type: 'key_pickup',
          x: key.x,
          y: key.y,
          color: '#FFD166',
          playerId: picker.id,
        });
      }
    }

    if (key.carrierPlayerId) {
      const carrier = playerById.get(key.carrierPlayerId);
      if (carrier) {
        const targetX = carrier.x + PHYSICS.PLAYER_WIDTH / 2 - carrier.facing * 14;
        const targetY = carrier.y - 4;
        key.x += (targetX - key.x) * 0.28;
        key.y += (targetY - key.y) * 0.28;

        const gateIdx = level.lockedGates.findIndex((g) => g.id === def.unlocksGateId);
        if (gateIdx >= 0) {
          const gateDef = level.lockedGates[gateIdx]!;
          const gateState = world.lockedGates[gateIdx]!;
          if (!gateState.unlocked) {
            const unlockZone: Rect = {
              x: gateDef.x - 16,
              y: gateDef.y - 8,
              w: gateDef.w + 32,
              h: gateDef.h + 16,
            };
            if (rectsOverlap(playerRect(carrier), unlockZone)) {
              gateState.unlocked = true;
              key.used = true;
              key.carrierPlayerId = null;
              events.push({
                type: 'gate_unlock',
                x: gateDef.x + gateDef.w / 2,
                y: gateDef.y + gateDef.h / 2,
                color: '#4FF0D6',
                playerId: carrier.id,
              });
            }
          }
        }
      }
    }
  }

  // 12. Switches (Hold, Latch, Timed, Vault)
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

    const triggeringPlayer = activePlayers.find((p) => rectsOverlap(playerRect(p), triggerZone));
    const crateAllowed = def.allowsCrate !== false;
    const cratePressing =
      crateAllowed && world.crates.some((c) => rectsOverlap(crateRect(c), triggerZone));

    const nowPressed = Boolean(triggeringPlayer || cratePressing);
    state.pressed = nowPressed;

    if (def.kind === 'latch' && nowPressed) {
      state.latched = true;
    }

    if (def.kind === 'timed') {
      const duration = def.durationTicks ?? 300;
      state.maxTicks = duration;
      if (nowPressed) {
        state.remainingTicks = duration;
      } else if (state.remainingTicks > 0) {
        state.remainingTicks -= 1;
      }
    }

    if (nowPressed && !wasPressed) {
      if (triggeringPlayer) {
        ensureContribution(world, triggeringPlayer.id).switchesTriggered += 1;
      }
      events.push({
        type: def.kind === 'latch' && !wasLatched ? 'bridge_lock' : 'switch_on',
        x: def.x + def.w / 2,
        y: def.y,
        color: def.accent === 'mint' ? '#4FF0D6' : def.accent === 'amber' ? '#FFB84D' : '#A28BFF',
        playerId: triggeringPlayer?.id,
      });
    }
  }

  // Re-evaluate lasers immediately on the same tick a switch is pressed!
  const freshSwitchById = new Map(world.switches.map((s) => [s.id, s]));
  for (let i = 0; i < laserDefs.length; i += 1) {
    const def = laserDefs[i]!;
    const state = world.lasers[i]!;
    const sw1 = freshSwitchById.get(def.disabledBySwitchId);
    const sw2 = def.alsoDisabledBySwitchId ? freshSwitchById.get(def.alsoDisabledBySwitchId) : undefined;
    state.active = !Boolean(
      sw1?.pressed ||
        sw1?.latched ||
        (sw1 && sw1.remainingTicks > 0) ||
        sw2?.pressed ||
        sw2?.latched ||
        (sw2 && sw2.remainingTicks > 0),
    );
  }

  for (let i = 0; i < level.lockedGates.length; i += 1) {
    const def = level.lockedGates[i]!;
    const gate = world.lockedGates[i]!;
    if (def.unlockedBySwitchId && !gate.unlocked) {
      const sw = freshSwitchById.get(def.unlockedBySwitchId);
      if (sw?.pressed || sw?.latched) {
        gate.unlocked = true;
        events.push({
          type: 'gate_unlock',
          x: def.x + def.w / 2,
          y: def.y + def.h / 2,
          color: '#4FF0D6',
        });
      }
    }
  }

  // 13. Bridges (Hold, Latched, Timed)
  for (let i = 0; i < level.bridges.length; i += 1) {
    const def = level.bridges[i]!;
    const state: BridgeRuntimeState = world.bridges[i]!;
    const wasActive = state.active;

    const holdSw = freshSwitchById.get(def.poweredBySwitchId);
    const lockSw = def.latchedBySwitchId ? freshSwitchById.get(def.latchedBySwitchId) : undefined;
    const timedSw = def.timedBySwitchId ? freshSwitchById.get(def.timedBySwitchId) : undefined;

    state.locked = Boolean(lockSw?.latched);
    state.remainingTicks = timedSw ? timedSw.remainingTicks : 0;
    state.maxTicks = timedSw ? timedSw.maxTicks : 0;
    state.active = Boolean(
      holdSw?.pressed || state.locked || (timedSw && timedSw.remainingTicks > 0),
    );

    if (state.active && !wasActive) {
      events.push({
        type: 'bridge_on',
        x: def.x + def.w / 2,
        y: def.y,
        color: state.locked ? '#4FF0D6' : '#A28BFF',
      });
    }
  }

  // 14. Simultaneous Dual Vault Switches -> Exit Door unlock
  if (level.requiresVaultSwitches && !world.exitDoor.unlocked) {
    const vaultSwitches = level.switches
      .filter((sw) => sw.kind === 'vault')
      .map((sw) => freshSwitchById.get(sw.id));

    if (vaultSwitches.length > 0) {
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
            color: '#4FF0D6',
          });
        }
      } else if (world.exitDoor.chargeTicks > 0) {
        world.exitDoor.chargeTicks -= 1;
      }
    }
  }

  // 15. Exit Door Win Condition
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
      world.medal = computeMedal(level, world.elapsedMs);
      events.push({
        type: 'level_complete',
        x: level.exitDoor.x + level.exitDoor.w / 2,
        y: level.exitDoor.y + level.exitDoor.h / 2,
        color: '#4FF0D6',
      });
    }
  } else {
    world.exitDoor.exitHoldTicks = 0;
  }

  return events;
}
