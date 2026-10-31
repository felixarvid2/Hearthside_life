// JSON safety checks. The world state must survive JSON.stringify/parse unchanged (docs/ARCHITECTURE.md);
// saving verifies that before writing so a broken state is reported instead of silently losing data.

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Compares `original` with its JSON round trip `parsed` and returns the path and reason of the first difference,
 * or null. Properties whose value is `undefined` count as absent (JSON drops them and no reader can tell the
 * difference); `undefined` inside an array, NaN/Infinity, functions, Maps, Sets, Dates and class instances do not.
 */
export function firstJsonDifference(original: unknown, parsed: unknown, path = 'state'): string | null {
  switch (typeof original) {
    case 'string':
    case 'boolean':
      return original === parsed ? null : `${path} changes when saved`;
    case 'number':
      if (!Number.isFinite(original)) return `${path} is ${String(original)} (it would be saved as null)`;
      return original === parsed ? null : `${path} changes when saved`;
    case 'undefined':
      return `${path} is undefined (it would be saved as null)`;
    case 'function':
    case 'symbol':
    case 'bigint':
      return `${path} is a ${typeof original}, which cannot be saved`;
    default:
      break;
  }
  if (original === null) return parsed === null ? null : `${path} changes when saved`;
  const obj = original as object;
  if (Array.isArray(obj)) {
    if (!Array.isArray(parsed) || parsed.length !== obj.length) return `${path} changes length when saved`;
    for (let i = 0; i < obj.length; i++) {
      const d = firstJsonDifference(obj[i], parsed[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (!isPlainObject(obj)) {
    const name = (obj as { constructor?: { name?: string } }).constructor?.name ?? 'object';
    return `${path} is a ${name}, not plain data`;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return `${path} changes type when saved`;
  const rec = obj as Record<string, unknown>;
  const out = parsed as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const value = rec[key];
    if (value === undefined) continue;
    if (typeof value === 'function' || typeof value === 'symbol') return `${path}.${key} is a ${typeof value}, which cannot be saved`;
    if (!Object.prototype.hasOwnProperty.call(out, key)) return `${path}.${key} is lost when saved`;
    const d = firstJsonDifference(value, out[key], `${path}.${key}`);
    if (d) return d;
  }
  for (const key of Object.keys(out)) {
    if (rec[key] === undefined) return `${path}.${key} appears when saved`;
  }
  return null;
}

export type SerializeResult = { ok: true; json: string } | { ok: false; error: string };

/** Serializes to JSON and proves the round trip is lossless. Runs synchronously so later mutation cannot affect the result. */
export function serializeChecked(value: unknown): SerializeResult {
  let json: string;
  try { json = JSON.stringify(value); } catch (e) {
    return { ok: false, error: `The game state cannot be converted to JSON (${e instanceof Error ? e.message : 'unknown error'}).` };
  }
  if (json === undefined) return { ok: false, error: 'The game state cannot be converted to JSON.' };
  const diff = firstJsonDifference(value, JSON.parse(json) as unknown);
  return diff ? { ok: false, error: `The game state is not plain data: ${diff}.` } : { ok: true, json };
}

/** FNV-1a over UTF-16 code units, prefixed with the length: detects truncated or altered stored data. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${h.toString(16)}`;
}
