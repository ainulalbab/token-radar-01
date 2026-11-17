// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board ranks EVERY rankable pre-token protocol in the snapshot (not just the 40 on the
// watchlist): the watchlist is the floor, and the early rows below it are the radar's whole point.
// A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id, no
// symbol); protocols whose token already trades are kept apart and shown with the market's own
// values, never mixed into the ranked board.
//
// Implied value is FITTED from the snapshot's own trading set, not asserted and not a name list:
//
//   1. Fit set: the trading protocols that report a market cap (128 of them here).
//   2. Size curve: ordinary least squares on log10(market cap) against log10(TVL):
//        log10(mcap) = intercept + slope * log10(tvl)
//      On this snapshot slope is about 0.52, intercept about 3.03: value grows with size, but
//      sublinearly, so a $2.7B protocol is worth proportionally less per TVL dollar than a $50M one.
//   3. Category adjustment: for each category, the median of log10(actual / curve) over its trading
//      protocols, shrunk toward 0 by n / (n + 8) so a category with one or two members barely moves
//      the curve. Categories with no trading member get no adjustment.
//   4. base      = 10 ^ (intercept + slope * log10(tvl) + category adjustment)
//      growth    = clamp(change_7d, -30, +30) per cent
//      growthMult   = 1 + (growth / 100) * 0.5          (a momentum prior, range 0.85..1.15)
//      maturity  = 0.75 + 0.25 * min(age, 1095) / 1095  (a survival prior, range 0.75..1.00;
//                                                        age unknown: the pre-token median age)
//      implied   = max(1, round(base * growthMult * maturity))
//
// Growth and age are priors, not fitted effects: on the trading set neither predicts the residual
// (correlation -0.14 with 7-day growth, -0.03 with age), so they are kept small on purpose. The
// fitted parts are the size curve and the category adjustment, and they are validated out of sample
// by validateFit: a deterministic even/odd split of the trading set, fit on one half, scored on the
// other. On this snapshot the model scores a median absolute log10 error of 0.54 (28% of predictions
// within 2x, 42% within 3x) against 0.71 for a flat 0.25x-TV multiple. No protocol name is ever
// special-cased: the same function scores every row.
//
// Two categories are not ranked at all, by category, not by name: bridges and canonical bridges.
// Their TVL is other protocols' assets passing through (wrapped BTC, a chain's canonical bridge, an
// exchange's bridge), not a product of their own, and they issue no token of their own — the
// snapshot's own top rows would otherwise be WBTC and the Coinbase and Base bridges, which cannot
// launch a token. They are counted, not hidden: buildRadar reports how many were set aside.

/** Categories the board does not rank: their TVL is other protocols' assets passing through. */
export const EXCLUDED_CATEGORIES = ['Bridge', 'Canonical Bridge'];

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted size curve plus its category adjustments, as the dashboard states them. */
export interface ModelFit {
  slope: number;
  intercept: number;
  /** log10 adjustment per category, already shrunk; categories absent here get 0. */
  category_adjustment: Record<string, number>;
  /** How many trading protocols the fit was learned from. */
  fit_size: number;
  /** The global median market-cap-per-TVL-dollar of the fit set, for reference. */
  global_median_multiple: number;
}

/** The model's fixed priors: growth and maturity weights, documented in the header. */
export interface ModelPriors {
  growth_floor: number;
  growth_cap: number;
  growth_weight: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
}

export const PRIORS: ModelPriors = {
  growth_floor: -30,
  growth_cap: 30,
  growth_weight: 0.5,
  maturity_floor: 0.75,
  maturity_range: 0.25,
  maturity_days: 1095,
};

/** Shrinkage strength for a category's residual: n / (n + CATEGORY_SHRINK). */
export const CATEGORY_SHRINK = 8;

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_curve_usd: number;
    category_adjustment: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  /** Whether the protocol is one of the snapshot's 40 watchlist slugs. */
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The out-of-sample check of the fitted model, run on the snapshot itself. */
export interface FitValidation {
  test_size: number;
  median_abs_log10_error: number;
  within_2x: number;
  within_3x: number;
  baseline_median_abs_log10_error: number;
}

/** Everything the dashboard needs: the board, the live set, the fit and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  priors: ModelPriors;
  fit: ModelFit;
  validation: FitValidation;
  unknown_age_days: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** Bridges and canonical bridges set aside unranked, by category (see the model header). */
  excluded_bridges: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-unsorted number list; NaN when empty. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol belongs to the fit set: it trades and reports a market cap. */
function isFittable(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** Ordinary least squares on log10(market cap) against log10(TVL) over the fit set. */
function olsFit(fitSet: SnapshotProtocol[]): { slope: number; intercept: number } {
  const xs = fitSet.map((p) => Math.log10(p.tvl_usd));
  const ys = fitSet.map((p) => Math.log10(p.mcap_usd!));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/** The size curve's prediction for one protocol, in dollars, before any category adjustment. */
function curveValue(p: SnapshotProtocol, slope: number, intercept: number): number {
  return Math.pow(10, intercept + slope * Math.log10(p.tvl_usd));
}

/**
 * Fit the model on the snapshot's trading set: the size curve, then each category's shrunk
 * residual in log10 space. Deterministic: the fit set is taken in slug order.
 */
export function fitModel(snapshot: Snapshot): ModelFit {
  const fitSet = snapshot.protocols.filter(isFittable).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  if (fitSet.length < 10) throw new SnapshotError(`snapshot has ${fitSet.length} trading protocols with a market cap: too few to fit the size curve`);
  const { slope, intercept } = olsFit(fitSet);
  const byCategory = new Map<string, number[]>();
  for (const p of fitSet) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(Math.log10(p.mcap_usd! / curveValue(p, slope, intercept)));
    byCategory.set(key, list);
  }
  const category_adjustment: Record<string, number> = {};
  for (const [key, residuals] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    category_adjustment[key] = (residuals.length / (residuals.length + CATEGORY_SHRINK)) * median(residuals);
  }
  const global_median_multiple = median(fitSet.map((p) => p.mcap_usd! / p.tvl_usd));
  return { slope, intercept, category_adjustment, fit_size: fitSet.length, global_median_multiple };
}

/** The median absolute log10 error of predictions against market caps, and the shares within 2x/3x. */
function scorePredictions(
  testSet: SnapshotProtocol[],
  predict: (p: SnapshotProtocol) => number,
): { median_abs_log10_error: number; within_2x: number; within_3x: number } {
  const errors = testSet.map((p) => Math.abs(Math.log10(predict(p) / p.mcap_usd!))).sort((a, b) => a - b);
  const within = (factor: number): number => errors.filter((e) => e < Math.log10(factor)).length / errors.length;
  return { median_abs_log10_error: median(errors), within_2x: within(2), within_3x: within(3) };
}

/**
 * Validate the fitted model out of sample: split the trading set deterministically (even/odd by
 * slug order), fit on one half, score on the other, and score the flat global-median multiple on
 * the same half as the baseline.
 */
export function validateFit(snapshot: Snapshot): FitValidation {
  const fitSet = snapshot.protocols.filter(isFittable).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const train = fitSet.filter((_, i) => i % 2 === 0);
  const test = fitSet.filter((_, i) => i % 2 === 1);
  const { slope, intercept } = olsFit(train);
  const byCategory = new Map<string, number[]>();
  for (const p of train) {
    const key = p.category ?? 'Uncategorised';
    const list = byCategory.get(key) ?? [];
    list.push(Math.log10(p.mcap_usd! / curveValue(p, slope, intercept)));
    byCategory.set(key, list);
  }
  const adjusted = (p: SnapshotProtocol): number => {
    const residuals = byCategory.get(p.category ?? 'Uncategorised');
    const adj = residuals === undefined ? 0 : (residuals.length / (residuals.length + CATEGORY_SHRINK)) * median(residuals);
    return curveValue(p, slope, intercept) * Math.pow(10, adj);
  };
  const scored = scorePredictions(test, adjusted);
  const globalMedian = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const baseline = scorePredictions(test, (p) => p.tvl_usd * globalMedian);
  return {
    test_size: test.length,
    median_abs_log10_error: scored.median_abs_log10_error,
    within_2x: scored.within_2x,
    within_3x: scored.within_3x,
    baseline_median_abs_log10_error: baseline.median_abs_log10_error,
  };
}

/** The median age in days of the pre-token protocols that report a listed date. */
export function medianPreTokenAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const m = median(ages);
  return Number.isFinite(m) ? Math.round(m) : 365;
}

/** The multipliers and the implied value one protocol gets under the fitted model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: ModelFit,
  priors: ModelPriors,
  unknownAgeDays: number,
): { implied: number; baseCurve: number; categoryAdjustment: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const categoryAdjustment = fit.category_adjustment[protocol.category ?? 'Uncategorised'] ?? 0;
  const baseCurve = curveValue(protocol, fit.slope, fit.intercept) * Math.pow(10, categoryAdjustment);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(priors.growth_cap, Math.max(priors.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * priors.growth_weight;
  const ageForModel = age ?? unknownAgeDays;
  const maturityMult =
    priors.maturity_floor + (Math.min(Math.max(ageForModel, 0), priors.maturity_days) / priors.maturity_days) * priors.maturity_range;
  const implied = Math.max(1, Math.round(baseCurve * growthMult * maturityMult));
  return { implied, baseCurve, categoryAdjustment, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a bridge. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && !EXCLUDED_CATEGORIES.includes(p.category ?? '');
}

/** Whether a protocol was set aside only because it is a bridge: counted, not hidden. */
export function isExcludedBridge(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name) && EXCLUDED_CATEGORIES.includes(p.category ?? '');
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  fit: ModelFit,
  priors: ModelPriors,
  unknownAgeDays: number,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any size. No TVL cutoff, no
  // cap: the board is the whole pre-token universe the snapshot records.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, priors, unknownAgeDays);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_curve_usd: Math.round(s.baseCurve),
      category_adjustment: round4(s.categoryAdjustment),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The gas a single transaction on the protocol's first chain usually costs, as a range. */
function gasFor(p: SnapshotProtocol): string {
  const chain = (p.chains[0] ?? '').toLowerCase();
  if (chain.includes('ethereum')) return 'about $3 to $8 of gas';
  if (chain.includes('solana')) return 'under $0.10 of fees';
  if (chain.includes('base') || chain.includes('arbitrum') || chain.includes('optimism') || chain.includes('polygon')) {
    return 'under $0.50 of gas';
  }
  return 'about $1 to $3 of gas';
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit earning for the full hold.`;
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} and keep the position in range.`;
  }
  if (c.includes('leveraged farm')) {
    return `Open a $${capital} leveraged farming position on ${name} on ${chain} at low leverage and monitor its health.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and leave the shares compounding.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge $${capital} of USDC through ${name} to ${chain} and put the bridged funds to work in its app.`;
  }
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged trade.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} on ${chain} and place one position in an active prediction market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares for the full hold.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in its savings vault.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it for the full hold.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the full hold.`;
  }
  if (c.includes('payment')) {
    return `Route $${capital} of payments through ${name} on ${chain} and repeat the route every month.`;
  }
  if (c.includes('chain')) {
    return `Bridge $${capital} to ${name}'s chain, use its native app once, and keep the funds on the chain.`;
  }
  if (c.includes('governance')) {
    return `Deposit $${capital} into ${name}'s governance vault on ${chain} and vote on its next proposal.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full hold.`;
}

/** The category's second qualifying action: a different interaction from the first. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Borrow $${Math.max(10, Math.round(capital / 5))} against the deposit on ${name} and repay it within a week.`;
  }
  if (c.includes('dex') || c.includes('amm') || c.includes('liquidity manager')) {
    return `Swap $${Math.max(10, Math.round(capital / 5))} through ${name}'s pool on ${chain} and keep the receipt.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Claim or harvest the vault's rewards on ${name} once, then redeposit them into the same vault.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Bridge a second, smaller amount back through ${name} so the route is used in both directions.`;
  }
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) {
    return `Use the receipt token as collateral or liquidity on ${chain} once, then return it to the wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Close the first trade on ${name} and open a second one in the opposite direction with the same margin.`;
  }
  if (c.includes('prediction')) {
    return `Settle the first market on ${name} and place a second position in a different market.`;
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return `Read ${name}'s latest allocation report and move the deposit to its newest vault once.`;
  }
  if (c.includes('stable')) {
    return `Swap a small amount of the stable asset for USDC on ${chain} and back, to show two-way use.`;
  }
  if (c.includes('rwa')) {
    return `Check the asset's backing report on ${name}'s own page and keep the holding after reading it.`;
  }
  if (c.includes('insurance')) {
    return `File one test claim check on ${name}'s cover page so the policy is exercised, not just bought.`;
  }
  if (c.includes('payment')) {
    return `Send a second payment through ${name} to a different address on ${chain}.`;
  }
  if (c.includes('chain')) {
    return `Use a second native app on ${name}'s chain with the same wallet, such as its swap or lending app.`;
  }
  if (c.includes('governance')) {
    return `Vote on a second proposal on ${name} and keep the voting receipt in the wallet.`;
  }
  return `Use a second feature of ${name} on ${chain} once, such as its swap, vault or rewards page.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Costs are the capital at stake plus the chain's usual gas; times are the setup, the
 * weekly cadence and the hold.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(p);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: `${gas} and no new capital`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a swap, a vote or a claim, so the wallet stays active.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, then open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: `the $${capital} stays in the position; no fee to check, and never pay to claim`,
      time: `${hold} days, then 10 minutes`,
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and decide the exit in advance: unwind in one transaction when the token launches or the position stops paying.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, carrying the farm plan the page renders. */
export function radarRow(row: BoardRow, watchlist: ReadonlySet<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const validation = validateFit(snapshot);
  const unknownAgeDays = medianPreTokenAge(snapshot);
  const board = buildBoard(snapshot, fit, PRIORS, unknownAgeDays);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const excludedBridges = snapshot.protocols.filter(isExcludedBridge).length;
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    priors: PRIORS,
    fit,
    validation,
    unknown_age_days: unknownAgeDays,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded_bridges: excludedBridges,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
