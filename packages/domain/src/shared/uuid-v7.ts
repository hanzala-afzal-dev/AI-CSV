import { randomBytes } from "node:crypto";

const maximumUnixMilliseconds = 0xffffffffffff;

export function createUuidV7(unixMilliseconds = Date.now()): string {
  if (
    !Number.isSafeInteger(unixMilliseconds) ||
    unixMilliseconds < 0 ||
    unixMilliseconds > maximumUnixMilliseconds
  ) {
    throw new RangeError("UUIDv7 timestamp is outside the supported range.");
  }

  const bytes = randomBytes(16);
  let timestamp = BigInt(unixMilliseconds);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn);
    timestamp >>= 8n;
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
