import {
  INPUT_BITS,
  LEVEL_CHAMBER_01,
  PHYSICS,
  SOLO_PUPPET_ID,
  createGameWorld,
  stepGameWorld,
} from '@together/game-core';
import { describe, expect, it } from 'vitest';

describe('Chamber 01 deterministic physics & cooperative rules', () => {
  it('prevents a single player from reaching High Ledge alone, requiring player stacking', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'Alice', slot: 0, connected: true },
      { id: 'p2', displayName: 'Bob', slot: 1, connected: true },
    ]);

    const p1 = world.players[0]!;
    p1.x = 180;
    p1.y = LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT;
    p1.grounded = true;

    let highestFeetY = p1.y + PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 45; t += 1) {
      stepGameWorld(world, {
        p1: { buttons: t < 20 ? INPUT_BITS.JUMP : 0 },
      });
      highestFeetY = Math.min(highestFeetY, p1.y + PHYSICS.PLAYER_HEIGHT);
    }

    // High Ledge top is at y=296; single jump peak must stay below (greater y than) 296
    expect(highestFeetY).toBeGreaterThan(296);
  });

  it('supports stable head-stacking, horizontal head-carry, and jumping onto High Ledge', () => {
    const world = createGameWorld([
      { id: 'p1', displayName: 'Base', slot: 0, connected: true },
      { id: 'p2', displayName: 'Rider', slot: 1, connected: true },
    ]);

    const p1 = world.players[0]!;
    const p2 = world.players[1]!;

    // Place P1 on floor near High Ledge and drop P2 right onto P1's head
    p1.x = 180;
    p1.y = LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT;
    p2.x = 180;
    p2.y = p1.y - PHYSICS.PLAYER_HEIGHT - 2;

    // Settle for 15 ticks
    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, {});
    }

    expect(p1.grounded).toBe(true);
    expect(p2.grounded).toBe(true);
    expect(p2.standingOnId).toBe('p1');
    expect(Math.round(p2.y + PHYSICS.PLAYER_HEIGHT)).toBe(Math.round(p1.y));

    // Walk P1 right for 15 ticks -> P2 should be carried along on top of P1's head!
    const p2StartX = p2.x;
    for (let t = 0; t < 15; t += 1) {
      stepGameWorld(world, { p1: { buttons: INPUT_BITS.RIGHT } });
    }
    expect(p2.x).toBeGreaterThan(p2StartX + 10);
    expect(p2.standingOnId).toBe('p1');

    // Now position stack cleanly beside High Ledge (x=208, y=296) and jump P2 onto it!
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

    // Initially bridge is inactive
    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(false);

    // P2 stands on bridge_hold (x=242..278, y=288)
    p2.x = 250;
    p2.y = 296 - PHYSICS.PLAYER_HEIGHT;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(true);
    expect(world.bridges[0]?.locked).toBe(false);

    // P2 steps off -> bridge deactivates again
    p2.x = 210;
    stepGameWorld(world, {});
    expect(world.bridges[0]?.active).toBe(false);

    // P1 falls into hazard pit (x=400, y=424) -> respawns safely at spawn & increments counter
    p1.x = 400;
    p1.y = 424;
    const respawnEvents = stepGameWorld(world, {});
    expect(respawnEvents.some((e) => e.type === 'respawn')).toBe(true);
    expect(world.respawnCount).toBe(1);
    expect(p1.y).toBe(LEVEL_CHAMBER_01.spawnFloorY - PHYSICS.PLAYER_HEIGHT);

    // P1 touches bridge_lock (x=528..564, y=376) -> bridge permanently locks ON even after leaving
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

    // Only P1 on vault_left -> door stays locked
    p1.x = 598;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 25; t += 1) stepGameWorld(world, {});
    expect(world.exitDoor.unlocked).toBe(false);

    // P1 on vault_left AND P2 on vault_right simultaneously -> door unlocks after 15 ticks
    p2.x = 662;
    p2.y = 384 - PHYSICS.PLAYER_HEIGHT;
    let unlockedEvent = false;
    for (let t = 0; t < 20; t += 1) {
      const evs = stepGameWorld(world, {});
      if (evs.some((e) => e.type === 'door_unlock')) unlockedEvent = true;
    }
    expect(unlockedEvent).toBe(true);
    expect(world.exitDoor.unlocked).toBe(true);

    // Only P1 enters exit -> NOT completed yet (1/2)
    p1.x = 732;
    p1.y = 384 - PHYSICS.PLAYER_HEIGHT;
    for (let t = 0; t < 15; t += 1) stepGameWorld(world, {});
    expect(world.status).toBe('playing');
    expect(world.exitDoor.playersInside).toBe(1);

    // Both P1 and P2 inside exit -> completes level!
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
