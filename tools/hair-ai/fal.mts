// Minimal fal.ai client for the hair pipeline (tools/build-ai-hair.mts): queue submit, poll, fetch, download, and the
// spend ledger (dev/hair-ai/LEDGER.md). The key is read at runtime from FAL_KEY or the file named by FAL_KEY_FILE
// (default /home/user/apis/Fal.ai; format `id:secret`, optionally prefixed `NAME=`) and is never printed or stored.
// Only queue.fal.run / fal.run are used (api.fal.ai sits behind a proxy that overrides authorisation).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Approximate prices in USD per call (fal.ai pricing: schnell 0.003 / MP, dev 0.025 / MP, TRELLIS 0.02 per model). */
export const PRICE = { 'fal-ai/flux/schnell': 0.003, 'fal-ai/flux/dev': 0.025, 'fal-ai/trellis': 0.02 } as const;
export type FalModel = keyof typeof PRICE;

export function falKey(): string {
  let k = process.env.FAL_KEY?.trim();
  if (!k) {
    const file = process.env.FAL_KEY_FILE ?? '/home/user/apis/Fal.ai';
    if (!existsSync(file)) throw new Error(`no FAL_KEY and no key file at ${file}`);
    k = readFileSync(file, 'utf8').trim().replace(/^[A-Za-z_][A-Za-z0-9_]*=/, '').trim();
  }
  if (!k) throw new Error('empty fal.ai key');
  return k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(url: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const r = await fetch(url, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`fal ${init.method ?? 'GET'} ${url.replace(/\/requests\/.*/, '/requests/..')} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Submits to the queue, polls until done and returns the response body. */
export async function falRun(model: FalModel, input: Record<string, unknown>, onStatus?: (s: string) => void): Promise<any> {
  const sub = await api(`https://queue.fal.run/${model}`, { method: 'POST', body: input });
  for (let i = 0; i < 400; i++) {
    const st = await api(sub.status_url);
    onStatus?.(st.status);
    if (st.status === 'COMPLETED') return api(sub.response_url);
    if (st.status !== 'IN_QUEUE' && st.status !== 'IN_PROGRESS') throw new Error(`fal request ${st.status}: ${JSON.stringify(st).slice(0, 300)}`);
    await sleep(2000);
  }
  throw new Error('fal request timed out');
}

export async function download(url: string, file: string): Promise<number> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url} -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return buf.length;
}

// ---- ledger ----

const LEDGER_HEAD = `# fal.ai spend ledger (hair pipeline)

Estimated cost per call from the published prices (FLUX schnell 0.003 per megapixel, FLUX dev 0.025 per megapixel, TRELLIS 0.02 per
model). Written by tools/hair-ai/fal.mts before every paid call; the tool refuses to run past the cap (HAIR_AI_BUDGET, default 3.00).
Cached results in dev/hair-ai/raw/ are reused, so rebuilding costs nothing.

| When (UTC) | Model | What | Est. USD |
|---|---|---|---|
`;

export const LEDGER = new URL('../../dev/hair-ai/LEDGER.md', import.meta.url).pathname;
export const BUDGET = Number(process.env.HAIR_AI_BUDGET ?? 3);

export function ledgerTotal(): number {
  if (!existsSync(LEDGER)) return 0;
  let t = 0;
  for (const line of readFileSync(LEDGER, 'utf8').split('\n')) {
    const m = /^\|[^|]*\|[^|]*\|[^|]*\|\s*([0-9.]+)\s*\|\s*$/.exec(line);
    if (m) t += Number(m[1]);
  }
  return t;
}

/** Books a paid call; throws when it would pass the cap. */
export function charge(model: string, what: string, usd: number): void {
  const total = ledgerTotal();
  if (total + usd > BUDGET) throw new Error(`budget: ${total.toFixed(3)} + ${usd.toFixed(3)} would pass the cap of ${BUDGET.toFixed(2)} USD`);
  if (!existsSync(LEDGER)) { mkdirSync(dirname(LEDGER), { recursive: true }); writeFileSync(LEDGER, LEDGER_HEAD); }
  appendFileSync(LEDGER, `| ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | ${model} | ${what} | ${usd.toFixed(3)} |\n`);
}
