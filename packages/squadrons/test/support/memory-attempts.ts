import type { FormationAttempt, FormationAttempts } from '../../src/core/squadron/ports.js';

/** Formation attempts in memory, finished when the squadron is created with them. */
export function memoryAttempts(): FormationAttempts & { held: (FormationAttempt & { isFinished: boolean })[] } {
  const attempts: FormationAttempts & { held: (FormationAttempt & { isFinished: boolean })[] } = {
    held: [],
    begin: (attempt) => {
      attempts.held.push({ ...attempt, ships: [], isGivenUp: false, recoveryRefusals: 0, isFinished: false });
      return Promise.resolve();
    },
    plan: (fleetId, { attemptId, name }) => {
      attempts.held.find((held) => held.fleetId === fleetId && held.id === attemptId)?.ships.push({ name, shipId: null });
      return Promise.resolve();
    },
    commissioned: (fleetId, ship) => {
      const planned = attempts.held.find((held) => held.fleetId === fleetId && held.id === ship.attemptId)?.ships.find((each) => each.name === ship.name);
      if (planned) {
        planned.shipId = ship.shipId;
      }
      return Promise.resolve();
    },
    giveUp: (fleetId, attemptId) => {
      const held = attempts.held.find((each) => each.id === attemptId);
      if (held?.fleetId === fleetId) {
        held.isGivenUp = true;
      }
      return Promise.resolve();
    },
    recordRecoveryRefusal: (fleetId, attemptId) => {
      const held = attempts.held.find((each) => each.id === attemptId);
      if (held?.fleetId === fleetId) {
        held.recoveryRefusals += 1;
      }
      return Promise.resolve();
    },
    finish: (fleetId, attemptId) => {
      const held = attempts.held.find((each) => each.id === attemptId);
      if (held?.fleetId === fleetId) {
        held.isFinished = true;
      }
      return Promise.resolve();
    },
    unfinished: (fleetId) => Promise.resolve(attempts.held.filter((held) => held.fleetId === fleetId && !held.isFinished)),
  };
  return attempts;
}
