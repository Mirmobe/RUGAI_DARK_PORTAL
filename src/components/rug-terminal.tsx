import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, Lock, ScanLine, Snowflake, Users } from "lucide-react";
import { scanMintFn } from "@/lib/rugai.functions";
import type { ScanReport, Tone } from "@/lib/rugai.server";

const PRESETS = [
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
  { symbol: "WIF", mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm" },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
] as const;

const STEPS = ["opening the mint account", "weighing pools", "counting holders", "asking the overlord"];

type Recent = { mint: string; symbol: string; score: number; band: ScanReport["band"] };

function bandLabel(band: ScanReport["band"]) {
  if (band === "high") return "RUGAI risk: HIGH";
  if (band === "watch") return "RUGAI risk: WATCH";
  return "RUGAI risk: CLEANER THAN MOST";
}

function money(value: number | null, digits: "price" | "size") {
  if (value == null || !Number.isFinite(value)) return "—";
  if (digits === "price") {
    if (value >= 1) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    if (value >= 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toPrecision(3)}`;
  }
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function toneClass(tone: Tone) {
  if (tone === "bad") return "text-danger";
  if (tone === "ok") return "text-phosphor";
  return "text-fg";
}

function short(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function deltaText(delta: number) {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "—";
}

export function RugTerminal() {
  const [mint, setMint] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [clock, setClock] = useState("CHAIN-ONLINE");

  useEffect(() => {
    const tick = () => setClock(`${new Date().toISOString().slice(11, 19)} UTC`);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("rugai.recent");
      if (!stored) return;
      const parsed = JSON.parse(stored) as Recent[];
      if (Array.isArray(parsed)) setRecent(parsed.slice(0, 4));
    } catch {
      /* ignore broken local history */
    }
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const id = window.setInterval(() => setStep((current) => (current + 1) % STEPS.length), 700);
    return () => window.clearInterval(id);
  }, [busy]);

  async function scan(nextMint: string) {
    const trimmed = nextMint.trim();
    setMint(trimmed);
    setError(null);
    setBusy(true);
    try {
      const result = await scanMintFn({ data: { mint: trimmed } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReport(result.report);
      const entry: Recent = {
        mint: result.report.mint,
        symbol: result.report.symbol,
        score: result.report.score,
        band: result.report.band,
      };
      setRecent((current) => {
        const next = [entry, ...current.filter((item) => item.mint !== entry.mint)].slice(0, 4);
        localStorage.setItem("rugai.recent", JSON.stringify(next));
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scan failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crt min-h-screen">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 pb-16 sm:px-6">
        <header className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="flex items-center gap-2 tracking-widest">
            <span className="live-dot inline-block size-2 rounded-full bg-danger" aria-hidden="true" />
            RUGNET://TERMINAL
          </span>
          <span className="tabular-nums">{clock}</span>
        </header>

        <section className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <img
            src="/mascot.jpg"
            alt="RUGAI, a circuit-faced overlord holding a red RUG switch"
            className="h-auto w-40 shrink-0 self-center border border-dim object-contain sm:w-52 sm:self-auto"
          />
          <div>
            <p className="text-xs tracking-widest text-phosphor">PROTOCOL 01</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-wide text-phosphor sm:text-5xl">
              RUGAI <span className="text-danger">PROTOCOL</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-pretty text-muted">
              An overlord trained on rug patterns. Paste a Solana mint. Get a heuristic risk read — not a
              promise.
            </p>
          </div>
        </section>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void scan(mint);
          }}
        >
          <label className="sr-only" htmlFor="mint">
            Solana mint address
          </label>
          <input
            id="mint"
            value={mint}
            onChange={(event) => setMint(event.target.value)}
            placeholder="paste Solana mint address"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-12 flex-1 border border-dim bg-bg px-3 text-base text-fg outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 border border-phosphor bg-ink px-5 font-display text-sm font-semibold tracking-widest text-phosphor enabled:hover:bg-phosphor enabled:hover:text-ink disabled:opacity-60"
          >
            <ScanLine className="size-4" aria-hidden="true" />
            {busy ? "SCANNING" : "SCAN"}
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.mint}
              type="button"
              disabled={busy}
              onClick={() => void scan(preset.mint)}
              className="min-h-11 border border-dim px-3 text-xs tracking-wide text-muted hover:border-phosphor hover:text-phosphor disabled:opacity-60"
            >
              {preset.symbol}
            </button>
          ))}
          {recent.map((item) => (
            <button
              key={item.mint}
              type="button"
              disabled={busy}
              onClick={() => void scan(item.mint)}
              className="min-h-11 border border-dim px-3 text-xs text-muted hover:border-phosphor hover:text-phosphor disabled:opacity-60"
            >
              {item.symbol} {item.score}
            </button>
          ))}
        </div>

        <section className="bezel p-4 sm:p-5" aria-live="polite">
          {busy ? (
            <div>
              <p className="text-xs tracking-widest text-phosphor">SCAN IN PROGRESS</p>
              <p className="mt-2 break-all text-sm text-muted">{mint || "mint"}</p>
              <p className="mt-3 text-sm">
                {STEPS[step]}
                <span className="text-phosphor"> _</span>
              </p>
            </div>
          ) : error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : report ? (
            <ReportView report={report} />
          ) : (
            <Idle />
          )}
        </section>

        <section className="bezel flex flex-col items-center gap-4 p-4 sm:flex-row sm:items-center" aria-label="Tip jar">
          <a href="https://paypal.me/mirmobe" target="_blank" rel="noreferrer" className="shrink-0">
            <img src="/tip-qr.png" alt="QR code that opens PayPal for @Mirmobe" className="h-40 w-40" />
          </a>
          <div className="text-center sm:text-left">
            <h2 className="font-display text-lg font-semibold tracking-wide text-phosphor">TIP JAR</h2>
            <p className="mt-1 max-w-sm text-sm text-pretty text-muted">
              Scan the code to tip @Mirmobe on PayPal. The scan stays free either way.
            </p>
            <a
              href="https://paypal.me/mirmobe"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex min-h-11 items-center text-sm text-phosphor underline-offset-2 hover:underline"
            >
              paypal.me/mirmobe
            </a>
          </div>
        </section>

        <footer className="flex flex-col gap-2 text-xs text-muted">
          <p>
            <a className="text-phosphor underline-offset-2 hover:underline" href="https://mirmobe3.wordpress.com/">
              Mirmobe
            </a>
            {" · "}
            <a className="text-phosphor underline-offset-2 hover:underline" href="https://aetheraimin.grok.me/">
              Aetheramin
            </a>
            {" · "}
            <a className="text-phosphor underline-offset-2 hover:underline" href="https://glass-ceiling-star-map.grok.me/">
              Mirmobe Sky
            </a>
          </p>
          <p>
            Not financial advice. A revoked mint does not mean the pool is safe. Concentrated-liquidity pools
            have no LP token to burn.
          </p>
        </footer>
      </div>
    </div>
  );
}

function Idle() {
  const cards = [
    { icon: KeyRound, title: "Mint key", body: "Live mint authority means supply can still grow." },
    { icon: Snowflake, title: "Freeze key", body: "A live freeze can lock holder accounts." },
    { icon: Lock, title: "LP lock", body: "Burned or locked AMM liquidity. CLMM pools are marked, not faked." },
    { icon: Users, title: "Holders", body: "Top wallets and insider flags from RugCheck." },
  ];
  return (
    <div>
      <p className="text-xs tracking-widest text-muted">AWAITING CONTRACT CALL</p>
      <p className="mt-2 text-sm text-pretty">
        RUGAI weighs on-chain authorities, pool depth, and holder concentration. It does not invent a lock it
        cannot see.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.title} className="border border-dim p-3">
            <div className="flex items-center gap-2 text-phosphor">
              <card.icon className="size-4" aria-hidden="true" />
              <span className="font-display text-sm font-semibold tracking-wide">{card.title}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{card.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportView({ report }: { report: ScanReport }) {
  const scoreClass = report.band === "high" ? "text-danger" : "text-phosphor";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-widest text-muted">{bandLabel(report.band)}</p>
          <h2 className="mt-1 truncate text-2xl font-semibold">
            {report.symbol} <span className="text-base font-normal text-muted">{report.name}</span>
          </h2>
        </div>
        {report.image ? (
          <img src={report.image} alt="" className="h-12 w-12 shrink-0 border border-dim object-cover" />
        ) : null}
      </div>
      <div>
        <p className={`font-display text-6xl font-semibold tabular-nums leading-none ${scoreClass}`}>
          {report.score}
          <span className="text-2xl">%</span>
        </p>
        <div className="mt-3 h-2 bg-bg">
          <div className="risk-fill" style={{ width: `${report.score}%` }} />
        </div>
      </div>
      <blockquote className="border-l-2 border-phosphor pl-3 text-sm text-pretty">
        {report.line}
        <footer className="mt-1 text-xs tracking-widest text-muted">OVERLORD</footer>
      </blockquote>
      {report.partial ? (
        <p className="text-xs text-muted">
          One source timed out. The score uses whichever endpoints answered ({report.sources.join(", ")}).
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-px bg-dim sm:grid-cols-4">
        <Stat k="Price" v={money(report.priceUsd, "price")} />
        <Stat k="Liquidity" v={money(report.liquidityUsd, "size")} />
        <Stat k="24h vol" v={money(report.volume24h, "size")} />
        <Stat k="Holders" v={report.holders == null ? "—" : report.holders.toLocaleString("en-US")} />
      </dl>
      <div>
        <h3 className="text-xs tracking-widest text-muted">HOW THE SCORE MOVED</h3>
        <ul className="mt-2 divide-y divide-dim">
          {report.reasons.map((reason) => (
            <li key={reason.label} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className={`block text-sm ${toneClass(reason.tone)}`}>{reason.label}</span>
                <span className="block text-xs text-muted">{reason.detail}</span>
              </span>
              <span className={`shrink-0 text-sm tabular-nums ${toneClass(reason.tone)}`}>
                {deltaText(reason.delta)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {report.risks.length > 0 ? (
        <div>
          <h3 className="text-xs tracking-widest text-muted">RUGCHECK FLAGS</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {report.risks.map((risk) => (
              <li key={risk.name} className="text-sm">
                <span className={/danger|error|critical/i.test(risk.level) ? "text-danger" : "text-phosphor"}>
                  {risk.name}
                </span>
                {risk.description ? <span className="text-muted"> — {risk.description}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.topHolders.length > 0 ? (
        <div>
          <h3 className="text-xs tracking-widest text-muted">TOP HOLDERS</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {report.topHolders.map((holder) => (
              <li key={holder.address} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                <span className="min-w-0">
                  <a
                    className="text-phosphor underline-offset-2 hover:underline"
                    href={`https://solscan.io/account/${holder.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(holder.address)}
                  </a>
                  {holder.insider ? <span className="ml-2 text-xs text-danger">INSIDER</span> : null}
                  <span className="mt-1 block h-1 bg-bg">
                    <span className="block h-1 bg-phosphor" style={{ width: `${Math.min(100, holder.pct)}%` }} />
                  </span>
                </span>
                <span className="tabular-nums text-muted">{holder.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <OutLink href={`https://rugcheck.xyz/tokens/${report.mint}`}>RugCheck</OutLink>
        <OutLink href={`https://solscan.io/token/${report.mint}`}>Solscan</OutLink>
        {report.dexUrl ? <OutLink href={report.dexUrl}>DexScreener</OutLink> : null}
        {report.rugcheckNorm != null ? (
          <span className="text-muted">RugCheck index {report.rugcheckNorm}</span>
        ) : null}
        {report.supplyLabel ? <span className="text-muted">Supply {report.supplyLabel}</span> : null}
      </div>
      <p className="break-all text-xs text-muted">{report.mint}</p>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-panel px-3 py-2">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-sm tabular-nums">{v}</dd>
    </div>
  );
}

function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-phosphor underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden="true" />
    </a>
  );
}
