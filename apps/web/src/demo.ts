/**
 * Demo snapshot until the API serves live data (step 3). Values are a real
 * reading of the owner's SAC_EHS_MONO from 2026-11-10; the 24 h mode history
 * is a sample pattern.
 */
export const demo = {
  model: "Samsung EHS Mono",
  updatedAt: new Date("2026-11-10T11:11:00Z"),
  flowTemp: 32.2,
  flowSetpoint: 32.5,
  returnTemp: 39.0,
  heatingOn: true,
  dhwOn: true,
  dhwTemp: 44.4,
  dhwSetpoint: 47,
  dhwMode: "eco" as const,
  dhwState: "standby" as const,
  outdoorTemp: 5.0,
  outdoorMin: 4.0,
  outdoorMax: 5.0,
  energyKwh24h: 1.6,
  compressorHz: 42,
  flowRateLpm: 19,
  pumpPercent: 100,
  boostTarget: 50,
  curve: { coldOutdoor: -10, coldFlow: 38, warmOutdoor: 20, warmFlow: 27 },
  timeline: [
    ["idle", 3],
    ["heating", 5],
    ["idle", 2],
    ["dhw", 2],
    ["idle", 4],
    ["heating", 8],
    ["idle", 3],
    ["heating", 6],
    ["dhw", 3],
    ["idle", 5],
    ["heating", 7],
    ["idle", 2],
  ] as Array<["heating" | "dhw" | "idle", number]>,
};
