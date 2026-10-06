// ULIDs: 48-bit time + 80 random bits, Crockford base32, 26 characters, sortable by time.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let lastTime = -1;
let lastRandom: number[] = [];

function randomDigits(): number[] {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b & 31);
}

/** A new ULID. Monotonic within one process: ids made in the same millisecond still sort in creation order. */
export function ulid(): string {
  let now = Date.now();
  let random: number[];
  if (now <= lastTime) {
    random = increment(lastRandom);
    now = lastTime;
  } else {
    random = randomDigits();
  }
  lastTime = now;
  lastRandom = random;

  let time = "";
  for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;
  return time + random.map((d) => ALPHABET[d]).join("");
}

function increment(digits: number[]): number[] {
  const next = [...digits];
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! < 31) {
      next[i]!++;
      return next;
    }
    next[i] = 0;
  }
  throw new Error("ULID random component overflowed within one millisecond");
}

/** The creation time (ms since the epoch) encoded in a ULID. */
export function ulidTime(id: string): number {
  let t = 0;
  for (const c of id.slice(0, 10)) t = t * 32 + ALPHABET.indexOf(c);
  return t;
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
