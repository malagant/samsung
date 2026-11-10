/** Parse a hex string (whitespace allowed) into bytes. Returns null on malformed input. */
export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** 0xFF means "no reading". */
export const NO_READING = 0xff;
/** 0x05 is used as a null sentinel (it would decode to -50 °C). */
export const NULL_SENTINEL = 0x05;

/** Temperature encoding: byte − 55 °C, with sentinels mapped to null. */
export function temp(b: number | undefined): number | null {
  if (b === undefined || b === NO_READING || b === NULL_SENTINEL) return null;
  return b - 55;
}

export function u16be(bytes: Uint8Array, i: number): number | null {
  const hi = bytes[i];
  const lo = bytes[i + 1];
  if (hi === undefined || lo === undefined) return null;
  return (hi << 8) | lo;
}

export function i16be(bytes: Uint8Array, i: number): number | null {
  const v = u16be(bytes, i);
  if (v === null) return null;
  return v & 0x8000 ? v - 0x10000 : v;
}
