// Pulse — the token launch radar's model (own work, Node 22, standard library only).
//
// The snapshot is DefiLlama's protocol list, frozen at one fetch. A protocol's
// launch is the token it may issue one day; this model asks what that token
// would be worth if the protocol's record stayed as it is, and what a reader
// should do to farm it before it issues one. It never predicts whether or
// when a token is issued, and a protocol that records no token may still have
// one its DefiLlama record does not carry.
//
// The board ranks the protocols that could still launch: they record no
// token, and they are not a wrapped, staked or bridged product of a token
// that already trades, not a centralised exchange, and not a versioned
// re-release of another protocol. The watchlist is the floor, never the
// ceiling: every protocol on it is ranked, and so are the smaller pre-token
// protocols below the floor, because the radar exists to find them early.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  watchlist: boolean;
  growth_pct: number;
  growth_mult: number;
  maturity_mult: number;
  category_mult: number;
  chain_mult: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  symbol: string | null;
}

export interface RadarData {
  asOf: string;
  source: string;
  floorUsd: number;
  watchlistSize: number;
  rankedSize: number;
  preTokenSize: number;
  boardTvlUsd: number;
  rows: RadarRow[];
  live: LiveRow[];
  model: {
    version: string;
    baseMultiple: number;
    growthNote: string;
    maturityNote: string;
  };
}

export const MODEL_VERSION = 'pulse-1';

/** The base multiple: a launch is worth thirty cents per dollar of TVL. */
const BASE_MULTIPLE = 0.3;

/** Categories that are not launches at all: a product of a token that trades. */
const NOT_A_LAUNCH = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAMES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

/** How much a category's token is worth per dollar of TVL, relative to the base. */
const CATEGORY_MULT: Record<string, number> = {
  Dexs: 1.0,
  Lending: 1.0,
  Yield: 1.0,
  Derivatives: 0.95,
  'Prediction Market': 0.95,
  RWA: 0.9,
  'Risk Curators': 0.9,
  'Onchain Capital Allocator': 0.9,
  CDP: 0.9,
};

const DAY_MS = 86_400_000;

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from listed_at to as_of, or null when the snapshot names no date. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00.000Z`);
  const end = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / DAY_MS);
}

/** A protocol that records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** A pre-token protocol that could still be a launch of its own. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

export interface Implied {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  categoryMult: number;
  chainMult: number;
  age: number | null;
}

/**
 * What a protocol's token would be worth if its record stayed as it is:
 * its TVL times the base multiple, moved by how fast it is growing, how
 * long it has run with no token, what kind of protocol it is, and how many
 * chains it runs on. Growth is the strongest mover after TVL itself: a
 * protocol gaining 20% of TVL in a week is worth roughly a quarter more
 * than one standing still, and one losing 20% roughly a quarter less.
 */
export function impliedValue(p: SnapshotProtocol, asOf: string): Implied {
  const growthPct = p.change_7d === null ? 0 : clamp(p.change_7d, -30, 80);
  const growthMult = 1 + (growthPct / 100) * 1.2;
  const age = ageDays(asOf, p.listed_at);
  const maturityMult =
    age === null ? 1.0 : age < 90 ? 0.95 : age < 365 ? 1.05 : age < 730 ? 1.15 : 1.25;
  const categoryMult =
    p.category !== null && p.category in CATEGORY_MULT
      ? CATEGORY_MULT[p.category]!
      : 0.85;
  const chainMult = 1 + Math.min(Math.max(p.chains.length - 1, 0), 5) * 0.02;
  const implied = Math.max(
    1,
    Math.round(p.tvl_usd * BASE_MULTIPLE * growthMult * maturityMult * categoryMult * chainMult),
  );
  return { implied, growthPct, growthMult, maturityMult, categoryMult, chainMult, age };
}

/** The farming capital for a protocol, from the size of its TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 2000;
  if (p.tvl_usd >= 100_000_000) return 1000;
  if (p.tvl_usd >= 10_000_000) return 500;
  return 200;
}

/** How long to keep a farm running, from how long the protocol has run. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 90) return 30;
  if (age < 365) return 60;
  return 90;
}

/** The core action for a protocol, in its own category's words. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const money = `$${capital.toLocaleString('en-US')}`;
  switch (p.category) {
    case 'Dexs':
      return `Provide ${money} of liquidity to ${p.name}'s main pool on ${chain} (gas about $0.50–2 per transaction) and leave the position open.`;
    case 'Lending':
      return `Supply ${money} to ${p.name}'s lending market on ${chain} and borrow a small amount against it (gas about $0.50–2 per transaction), so the position is active on both sides.`;
    case 'Yield':
      return `Deposit ${money} into ${p.name}'s highest-TVL vault on ${chain} (gas about $0.50–2 per transaction) and leave the deposit compounding.`;
    case 'Derivatives':
      return `Open a small hedged position worth ${money} on ${p.name} on ${chain} (gas about $0.50–2 per transaction) and keep the margin posted.`;
    case 'RWA':
      return `Deposit ${money} into ${p.name}'s tokenized-asset pool on ${chain} (gas about $0.50–2 per transaction) and hold the receipt tokens.`;
    case 'Prediction Market':
      return `Place small weekly predictions totalling ${money} on ${p.name} (gas about $0.50–2 per transaction) so the account shows steady use.`;
    case 'Risk Curators':
      return `Deposit ${money} into a ${p.name} curator vault on ${chain} (gas about $0.50–2 per transaction) and leave the allocation working.`;
    case 'Onchain Capital Allocator':
      return `Allocate ${money} through ${p.name}'s vault on ${chain} (gas about $0.50–2 per transaction) and keep the allocation in place.`;
    case 'CDP':
      return `Lock ${money} of collateral and mint stablecoins on ${p.name} (${chain}) (gas about $0.50–2 per transaction), keeping the position safely over-collateralised.`;
    default:
      return `Use ${p.name}'s core product on ${chain} with ${money} (gas about $0.50–2 per transaction) and keep the position open.`;
  }
}

/**
 * Five concrete farm steps for a protocol: fund it, take the core position,
 * come back weekly, spread to a second chain or product, and keep records
 * with an exit plan. Every step carries what it costs and how long it takes.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const money = `$${capital.toLocaleString('en-US')}`;
  const chain = p.chains[0] ?? 'its main chain';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const steps: string[] = [];
  steps.push(
    `Bridge ${money} of USDC to ${chain} with the official bridge (about $1–3 in gas, 10–20 minutes) and keep it in the one wallet you will farm from.`,
  );
  steps.push(coreAction(p, capital, chain));
  steps.push(
    `Come back weekly for ${hold} days: repeat the core action at least once a week so the activity log shows ${hold} days of regular use, not a single deposit.`,
  );
  if (second !== null) {
    steps.push(
      `Open a second position on ${second} with $${Math.floor(capital / 2).toLocaleString('en-US')} so the farm covers two chains; a snapshot that counts chains pays for both.`,
    );
  } else {
    steps.push(
      `Add a second product line on ${chain} with $${Math.floor(capital / 2).toLocaleString('en-US')} (a second pool, market or vault) so the farm is not one position in one place.`,
    );
  }
  steps.push(
    `Log every deposit in a note (date, amount, transaction hash, wallet) and withdraw in two tranches after any token announcement, keeping half in for a week in case the snapshot is taken after it.`,
  );
  return steps;
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== 'object' || raw === null) throw new Error('snapshot is not an object');
  const s = raw as Record<string, unknown>;
  if (typeof s.as_of !== 'string' || typeof s.source !== 'string') {
    throw new Error('snapshot has no as_of or source');
  }
  if (!Array.isArray(s.protocols) || !Array.isArray(s.watchlist)) {
    throw new Error('snapshot has no protocols or watchlist');
  }
  return {
    as_of: s.as_of,
    source: s.source,
    floor_usd: finite(s.floor_usd, 0),
    protocols: s.protocols as SnapshotProtocol[],
    watchlist: s.watchlist as string[],
  };
}

/** Build the ranked board and the dashboard's data from one snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const watch = new Set(snapshot.watchlist);
  const rankable = snapshot.protocols.filter(isRankable);
  const scored = rankable.map((p) => ({ p, v: impliedValue(p, snapshot.as_of) }));
  scored.sort((a, b) => {
    if (b.v.implied !== a.v.implied) return b.v.implied - a.v.implied;
    if (b.p.tvl_usd !== a.p.tvl_usd) return b.p.tvl_usd - a.p.tvl_usd;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });
  const rows: RadarRow[] = scored.map(({ p, v }, i) => ({
    slug: p.slug,
    name: p.name,
    rank: i + 1,
    implied_value_usd: v.implied,
    farm_steps: farmSteps(p, v.age),
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: v.age,
    listed_at: p.listed_at,
    watchlist: watch.has(p.slug),
    growth_pct: v.growthPct,
    growth_mult: Math.round(v.growthMult * 10000) / 10000,
    maturity_mult: v.maturityMult,
    category_mult: v.categoryMult,
    chain_mult: v.chainMult,
  }));
  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 12)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      symbol: p.symbol,
    }));
  const radar: RadarData = {
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
    watchlistSize: snapshot.watchlist.length,
    rankedSize: rows.length,
    preTokenSize: snapshot.protocols.filter(isPreToken).length,
    boardTvlUsd: rows.reduce((sum, r) => sum + r.tvl_usd, 0),
    rows,
    live,
    model: {
      version: MODEL_VERSION,
      baseMultiple: BASE_MULTIPLE,
      growthNote: 'Growth moves value: +20% in 7 days is worth about a quarter more, −20% about a quarter less.',
      maturityNote: 'Age moves value: under 90 days 0.95×, 90–365 days 1.05×, 1–2 years 1.15×, over 2 years 1.25×.',
    },
  };
  return { board, radar };
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) {
    return `board holds ${board.length} rows, not 100 to 4000`;
  }
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let prev = Number.POSITIVE_INFINITY;
  let allSame = board.length > 1;
  for (const row of board) {
    if (!slugs.has(row.slug)) return `row ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank < 1 || !Number.isInteger(row.rank)) return `row ${row.slug} has a bad rank`;
    if (row.implied_value_usd < 1 || !Number.isInteger(row.implied_value_usd)) {
      return `row ${row.slug} has a bad implied value`;
    }
    if (row.implied_value_usd > prev) return `implied value rises at rank ${row.rank}`;
    // Equal values are allowed; only a board where every value is the same is refused.
    if (prev !== Number.POSITIVE_INFINITY && row.implied_value_usd !== prev) allSame = false;
    prev = row.implied_value_usd;
    if (row.name.trim().length === 0) return `row ${row.slug} has no name`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps.length} farm steps, not 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const n = step.trim().length;
      if (n < 20 || n > 600) return `row ${row.slug} has a farm step of ${n} characters`;
    }
  }
  if (allSame) return 'every implied value is the same: the board ranks nothing';
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1 to ${board.length}`;
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: one global the page reads, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
