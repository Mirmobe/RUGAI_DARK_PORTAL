export type Tone = "bad" | "ok" | "neutral";

export type Reason = {
  label: string;
  detail: string;
  tone: Tone;
  delta: number;
};

export type HolderRow = {
  address: string;
  pct: number;
  insider: boolean;
};

export type RiskRow = {
  name: string;
  description: string;
  level: string;
};

export type ScanReport = {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  score: number;
  band: "high" | "watch" | "clean";
  line: string;
  lineSource: "overlord";
  partial: boolean;
  sources: string[];
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  holders: number | null;
  reasons: Reason[];
  risks: RiskRow[];
  topHolders: HolderRow[];
  dexUrl: string | null;
  rugcheckNorm: number | null;
  supplyLabel: string | null;
};

export type ScanResult =
  | { ok: true; report: ScanReport }
  | { ok: false; error: string };

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYSTEM_MINT = "11111111111111111111111111111111";

type RugMarket = {
  marketType?: string;
  mintLP?: string;
  lp?: { lpLockedPct?: number };
};

type RugHolder = {
  address?: string;
  owner?: string;
  pct?: number;
  insider?: boolean;
};

type RugRisk = {
  name?: string;
  description?: string;
  level?: string;
};

type RugReport = {
  mint?: string;
  score_normalised?: number;
  rugged?: boolean;
  risks?: RugRisk[];
  topHolders?: RugHolder[];
  totalHolders?: number;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  price?: number | string | null;
  token?: {
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    supply?: number | string;
    decimals?: number;
  };
  tokenMeta?: { name?: string; symbol?: string };
  fileMeta?: { image?: string; name?: string; symbol?: string };
  markets?: RugMarket[];
};

type DexPair = {
  url?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  baseToken?: { address?: string; name?: string; symbol?: string };
  info?: { imageUrl?: string };
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function authorityLive(value: string | null | undefined): boolean {
  return typeof value === "string" && value.length > 0;
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "RUGAI/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function isClmm(market: RugMarket): boolean {
  const kind = (market.marketType ?? "").toLowerCase();
  if (market.mintLP === SYSTEM_MINT) return true;
  return (
    kind.includes("dlmm") ||
    kind.includes("clmm") ||
    kind.includes("whirl") ||
    kind.includes("orca") ||
    kind.includes("concentrated")
  );
}

function supplyLabel(supply: number | string | undefined, decimals: number | undefined): string | null {
  if (supply == null || decimals == null) return null;
  const raw = typeof supply === "string" ? Number(supply) : supply;
  if (!Number.isFinite(raw)) return null;
  const whole = raw / 10 ** decimals;
  if (!Number.isFinite(whole) || whole <= 0) return null;
  if (whole >= 1e12) return `${(whole / 1e12).toFixed(2)}T`;
  if (whole >= 1e9) return `${(whole / 1e9).toFixed(2)}B`;
  if (whole >= 1e6) return `${(whole / 1e6).toFixed(2)}M`;
  return whole.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function bandFor(score: number): ScanReport["band"] {
  if (score >= 60) return "high";
  if (score >= 30) return "watch";
  return "clean";
}

function lineFor(band: ScanReport["band"]): string {
  if (band === "high") {
    return "The overlord smells a pull. A live key, a crowded wallet, or a thin pool moved the needle.";
  }
  if (band === "watch") {
    return "Not a clean bill. Something on this mint still has a hand on the switch.";
  }
  return "Cleaner than most. A revoked mint still does not mean the pool is safe.";
}

function push(reasons: Reason[], reason: Reason) {
  reasons.push(reason);
}

export async function scanMint(rawMint: string): Promise<ScanResult> {
  const mint = rawMint.trim();
  if (!MINT_RE.test(mint)) {
    return { ok: false, error: "That is not a Solana mint address." };
  }

  const [rugSettled, dexSettled] = await Promise.allSettled([
    getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`),
    getJson(`https://api.dexscreener.com/latest/dex/tokens/${mint}`),
  ]);

  const rug = rugSettled.status === "fulfilled" ? rugSettled.value : null;
  const dex = dexSettled.status === "fulfilled" ? dexSettled.value : null;
  const sources: string[] = [];
  if (rug?.ok) sources.push("RugCheck");
  if (dex?.ok) sources.push("DexScreener");

  const rugMissing = !rug?.ok && rug?.status === 404;
  if (sources.length === 0) {
    return {
      ok: false,
      error: rugMissing
        ? "RugCheck does not know that mint."
        : "Both RugCheck and DexScreener timed out. Try the scan again.",
    };
  }

  const report = (rug?.ok ? rug.body : null) as RugReport | null;
  const pairs = ((dex?.ok && dex.body && typeof dex.body === "object"
    ? (dex.body as { pairs?: DexPair[] | null }).pairs
    : null) ?? []) as DexPair[];
  const pair =
    pairs
      .filter((item) => item.baseToken?.address === mint || item.baseToken)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;

  const reasons: Reason[] = [];
  const mintAuth = report?.token?.mintAuthority ?? report?.mintAuthority;
  const freezeAuth = report?.token?.freezeAuthority ?? report?.freezeAuthority;

  if (report) {
    if (authorityLive(mintAuth)) {
      push(reasons, {
        label: "Mint key live",
        detail: "Supply can still grow.",
        tone: "bad",
        delta: 30,
      });
    } else {
      push(reasons, {
        label: "Mint key revoked",
        detail: "No mint authority on the account.",
        tone: "ok",
        delta: -6,
      });
    }
    if (authorityLive(freezeAuth)) {
      push(reasons, {
        label: "Freeze key live",
        detail: "A freeze can lock holder accounts.",
        tone: "bad",
        delta: 24,
      });
    } else {
      push(reasons, {
        label: "Freeze key revoked",
        detail: "No freeze authority on the account.",
        tone: "ok",
        delta: -4,
      });
    }
    if (report.rugged) {
      push(reasons, {
        label: "Marked rugged",
        detail: "RugCheck already flags this mint as rugged.",
        tone: "bad",
        delta: 35,
      });
    }
    const norm = num(report.score_normalised);
    if (norm != null) {
      const delta = Math.round(Math.min(40, norm * 0.4));
      push(reasons, {
        label: "RugCheck index",
        detail: `Normalised score ${norm}. Higher means more flags.`,
        tone: delta >= 16 ? "bad" : delta >= 6 ? "neutral" : "ok",
        delta,
      });
    }

    const markets = report.markets ?? [];
    const amm = markets.filter((market) => !isClmm(market));
    if (markets.length === 0) {
      push(reasons, {
        label: "No pool on RugCheck",
        detail: "No market was returned. Lock status was not invented.",
        tone: "neutral",
        delta: 8,
      });
    } else if (amm.length === 0) {
      push(reasons, {
        label: "Concentrated liquidity",
        detail: "CLMM pools have no LP token to burn. Not marked locked.",
        tone: "neutral",
        delta: 0,
      });
    } else {
      const locked = Math.max(...amm.map((market) => num(market.lp?.lpLockedPct) ?? 0));
      if (locked >= 95) {
        push(reasons, {
          label: "LP locked",
          detail: `${locked.toFixed(0)}% of the AMM LP RugCheck measured is locked.`,
          tone: "ok",
          delta: -10,
        });
      } else if (locked >= 50) {
        push(reasons, {
          label: "LP partly locked",
          detail: `${locked.toFixed(0)}% locked. The rest can still be pulled.`,
          tone: "neutral",
          delta: 6,
        });
      } else {
        push(reasons, {
          label: "LP not locked",
          detail: "AMM liquidity is not burned or locked in what RugCheck returned.",
          tone: "bad",
          delta: 16,
        });
      }
    }

    const holders = report.topHolders ?? [];
    const top = holders[0] ? num(holders[0].pct) : null;
    if (top != null && top >= 30) {
      push(reasons, {
        label: "Top wallet heavy",
        detail: `Largest holder has ${top.toFixed(1)}%.`,
        tone: "bad",
        delta: 18,
      });
    } else if (top != null && top >= 15) {
      push(reasons, {
        label: "Top wallet notable",
        detail: `Largest holder has ${top.toFixed(1)}%.`,
        tone: "neutral",
        delta: 8,
      });
    }
    const top10 = holders.slice(0, 10).reduce((sum, holder) => sum + (num(holder.pct) ?? 0), 0);
    if (holders.length >= 5 && top10 >= 70) {
      push(reasons, {
        label: "Holder concentration",
        detail: `Top wallets hold ${top10.toFixed(0)}%.`,
        tone: "bad",
        delta: 10,
      });
    }
    const insiders = holders.filter((holder) => holder.insider).length;
    if (insiders > 0) {
      push(reasons, {
        label: "Insider flags",
        detail: `${insiders} top holder${insiders === 1 ? "" : "s"} flagged by RugCheck.`,
        tone: "bad",
        delta: Math.min(18, insiders * 6),
      });
    }

    const danger = (report.risks ?? []).filter((risk) =>
      /danger|error|critical/i.test(risk.level ?? ""),
    ).length;
    const warns = (report.risks ?? []).filter((risk) => /warn/i.test(risk.level ?? "")).length;
    if (danger > 0) {
      push(reasons, {
        label: "Critical flags",
        detail: `${danger} RugCheck flag${danger === 1 ? "" : "s"} at danger level.`,
        tone: "bad",
        delta: Math.min(36, danger * 12),
      });
    }
    if (warns > 0) {
      push(reasons, {
        label: "Warnings",
        detail: `${warns} RugCheck warning${warns === 1 ? "" : "s"}.`,
        tone: warns > 2 ? "bad" : "neutral",
        delta: Math.min(16, warns * 4),
      });
    }
    const holderCount = num(report.totalHolders);
    if (holderCount != null && holderCount < 20) {
      push(reasons, {
        label: "Thin holder set",
        detail: `${holderCount.toLocaleString("en-US")} holders.`,
        tone: "bad",
        delta: 14,
      });
    } else if (holderCount != null && holderCount < 100) {
      push(reasons, {
        label: "Few holders",
        detail: `${holderCount.toLocaleString("en-US")} holders.`,
        tone: "neutral",
        delta: 6,
      });
    }
  } else {
    push(reasons, {
      label: "RugCheck missed",
      detail: rugMissing ? "No RugCheck report for this mint." : "RugCheck did not answer.",
      tone: "neutral",
      delta: 0,
    });
  }

  const liquidity = num(pair?.liquidity?.usd);
  const volume = num(pair?.volume?.h24);
  const price = num(pair?.priceUsd) ?? num(report?.price);
  if (!pair) {
    push(reasons, {
      label: "No DexScreener pool",
      detail: "No priced pair came back. Depth was not guessed.",
      tone: "neutral",
      delta: report ? 8 : 0,
    });
  } else if (liquidity != null && liquidity < 2_000) {
    push(reasons, {
      label: "Thin pool",
      detail: "Deepest pair is under $2k of liquidity.",
      tone: "bad",
      delta: 22,
    });
  } else if (liquidity != null && liquidity < 15_000) {
    push(reasons, {
      label: "Shallow pool",
      detail: "Deepest pair is under $15k of liquidity.",
      tone: "bad",
      delta: 12,
    });
  } else if (liquidity != null && liquidity >= 250_000) {
    push(reasons, {
      label: "Deep pool",
      detail: "Deepest pair holds at least $250k.",
      tone: "ok",
      delta: -8,
    });
  }

  const score = Math.max(0, Math.min(100, reasons.reduce((sum, reason) => sum + reason.delta, 0)));
  const band = bandFor(score);
  const symbol = report?.tokenMeta?.symbol || report?.fileMeta?.symbol || pair?.baseToken?.symbol || "UNKNOWN";
  const name = report?.tokenMeta?.name || report?.fileMeta?.name || pair?.baseToken?.name || "Unnamed mint";

  return {
    ok: true,
    report: {
      mint,
      symbol,
      name,
      image: report?.fileMeta?.image || pair?.info?.imageUrl || null,
      score,
      band,
      line: lineFor(band),
      lineSource: "overlord",
      partial: sources.length < 2,
      sources,
      priceUsd: price,
      liquidityUsd: liquidity,
      volume24h: volume,
      holders: num(report?.totalHolders),
      reasons,
      risks: (report?.risks ?? []).slice(0, 8).map((risk) => ({
        name: risk.name || "Flag",
        description: risk.description || "",
        level: risk.level || "info",
      })),
      topHolders: (report?.topHolders ?? []).slice(0, 8).map((holder) => ({
        address: holder.owner || holder.address || "",
        pct: num(holder.pct) ?? 0,
        insider: Boolean(holder.insider),
      })).filter((holder) => holder.address),
      dexUrl: pair?.url ?? null,
      rugcheckNorm: num(report?.score_normalised),
      supplyLabel: supplyLabel(report?.token?.supply, report?.token?.decimals),
    },
  };
}
