import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __pollaEvents: EventEmitter | undefined;
}

export const eventBus: EventEmitter =
  globalThis.__pollaEvents ?? (globalThis.__pollaEvents = new EventEmitter());

// Increase max listeners for multiple clients
eventBus.setMaxListeners(100);

export function notifyTournamentChange(tournamentId: string) {
  eventBus.emit(`tournament:${tournamentId}`);
  eventBus.emit("tournaments_all");
}
