import {
  CAMPAIGN_LEVELS,
  INPUT_BITS,
  LEVEL_CHAMBER_01,
  LEVEL_CHAMBER_02,
  LEVEL_CHAMBER_03,
  LEVEL_CHAMBER_04,
  LEVEL_SPECIAL_S1,
  LEVEL_SPECIAL_S2,
  LEVEL_SPECIAL_S3,
  LEVEL_SPECIAL_S4,
  NORMAL_LEVELS,
  PHYSICS,
  SOLO_PUPPET_ID,
  SPECIAL_LEVELS,
  createGameWorld,
  generateProceduralChamber,
  getNextLevelId,
  getSpawnPositionForSlot,
  stepGameWorld,
} from '@together/game-core';
import { describe, expect, it } from 'vitest';

describe('Celeste-grade kinematic physics & Stage 1 cooperative rules', () => {
  it('enforces exact jump kinematics (single jump ~76-80px, faster fall than rise, cannot reach 88px ledge alone)', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'Alice', slot: 0, connected: true },
      { id: 'p2', displayName: 'Bob', slot: 1, connected: true },
    ]);

    const p1 = world.players[0]!;
    p1.x = 180;
    p1.y = LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT;
    p1.grounded = true;

    let highestFeetY = p1.y + PHYSICS.PLAYER_HEIGHT;
    let apexTick = 0;
    let landTick = 0;

    for (let t = 1; t <= 60; t += 1) {
      stepGameWorld(world, {
        p1: { buttons: t <= 24 ? INPUT_BITS.JUMP : 0 },
      });
      const feetY = p1.y + PHYSICS.PLAYER_HEIGHT;
      if (feetY < highestFeetY) {
        highestFeetY = feetY;
        apexTick = t;
      }
      if (t > 5 && p1.grounded && landTick === 0) {
        landTick = t;
        break;
      }
    }

    const jumpHeight = LEVEL_CHAMBER_01.spawnFloorY - highestFeetY;
    // Exact Celeste-tuned jump height: >= 74 px and < 84 px (strictly below 88 px High Ledge!)
    expect(jumpHeight).toBeGreaterThanOrEqual(74);
    expect(jumpHeight).toBeLessThan(84);
    expect(highestFeetY).toBeGreaterThan(296);

    // Asymmetric gravity: descent takes fewer ticks than ascent (snappy landing)
    const fallTicks = landTick - apexTick;
    expect(fallTicks).toBeLessThan(apexTick);
  });

  it('nudges players up to 5px past ceiling corners during upward jump (Celeste corner correction)', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'Runner', slot: 0, connected: true },
    ]);
    const p1 = world.players[0]!;
    // High Ledge in Chamber 01 starts at x=208, y=296..310.
    // Position player right edge 3px overlapping left corner of ledge (x = 208 - 20 + 3 = 191)
    p1.x = 191;
    p1.y = 314;
    p1.vy = -300;
    p1.grounded = false;

    stepGameWorld(world, {});
    // Corner correction should nudge player left clear of x=208 and preserve upward vy!
    expect(p1.x + PHYSICS.PLAYER_WIDTH).toBeLessThanOrEqual(208);
    expect(p1.vy).toBeLessThan(-200);
  });

  it('supports stable head-stacking, horizontal head-carry, and jumping onto High Ledge', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'Base', slot: 0, connected: true },
      { id: 'p2', displayName: 'Rider', slot: 1, connected: true },
    ]);

    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    p1.x = 180;
    p1.y = LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT;
    p2.x = 180;
    p2.y = p1.y - PHYSICS.PLAYER_HEIGHT - 2;

    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, {});
    }

    expect(p1.grounded).toBe(true);
    expect(p2.grounded).toBe(true);
    expect(p2.standingOnId).toBe('p1');
    expect(Math.round(p2.y + PHYSICS.PLAYER_HEIGHT)).toBe(Math.round(p1.y));

    const p2StartX = p2.x;
    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, { p1: { buttons: INPUT_BITS.RIGHT } });
    }
    expect(p2.x).toBeGreaterThan(p2StartX + 10);
    expect(p2.standingOnId).toBe('p1');

    // Position stack cleanly beside High Ledge (x=208, y=296) and jump P2 onto it
    p1.x = 176;
    p1.vx = 0;
    p2.x = 176;
    p2.y = p1.y - PHYSICS.PLAYER_HEIGHT;
    p2.vx = 0;
    p2.grounded = true;
    p2.standingOnId = 'p1';

    let reachedLedge = false;
    for (let t = 0; t < 55; t += 1) {
      stepGameWorld(world, {
        p2: { buttons: (t < 24 ? INPUT_BITS.JUMP : 0) | INPUT_BITS.RIGHT },
      });
      if (p2.grounded && Math.round(p2.y + PHYSICS.PLAYER_HEIGHT) === 296 && p2.x >= 208) {
        reachedLedge = true;
        break;
      }
    }

    expect(reachedLedge).toBe(true);
  });

  it('activates bridge on hold switch, latches permanently on lock switch, and respawns on hazard pit', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'One', slot: 0, connected: true },
      { id: 'p2', displayName: 'Two', slot: 1, connected: true },
    ]);

    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(false);

    p2.x = 250;
    p2.y = 296 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(true);
    expect(world.bridges[0]?.locked).toBe(false);

    p2.x = 210;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(false);

    p1.x = 400;
    p1.y = 424;
    const respawnEvents = stepGameWorld(world, {});
    expect(respawnEvents.some((e) => e.type === 'respawn')).toBe(true);
    expect(world.respawnCount).toBe(1);
    expect(p1.y).toBe(LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT);

    p1.x = 536;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.locked).toBe(true);
    expect(world.bridges[0]?.active).toBe(true);

    p1.x = 600;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.locked).toBe(true);
    expect(world.bridges[0]?.active).toBe(true);
  });

  it('requires simultaneous dual vault plates to unlock exit door and all players to finish', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'One', slot: 0, connected: true },
      { id: 'p2', displayName: 'Two', slot: 1, connected: true },
    ]);
    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    p1.x = 598;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 25; t += 1) stepGameWorld(world, {});
    expect(world.exitDoor.unlocked).toBe(false);

    p2.x = 662;
    p2.y = 384 - PHYSICS.PLAYER_HEIGHT;
    let unlockedEvent = false;
    for (let t = 0; t < 20; t += 1) {
      const evs = stepGameWorld(world, {});
      if (evs.some((e) => e.type === 'door_unlock')) unlockedEvent = true;
    }
    expect(unlockedEvent).toBe(true);
    expect(world.exitDoor.unlocked).toBe(true);

    p1.x = 732;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 15; t += 1) stepGameWorld(world, {});
    expect(world.status).toBe('playing');
    expect(world.exitDoor.playersInside).toBe(1);

    p2.x = 740;
    p2.y = 384 - PHYSICS.PLAYER_HEIGHT;
    let completeEvent = false;
    for (let t = 0; t < 15; t += 1) {
      const evs = stepGameWorld(world, {});
      if (evs.some((e) => e.type === 'level_complete')) completeEvent = true;
    }
    expect(completeEvent).toBe(true);
    expect(world.status).toBe('completed');
    expect(world.completionTimeMs).toBeGreaterThan(0);
  });

  it('spawns a swappable partner puppet in solo practice mode', () => {
    const world = createGameWorld(
      [{ id: 'solo_user', displayName: 'Solo', slot: 0, connected: true }],
      { soloPractice: true },
    );
    expect(world.soloPractice).toBe(true);
    expect(world.players).toHaveLength(2);
    expect(world.players.some((p) => p.id === SOLO_PUPPET_ID && p.isSoloPuppet)).toBe(true);
  });
});

describe('Stages 2 & 3 (Fixed bypasses, Timing, Crates) and Procedural Labs', () => {
  it('Stage 2: prevents jumping across Pit 2 (168px), carries ferry riders, runs 5s timed bridge, unlocks key gate', () => {
    const world = createGameWorld(
      [
        { id: 'p1', displayName: 'Alice', slot: 0, connected: true },
        { id: 'p2', displayName: 'Bob', slot: 1, connected: true },
      ],
      { level: LEVEL_CHAMBER_02 },
    );

    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    // Verify Pit 2 (x=484..652, 168px) CANNOT be cleared by a running jump without timed bridge!
    p1.x = 462;
    p1.y = 360 - PHYSICS.PLAYER_HEIGHT;
    p1.vx = PHYSICS.MOVE_SPEED;
    p1.grounded = true;
    let bypassedPit2 = false;
    for (let t = 0; t < 55; t += 1) {
      stepGameWorld(
        world,
        { p1: { buttons: INPUT_BITS.RIGHT | (t < 24 ? INPUT_BITS.JUMP : 0) } },
        LEVEL_CHAMBER_02,
      );
      if (p1.grounded && p1.x >= 652 && Math.round(p1.y + PHYSICS.PLAYER_HEIGHT) === 360) {
        bypassedPit2 = true;
      }
    }
    expect(bypassedPit2).toBe(false);

    // Ferry carry verification
    const ferry = world.movingPlatforms[0]!;
    p1.x = ferry.x + 12;
    p1.y = ferry.y - PHYSICS.PLAYER_HEIGHT;
    p1.vx = 0;
    p1.vy = 0;
    p1.grounded = true;
    p1.standingOnPlatformId = ferry.id;
    const startX = p1.x;

    for (let t = 0; t < 40; t += 1) {
      stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    }
    expect(p1.x).toBeGreaterThan(startX + 15);
    expect(p1.standingOnPlatformId).toBe(ferry.id);

    // 5s timed bridge switch at x=432..476
    p2.x = 442;
    p2.y = 360 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    expect(world.bridges[0]?.active).toBe(true);
    expect(world.bridges[0]?.remainingTicks).toBe(300);

    p2.x = 400;
    stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    expect(world.bridges[0]?.active).toBe(true);
    expect(world.bridges[0]?.remainingTicks).toBe(299);

    expect(world.lockedGates[0]?.unlocked).toBe(false);

    // Key pickup + gate unlock
    const keyDef = LEVEL_CHAMBER_02.keys[0]!;
    p1.x = keyDef.x - 6;
    p1.y = keyDef.y - 6;
    const pickEvents = stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    expect(pickEvents.some((e) => e.type === 'key_pickup')).toBe(true);
    expect(world.keys[0]?.carrierPlayerId).toBe('p1');

    p1.x = 668;
    p1.y = 360 - PHYSICS.PLAYER_HEIGHT;
    const unlockEvents = stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    expect(unlockEvents.some((e) => e.type === 'gate_unlock')).toBe(true);
    expect(world.lockedGates[0]?.unlocked).toBe(true);
    expect(world.keys[0]?.used).toBe(true);

    p1.x = 730;
    p1.y = 360 - PHYSICS.PLAYER_HEIGHT;
    p2.x = 736;
    p2.y = 360 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, {}, LEVEL_CHAMBER_02);
    }
    expect(world.status).toBe('completed');
    expect(world.medal).toBe('gold');
  });

  it('Stage 3: prevents key bypass without heavy crate, requires x1/x2 pushers (1 in solo), and crate weighs lift plate', () => {
    const world = createGameWorld(
      [
        { id: 'p1', displayName: 'One', slot: 0, connected: true },
        { id: 'p2', displayName: 'Two', slot: 1, connected: true },
      ],
      { level: LEVEL_CHAMBER_03 },
    );

    const p1 = world.players[0]!;
    const p2 = world.players[1]!;
    const lightCrate = world.crates[0]!;
    const heavyCrate = world.crates[1]!;

    // Verify key_vault (x=490, y=138) CANNOT be grabbed by jumping directly off mezzanine (y=248) without crate!
    p1.x = 480;
    p1.y = 248 - PHYSICS.PLAYER_HEIGHT;
    p1.grounded = true;
    for (let t = 0; t < 35; t += 1) {
      stepGameWorld(world, { p1: { buttons: t < 22 ? INPUT_BITS.JUMP : 0 } }, LEVEL_CHAMBER_03);
    }
    expect(world.keys[0]?.carrierPlayerId).toBeNull();

    // Cargo lift is initially inactive until lift_plate is weighed down
    expect(world.movingPlatforms[0]?.active).toBe(false);

    // 1 player pushing light crate (x1) moves it right
    p1.x = lightCrate.x - PHYSICS.PLAYER_WIDTH;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    const lightStartX = lightCrate.x;
    for (let t = 0; t < 20; t += 1) {
      stepGameWorld(world, { p1: { buttons: INPUT_BITS.RIGHT } }, LEVEL_CHAMBER_03);
    }
    expect(lightCrate.x).toBeGreaterThan(lightStartX + 10);

    // Resting light crate on lift_plate (x=342..386) powers cargo lift
    lightCrate.x = 350;
    lightCrate.y = 384 - lightCrate.h;
    stepGameWorld(world, {}, LEVEL_CHAMBER_03);
    expect(world.switches[0]?.pressed).toBe(true);
    stepGameWorld(world, {}, LEVEL_CHAMBER_03);
    expect(world.movingPlatforms[0]?.active).toBe(true);

    // Heavy crate (x2): 1 player pushing alone in 2P co-op CANNOT move it
    const heavyStartX = heavyCrate.x;
    p1.x = heavyCrate.x - PHYSICS.PLAYER_WIDTH;
    p1.y = 248 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, { p1: { buttons: INPUT_BITS.RIGHT } }, LEVEL_CHAMBER_03);
    }
    expect(heavyCrate.x).toBeCloseTo(heavyStartX, 1);
    expect(heavyCrate.activePushers).toBe(1);

    // 2 players pushing heavy crate together DOES move it smoothly
    p2.x = heavyCrate.x - PHYSICS.PLAYER_WIDTH - 4;
    p2.y = 248 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 20; t += 1) {
      stepGameWorld(
        world,
        {
          p1: { buttons: INPUT_BITS.RIGHT },
          p2: { buttons: INPUT_BITS.RIGHT },
        },
        LEVEL_CHAMBER_03,
      );
    }
    expect(heavyCrate.x).toBeGreaterThan(heavyStartX + 12);
    expect(heavyCrate.activePushers).toBe(2);

    // Solo Practice allows 1 player to push heavy crate so solo never soft-locks
    const soloWorld = createGameWorld(
      [{ id: 'solo', displayName: 'Solo', slot: 0, connected: true }],
      { level: LEVEL_CHAMBER_03, soloPractice: true },
    );
    const soloP = soloWorld.players[0]!;
    const soloHeavy = soloWorld.crates[1]!;
    const soloStart = soloHeavy.x;
    soloP.x = soloHeavy.x - PHYSICS.PLAYER_WIDTH;
    soloP.y = 248 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 20; t += 1) {
      stepGameWorld(soloWorld, { solo: { buttons: INPUT_BITS.RIGHT } }, LEVEL_CHAMBER_03);
    }
    expect(soloHeavy.x).toBeGreaterThan(soloStart + 10);
  });

  it('generates identical deterministic procedural chambers per seed and honors low_gravity modifier', () => {
    const a = generateProceduralChamber(777123);
    const b = generateProceduralChamber(777123);
    const c = generateProceduralChamber(999456);

    expect(a).toEqual(b);
    expect(a.id).toBe('procedural:777123');
    expect(c.id).toBe('procedural:999456');
    expect(a.width).toBe(800);
    expect(a.height).toBe(448);

    const normalWorld = createGameWorld(
      [{ id: 'p1', displayName: 'A', slot: 0, connected: true }],
      { level: a, modifier: 'standard' },
    );
    const lowGWorld = createGameWorld(
      [{ id: 'p1', displayName: 'A', slot: 0, connected: true }],
      { level: a, modifier: 'low_gravity' },
    );

    let peakNormal = 999;
    let peakLowG = 999;
    for (let t = 0; t < 40; t += 1) {
      stepGameWorld(normalWorld, { p1: { buttons: t < 20 ? INPUT_BITS.JUMP : 0 } }, a);
      stepGameWorld(lowGWorld, { p1: { buttons: t < 20 ? INPUT_BITS.JUMP : 0 } }, a);
      peakNormal = Math.min(peakNormal, normalWorld.players[0]!.y);
      peakLowG = Math.min(peakLowG, lowGWorld.players[0]!.y);
    }
    expect(peakLowG).toBeLessThan(peakNormal - 12);
  });
});

describe('Stage 4 & Special Stages S1-S4 mechanics + 8-stage playability invariants', () => {
  it('registers 4 Normal stages (1-4) and 4 Special stages (S1-S4) in exact progression order', () => {
    expect(NORMAL_LEVELS.map((l) => l.code)).toEqual(['1', '2', '3', '4']);
    expect(SPECIAL_LEVELS.map((l) => l.code)).toEqual(['S1', 'S2', 'S3', 'S4']);
    expect(CAMPAIGN_LEVELS).toHaveLength(8);
    expect(getNextLevelId(LEVEL_CHAMBER_04.id)).toBe(LEVEL_SPECIAL_S1.id);
    expect(getNextLevelId(LEVEL_SPECIAL_S1.id)).toBe(LEVEL_SPECIAL_S2.id);
    expect(getNextLevelId(LEVEL_SPECIAL_S2.id)).toBe(LEVEL_SPECIAL_S3.id);
    expect(getNextLevelId(LEVEL_SPECIAL_S3.id)).toBe(LEVEL_SPECIAL_S4.id);
    expect(getNextLevelId(LEVEL_SPECIAL_S4.id)).toBeNull();
  });

  it('Stage 4: verifies Bounce Pad launch (>=132px), Laser hazard + switch disable, Crumbling lifecycle, and Checkpoint respawn', () => {
    const world = createGameWorld(
      [
        { id: 'p1', displayName: 'Alpha', slot: 0, connected: true },
        { id: 'p2', displayName: 'Beta', slot: 1, connected: true },
      ],
      { level: LEVEL_CHAMBER_04 },
    );
    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    // 1. Bounce Pad (pad_west at x=176, y=374) launches player >= 132px up to reach control balcony (y=252)
    p1.x = 180;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    let bounced = false;
    let minFeetY = 384;
    for (let t = 0; t < 45; t += 1) {
      const evs = stepGameWorld(world, {}, LEVEL_CHAMBER_04);
      if (evs.some((e) => e.type === 'bounce')) bounced = true;
      minFeetY = Math.min(minFeetY, p1.y + PHYSICS.PLAYER_HEIGHT);
    }
    expect(bounced).toBe(true);
    expect(384 - minFeetY).toBeGreaterThanOrEqual(134);

    // 2. Active Laser Beam (laser_mid at x=224, y=304..384) respawns player when touched
    p2.x = 220;
    p2.y = 384 - PHYSICS.PLAYER_HEIGHT;
    const hitLaserEvs = stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    expect(hitLaserEvs.some((e) => e.type === 'respawn')).toBe(true);
    expect(world.respawnCount).toBe(1);

    // Standing on laser_hold (x=92, y=244) disables laser_mid so P2 passes safely!
    p1.x = 100;
    p1.y = 252 - PHYSICS.PLAYER_HEIGHT;
    p1.vx = 0;
    p1.vy = 0;
    stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    expect(world.lasers[0]?.active).toBe(false);

    p2.x = 220;
    p2.y = 384 - PHYSICS.PLAYER_HEIGHT;
    p2.invulnTicks = 0;
    const passLaserEvs = stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    expect(passLaserEvs.some((e) => e.type === 'respawn')).toBe(false);

    // 3. Crumbling platform lifecycle: solid -> shaking -> gone -> solid
    const cDef = LEVEL_CHAMBER_04.crumblePlatforms![0]!;
    p2.x = cDef.x + 10;
    p2.y = cDef.y - PHYSICS.PLAYER_HEIGHT - 1;
    p2.vy = 20;
    for (let t = 0; t < 4; t += 1) {
      stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    }
    expect(world.crumblePlatforms[0]?.state).toBe('shaking');

    // Step off to east side of hub (clear of checkpoint at 478..496) so crumble timer finishes
    p2.x = 524;
    p2.y = 368 - PHYSICS.PLAYER_HEIGHT;
    let crumbledEvent = false;
    for (let t = 0; t < cDef.delayTicks + 4; t += 1) {
      const evs = stepGameWorld(world, {}, LEVEL_CHAMBER_04);
      if (evs.some((e) => e.type === 'crumble')) crumbledEvent = true;
    }
    expect(crumbledEvent).toBe(true);
    expect(world.crumblePlatforms[0]?.state).toBe('gone');

    for (let t = 0; t < cDef.respawnTicks + 4; t += 1) {
      stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    }
    expect(world.crumblePlatforms[0]?.state).toBe('solid');

    // 4. Checkpoint (cp_stage4 at x=478, y=332) updates respawn location!
    p2.x = 478;
    p2.y = 368 - PHYSICS.PLAYER_HEIGHT;
    const cpEvs = stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    expect(cpEvs.some((e) => e.type === 'checkpoint')).toBe(true);
    expect(world.activeCheckpointId).toBe('cp_stage4');

    // Triggering hazard now respawns at checkpoint hub (x >= 470, y = 368 - PLAYER_HEIGHT) instead of west spawn!
    p2.x = 300;
    p2.y = 424;
    p2.invulnTicks = 0;
    stepGameWorld(world, {}, LEVEL_CHAMBER_04);
    expect(p2.x).toBeGreaterThanOrEqual(470);
    expect(p2.y).toBe(368 - PHYSICS.PLAYER_HEIGHT);
  });

  it('Special Stage S1: allows jumping UP through one-way platforms, landing solidly, and dropping DOWN with INPUT_BITS.DOWN', () => {
    const world = createGameWorld(
      [{ id: 'p1', displayName: 'Sky', slot: 0, connected: true }],
      { level: LEVEL_SPECIAL_S1 },
    );
    const p1 = world.players[0]!;
    const ow = LEVEL_SPECIAL_S1.oneWayPlatforms![0]!;

    p1.x = ow.x + 20;
    p1.y = 396 - PHYSICS.PLAYER_HEIGHT;
    p1.grounded = true;

    let passedAbove = false;
    let landedOnOneWay = false;
    for (let t = 0; t < 48; t += 1) {
      stepGameWorld(world, { p1: { buttons: t < 20 ? INPUT_BITS.JUMP : 0 } }, LEVEL_SPECIAL_S1);
      if (p1.y + PHYSICS.PLAYER_HEIGHT < ow.y) passedAbove = true;
      if (passedAbove && p1.grounded && Math.round(p1.y + PHYSICS.PLAYER_HEIGHT) === ow.y) {
        landedOnOneWay = true;
        break;
      }
    }
    expect(passedAbove).toBe(true);
    expect(landedOnOneWay).toBe(true);

    // Pressing DOWN (S / ArrowDown) cleanly drops player back down through the one-way deck
    for (let t = 0; t < 24; t += 1) {
      stepGameWorld(world, { p1: { buttons: t < 4 ? INPUT_BITS.DOWN : 0 } }, LEVEL_SPECIAL_S1);
    }
    expect(p1.y + PHYSICS.PLAYER_HEIGHT).toBeGreaterThan(ow.y + 8);
  });

  it('collects 3 DarkCoins per stage, enforces 2P team switch in co-op, and rejects 24px telekinesis crate push', () => {
    // 1. All 8 campaign stages ship exactly 3 DarkCoins
    for (const lvl of CAMPAIGN_LEVELS) {
      expect(lvl.coins, `${lvl.id} should define 3 DarkCoins`).toHaveLength(3);
    }

    // 2. Coin pickup fires coin_pickup event & updates runtime state
    const c1World = createGameWorld(
      [{ id: 'p1', displayName: 'Collector', slot: 0, connected: true }],
      { level: LEVEL_CHAMBER_01 },
    );
    const coin0 = LEVEL_CHAMBER_01.coins![0]!;
    c1World.players[0]!.x = coin0.x - 4;
    c1World.players[0]!.y = coin0.y - 6;
    const coinEvents = stepGameWorld(c1World, {}, LEVEL_CHAMBER_01);
    expect(coinEvents.some((e) => e.type === 'coin_pickup')).toBe(true);
    expect(c1World.coins?.[0]?.collected).toBe(true);

    // 3. Stage S2 2P Team Switch (s2_l1_lock): 1 player is NOT enough in 2P co-op; 2 standing together locks it!
    const s2World = createGameWorld(
      [
        { id: 'p1', displayName: 'A', slot: 0, connected: true },
        { id: 'p2', displayName: 'B', slot: 1, connected: true },
      ],
      { level: LEVEL_SPECIAL_S2 },
    );
    const s2Sw = LEVEL_SPECIAL_S2.switches.find((s) => s.id === 's2_l1_lock')!;
    const s2SwIdx = LEVEL_SPECIAL_S2.switches.findIndex((s) => s.id === 's2_l1_lock');
    s2World.players[0]!.x = s2Sw.x + 4;
    s2World.players[0]!.y = 368 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(s2World, {}, LEVEL_SPECIAL_S2);
    expect(s2World.switches[s2SwIdx]?.latched).toBe(false);
    expect(s2World.switches[s2SwIdx]?.pressers).toBe(1);

    s2World.players[1]!.x = s2Sw.x + 14;
    s2World.players[1]!.y = 368 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(s2World, {}, LEVEL_SPECIAL_S2);
    expect(s2World.switches[s2SwIdx]?.latched).toBe(true);
    expect(s2World.switches[s2SwIdx]?.pressers).toBe(2);

    // 4. Crate push rejects distant 15px "telekinesis" pushes (requires <= 6px contact!)
    const c3World = createGameWorld(
      [{ id: 'p1', displayName: 'Pusher', slot: 0, connected: true }],
      { level: LEVEL_CHAMBER_03 },
    );
    const light = c3World.crates[0]!;
    const startCrateX = light.x;
    c3World.players[0]!.x = light.x - PHYSICS.PLAYER_WIDTH - 14;
    c3World.players[0]!.y = 384 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(c3World, { p1: { buttons: INPUT_BITS.RIGHT } }, LEVEL_CHAMBER_03);
    expect(light.x).toBeCloseTo(startCrateX, 2);
  });

  it('geometric playability invariant: all 8 campaign stages have clean 8P spawns, clear bounce-pad skies, and unobstructed vertical lifts', () => {
    const overlaps = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    for (const lvl of CAMPAIGN_LEVELS) {
      // 1. All 8 player slots spawn cleanly on solid ground with no solid/hazard/laser/pad collision
      for (let slot = 0; slot < 8; slot += 1) {
        const pos = getSpawnPositionForSlot(lvl, slot);
        const box = { x: pos.x, y: pos.y, w: PHYSICS.PLAYER_WIDTH, h: PHYSICS.PLAYER_HEIGHT };
        const footSupport = lvl.solids.some(
          (s) =>
            Math.abs(s.y - lvl.spawnFloorY) <= 1 &&
            pos.x + 2 >= s.x &&
            pos.x + PHYSICS.PLAYER_WIDTH - 2 <= s.x + s.w,
        );
        expect(footSupport, `${lvl.id} slot ${slot} missing floor support`).toBe(true);

        for (const s of lvl.solids) {
          expect(overlaps(box, s), `${lvl.id} slot ${slot} overlaps solid`).toBe(false);
        }
        for (const h of lvl.hazards) {
          expect(overlaps(box, h), `${lvl.id} slot ${slot} overlaps hazard`).toBe(false);
        }
        for (const pad of lvl.bouncePads ?? []) {
          expect(overlaps(box, pad), `${lvl.id} slot ${slot} overlaps bouncePad ${pad.id}`).toBe(
            false,
          );
        }
        for (const laser of lvl.lasers ?? []) {
          expect(overlaps(box, laser), `${lvl.id} slot ${slot} overlaps laser ${laser.id}`).toBe(
            false,
          );
        }
      }

      // 2. Every bounce pad has >= 140px clear sky directly above it (no solid head-bonk ceiling!)
      for (const pad of lvl.bouncePads ?? []) {
        const shaft = { x: pad.x + 2, y: Math.max(24, pad.y - 140), w: pad.w - 4, h: 136 };
        for (const s of lvl.solids) {
          // Ignore top border ceiling (y=0, h=24)
          if (s.y === 0) continue;
          expect(
            overlaps(shaft, s),
            `${lvl.id} bounce pad ${pad.id} obstructed by solid (${s.x},${s.y})`,
          ).toBe(false);
        }
      }

      // 3. Every vertical moving platform has clear headroom across its entire travel path
      for (const mp of lvl.movingPlatforms) {
        if (mp.startY === mp.endY) continue;
        const minY = Math.min(mp.startY, mp.endY);
        const maxY = Math.max(mp.startY, mp.endY);
        const travelShaft = {
          x: mp.startX + 4,
          y: Math.max(24, minY - PHYSICS.PLAYER_HEIGHT - 4),
          w: mp.w - 8,
          h: maxY - minY + PHYSICS.PLAYER_HEIGHT,
        };
        for (const s of lvl.solids) {
          if (s.y === 0) continue;
          expect(
            overlaps(travelShaft, s),
            `${lvl.id} vertical lift ${mp.id} obstructed by solid (${s.x},${s.y})`,
          ).toBe(false);
        }
      }
    }
  });
});
