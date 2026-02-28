import { tickAutoStart, tickEliminations } from "../services/engineService";

export function startGameWorker() {
  //Check for wheels that need auto-start
  setInterval(async () => {
    try {
      await tickAutoStart();
    } catch (e) {
      console.error("AUTO-START TICK ERROR:", e);
    }
  }, 1000);

  //Process eliminations every second (but only executes if 7s passed)
  setInterval(async () => {
    try {
      await tickEliminations();
    } catch (e) {
      console.error("ELIMINATION TICK ERROR:", e);
    }
  }, 1000);

  console.log("Game worker started (auto-start + eliminations)");
}