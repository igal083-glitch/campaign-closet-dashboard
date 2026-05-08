import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "campaign-trading-journal-v1-8-real-qty-fix";

const actions = [
  "כניסה",
  "הוספה",
  "סטופ כולל",
  "סטופ הוספה",
  "יציאה חלקית",
  "יציאה מלאה",
  "הערה",
];

const tradePatterns = [
  "פריצה / Breakout",
  "ספייק / Spike",
  "Pullback Continuation",
  "Base / Range",
  "Accumulation",
  "Reclaim",
  "Gap & Go",
  "Failed Breakdown",
  "אחר",
];

const starterData = [
  {
    id: "FOSL-1",
    date: "02/05/2026",
    ticker: "FOSL",
    shares: "740",
    entry: "1.58",
    stop: "3.85",
    lastAdd: "4.20",
    status: "פעיל",
    closedDate: "",
    exitPrice: "",
    pattern: "פריצה / Breakout",
    thesis: "קמפיין שמחזיק מבנה אחרי פריצה. לא להדק סטופ מוקדם מדי.",
    addTrigger: "",
    plannedAddSize: "",
    localStop: "",
    addInvalidation: "",
    chartImage: "",
    chartImageName: "",
    journal: [
      { date: "02/05/2026", action: "כניסה", qty: "740", price: "1.58", stop: "1.35", note: "כניסת ליבה" },
      { date: "02/05/2026", action: "הוספה", qty: "", price: "4.20", stop: "3.85", note: "הוספה אחרי המשך" },
    ],
  },
  {
    id: "NVAX-1",
    date: "02/05/2026",
    ticker: "NVAX",
    shares: "980",
    entry: "7.90",
    stop: "6.50",
    lastAdd: "10.70",
    status: "פעיל",
    closedDate: "",
    exitPrice: "",
    pattern: "ספייק / Spike",
    thesis: "מניית תנודתיות. לא קמפיין נקי, אבל עם פוטנציאל ספייק.",
    addTrigger: "",
    plannedAddSize: "",
    localStop: "",
    addInvalidation: "",
    chartImage: "",
    chartImageName: "",
    journal: [
      { date: "02/05/2026", action: "כניסה", qty: "980", price: "7.90", stop: "6.50", note: "כניסה ראשונה" },
    ],
  },
];

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function makeId(ticker = "ROW") {
  return `${ticker || "ROW"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function num(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function hasExplicitStop(row) {
  return row && row.stop !== null && row.stop !== undefined && String(row.stop).trim() !== "";
}

function displayStop(row) {
  return hasExplicitStop(row) ? row.stop : "";
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}$${n.toFixed(2)}`;
}

function percent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function parseDateDMY(value) {
  if (!value || typeof value !== "string") return null;
  const [d, m, y] = value.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function durationDays(row) {
  if ((row.status || "").trim() !== "סגור") return null;
  const start = parseDateDMY(row.date);
  const end = parseDateDMY(row.closedDate);
  if (!start || !end) return null;
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return days >= 0 ? days : null;
}

function getPositionMath(row) {
  const journal = Array.isArray(row.journal) ? row.journal : [];

  let openQty = 0;
  let openCost = 0;
  let buyQty = 0;
  let buyCost = 0;
  let sellQty = 0;
  let sellValue = 0;
  let realizedPnl = 0;
  let hasRealized = false;

  const validBuyLines = journal.filter((j) => {
    const qty = num(j.qty);
    const price = num(j.price);
    return (j.action === "כניסה" || j.action === "הוספה") && qty > 0 && price;
  });

  const hasJournalBuys = validBuyLines.length > 0;

  if (!hasJournalBuys) {
    const qty = num(row.shares) || 0;
    const price = num(row.entry) || 0;

    if (qty > 0 && price > 0) {
      openQty = qty;
      openCost = qty * price;
      buyQty = qty;
      buyCost = qty * price;
    }
  }

  function buy(qty, price) {
    if (!qty || !price || qty <= 0 || price <= 0) return;

    openQty += qty;
    openCost += qty * price;
    buyQty += qty;
    buyCost += qty * price;
  }

  function sell(qty, price) {
    if (!qty || !price || qty <= 0 || price <= 0 || openQty <= 0) return;

    const actualQty = Math.min(qty, openQty);
    const avgBeforeSale = openCost / openQty;
    const saleValue = actualQty * price;
    const costRemoved = actualQty * avgBeforeSale;

    realizedPnl += saleValue - costRemoved;
    sellQty += actualQty;
    sellValue += saleValue;

    openQty -= actualQty;
    openCost -= costRemoved;

    if (openQty <= 0.000001) {
      openQty = 0;
      openCost = 0;
    }

    hasRealized = true;
  }

  journal.forEach((j) => {
    const action = j.action;
    const rawQty = num(j.qty);
    const price = num(j.price);

    if (!price) return;

    // כניסה / הוספה עם Qty חיובי = קנייה
    // כניסה / הוספה עם Qty שלילי = הפחתת כמות, למשל סטופ/מכירה שהוזנה במינוס
    if (action === "כניסה" || action === "הוספה") {
      if (!rawQty) return;

      if (rawQty > 0) {
        buy(rawQty, price);
      } else {
        sell(Math.abs(rawQty), price);
      }

      return;
    }

    // סטופ הוספה = מכירת יחידת הוספה. לא משנה Global Stop.
    if (action === "סטופ הוספה") {
      if (!rawQty) return;
      sell(Math.abs(rawQty), price);
      return;
    }

    if (action === "יציאה חלקית") {
      if (!rawQty) return;
      sell(Math.abs(rawQty), price);
      return;
    }

    if (action === "יציאה מלאה") {
      const closeQty = rawQty ? Math.abs(rawQty) : openQty;
      sell(closeQty, price);
    }
  });

  const avgPrice = openQty ? openCost / openQty : buyQty ? buyCost / buyQty : null;

  return {
    openQty,
    openCost: openQty ? openCost : 0,
    buyQty,
    buyCost,
    sellQty,
    sellValue,
    avgPrice,
    realizedPnl: hasRealized ? realizedPnl : null,
  };
}

function totalBoughtQty(row) {
  return getPositionMath(row).buyQty || num(row.shares) || 0;
}

function openShares(row) {
  return getPositionMath(row).openQty || 0;
}

function avgCost(row) {
  return getPositionMath(row).avgPrice;
}

function positionValue(row) {
  const math = getPositionMath(row);
  const mark = num(row.lastAdd) || num(row.entry);
  if (math.openQty && mark) return math.openQty * mark;
  const shares = num(row.shares);
  const entry = num(row.entry);
  return shares && entry ? shares * entry : null;
}

function positionRisk(row) {
  if ((row.status || "").trim() === "סגור") return null;
  if (!hasExplicitStop(row)) return null;

  const shares = openShares(row) || num(row.shares);
  const price = num(row.lastAdd) || num(row.entry);
  const stop = num(row.stop);

  if (!shares || !price || stop === null) return null;

  const risk = (price - stop) * shares;
  return risk > 0 ? risk : null;
}

function riskPercent(row) {
  const risk = positionRisk(row);
  const value = positionValue(row);

  if (risk === null || !value) return null;
  return (risk / value) * 100;
}

function totalExposure(rows) {
  return rows
    .filter((r) => r.status !== "סגור")
    .reduce((sum, row) => sum + (positionValue(row) || 0), 0);
}

function totalPortfolioRisk(rows) {
  return rows
    .filter((r) => r.status !== "סגור")
    .reduce((sum, row) => sum + (positionRisk(row) || 0), 0);
}

function highestRiskPosition(rows) {
  const active = rows.filter((r) => r.status !== "סגור");
  if (!active.length) return null;

  return active.reduce((max, row) => {
    const risk = positionRisk(row) || 0;
    const maxRisk = max ? positionRisk(max) || 0 : -1;
    return risk > maxRisk ? row : max;
  }, null);
}

function unrealizedPnl(row) {
  if ((row.status || "").trim() === "סגור") return null;
  const math = getPositionMath(row);
  const mark = num(row.lastAdd) || num(row.entry);
  if (!math.openQty || !math.avgPrice || !mark) return null;
  return (mark - math.avgPrice) * math.openQty;
}

function getExitPrice(row) {
  const manual = num(row.exitPrice);
  if (manual !== null) return manual;
  const line = [...(row.journal || [])].reverse().find((j) => j.action === "יציאה מלאה" && String(j.price || "").trim());
  return line ? num(line.price) : null;
}

function closedPnl(row) {
  if ((row.status || "").trim() !== "סגור") return null;
  const math = getPositionMath(row);
  if (math.realizedPnl !== null) return math.realizedPnl;

  const shares = num(row.shares);
  const entry = num(row.entry);
  const exit = getExitPrice(row);
  if (!shares || !entry || exit === null) return null;
  return (exit - entry) * shares;
}

function closedReturn(row) {
  const pnl = closedPnl(row);
  const math = getPositionMath(row);
  const invested = math.buyCost || (num(row.shares) || 0) * (num(row.entry) || 0);
  if (pnl === null || !invested) return null;
  return (pnl / invested) * 100;
}

function lastBuyPrice(journal, fallback) {
  const line = [...(journal || [])]
    .reverse()
    .find((j) => {
      const qty = num(j.qty);
      return (j.action === "כניסה" || j.action === "הוספה") && qty > 0 && String(j.price || "").trim();
    });

  return line ? line.price : fallback || "";
}

function getAddCount(row) {
  return (row.journal || []).filter((j) => j.action === "הוספה").length;
}

function getLastAddLine(row) {
  return [...(row.journal || [])].reverse().find((j) => j.action === "הוספה" && String(j.price || "").trim());
}

function getTradeManagement(row) {
  const entry = num(row.entry);
  const price = num(row.lastAdd) || entry;
  const stop = hasExplicitStop(row) ? num(row.stop) : null;
  const avg = avgCost(row);
  const pnl = unrealizedPnl(row);
  const addCount = getAddCount(row);
  const lastAdd = getLastAddLine(row);

  if (!entry || !price || !stop) {
    return {
      status: "NO DATA",
      color: "zinc",
      title: "חסר מידע לניהול העסקה",
      addDecision: "לא לשקול הוספה כרגע",
      structure: "חסר כניסה / מחיר נוכחי / סטופ.",
      risk: "אי אפשר למדוד Risk Distance.",
      management: "השלם נתונים לפני החלטת ניהול.",
      journalQuality: "בדוק שיש תזה, סטופ ופעולות יומן.",
    };
  }

  const distanceFromEntry = ((price - entry) / entry) * 100;
  const riskDistance = ((price - stop) / price) * 100;
  const pnlPct = avg ? ((price - avg) / avg) * 100 : null;

  const hasThesis = Boolean(String(row.thesis || "").trim());
  const hasChart = Boolean(row.chartImage);
  const hasJournal = (row.journal || []).length > 0;
  const hasAddPlan = Boolean(String(row.addTrigger || "").trim()) && Boolean(String(row.localStop || "").trim());

  let status = "WAIT";
  let color = "amber";
  let title = "להמתין לבייס / Pullback מסודר";
  let addDecision = "לא להוסיף עכשיו — לחכות לאישור מבני";

  if (riskDistance <= 0) {
    status = "DANGER";
    color = "red";
    title = "מחיר קרוב מדי לסטופ או מתחתיו";
    addDecision = "לא להוסיף. לבדוק אם המבנה נשבר.";
  } else if (distanceFromEntry <= 12 && riskDistance <= 15 && addCount <= 3) {
    status = "VALID ADD ZONE";
    color = "emerald";
    title = "אזור הוספה אפשרי";
    addDecision = "אפשר לשקול הוספה קטנה, רק אם הגרף מאשר Higher Low / Base.";
  } else if (distanceFromEntry > 25) {
    status = "NO ADD";
    color = "red";
    title = "המניה רחוקה מדי מהבסיס";
    addDecision = "לא להוסיף — זה Chasing. לחכות לבייס חדש.";
  } else if (addCount >= 5) {
    status = "LATE STAGE";
    color = "amber";
    title = "שלב מתקדם בקמפיין";
    addDecision = "הוספה נוספת רק אחרי Base איכותי מאוד וסטופ מקומי ברור.";
  }

  const structure =
    distanceFromEntry > 25
      ? "Extended / רחוקה מהכניסה. צריך Base חדש לפני הוספה."
      : distanceFromEntry <= 12
      ? "עדיין יחסית קרובה לבסיס. מתאים לבדוק Pullback / Higher Low."
      : "באמצע תנועה. לא אזור אידיאלי להוספה בלי התכנסות.";

  const risk =
    riskDistance > 20
      ? `Risk Distance גבוה (${riskDistance.toFixed(1)}%). הסטופ רחוק מדי להוספה נוחה.`
      : `Risk Distance נשלט (${riskDistance.toFixed(1)}%).`;

  const management =
    pnl !== null && pnl < 0
      ? "העסקה תחת לחץ. לא להוסיף להפסד בלי הוכחת מבנה."
      : pnlPct !== null && pnlPct > 20
      ? "העסקה ברווח יפה. ניהול לפי מבנה עדיף על יציאה מהירה."
      : "להמתין להתנהגות מחיר מסודרת לפני פעולה נוספת.";

  const journalQuality = [
    hasThesis ? "תזה קיימת" : "חסרה תזה",
    hasChart ? "גרף שמור" : "אין צילום גרף",
    hasJournal ? "יומן קיים" : "אין פעולות יומן",
    lastAdd ? `הוספה אחרונה: ${lastAdd.price}` : "אין הוספה אחרונה",
    hasAddPlan ? "Add Plan קיים" : "חסר Add Plan",
  ].join(" | ");

  return {
    status,
    color,
    title,
    addDecision,
    structure,
    risk,
    management,
    journalQuality,
  };
}

function colorClasses(color) {
  if (color === "emerald") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (color === "red") return "border-red-500/40 bg-red-500/10 text-red-400";
  if (color === "amber") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-zinc-800 bg-zinc-950 text-zinc-400";
}

function drawerThemeClass(theme) {
  switch (theme) {
    case "gray":
      return "bg-zinc-800 text-white border-zinc-700";
    case "white":
      return "bg-white text-black border-zinc-300";
    case "beige":
      return "bg-amber-50 text-black border-amber-200";
    default:
      return "bg-zinc-950 text-white border-zinc-800";
  }
}

function tradingViewSymbol(ticker) {
  const clean = String(ticker || "").trim().toUpperCase();
  if (!clean) return "";
  return clean.includes(":") ? clean : `NASDAQ:${clean}`;
}

function openTradingViewWeb(ticker) {
  const symbol = tradingViewSymbol(ticker);
  if (!symbol) {
    alert("אין טיקר לפתיחה");
    return;
  }
  window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`, "_blank");
}

function drawerButtonClass(active, activeClass) {
  return `rounded px-3 py-1 text-xs font-bold transition ${
    active ? activeClass : "border border-zinc-700 bg-black/20 text-zinc-300 hover:border-amber-500 hover:text-amber-300"
  }`;
}

function InfoCard({ label, value, color = "text-white" }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black p-3 text-right">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 font-bold ${color}`} dir="ltr">{value}</div>
    </div>
  );
}

export default function ClosetDashboard() {
  const [rows, setRows] = useState(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem("campaign-dashboard-clean-v5-risk-add-plan") ||
        localStorage.getItem("campaign-dashboard-clean-v7-drawer-tabs") ||
        localStorage.getItem("campaign-trading-journal-v1-3-stop-fix") ||
        localStorage.getItem("campaign-trading-journal-v1-2-calculation-fix") ||
        localStorage.getItem("campaign-dashboard-clean-v4-trade-management") ||
        localStorage.getItem("campaign-dashboard-clean-v3-trade-management") ||
        localStorage.getItem("campaign-dashboard-clean-v2") ||
        localStorage.getItem("campaign-dashboard-clean");

      const parsed = saved ? JSON.parse(saved) : starterData;
      return parsed.map((r) => ({ ...r, id: r.id || makeId(r.ticker) }));
    } catch {
      return starterData;
    }
  });

  const [viewMode, setViewMode] = useState("active");
  const [selectedId, setSelectedId] = useState(starterData[0].id);
  const [tickerDrafts, setTickerDrafts] = useState({});
  const [closeModal, setCloseModal] = useState(null);
  const [showEquityHelp, setShowEquityHelp] = useState(false);
  const [drawerTheme, setDrawerTheme] = useState(() => localStorage.getItem("drawer-theme") || "black");
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [drawerTab, setDrawerTab] = useState("overview");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    localStorage.setItem("drawer-theme", drawerTheme);
  }, [drawerTheme]);

  const visibleRows = useMemo(() => {
    return rows.filter((r) => (viewMode === "history" ? r.status === "סגור" : r.status !== "סגור"));
  }, [rows, viewMode]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId), [rows, selectedId]);
  const tradeManagement = selected ? getTradeManagement(selected) : null;

  const stats = useMemo(() => {
    const closed = rows.filter((r) => r.status === "סגור");
    const pnlList = closed.map(closedPnl).filter((v) => v !== null);
    const winners = pnlList.filter((v) => v > 0).length;
    const losers = pnlList.filter((v) => v < 0).length;

    return {
      total: rows.length,
      active: rows.filter((r) => r.status !== "סגור").length,
      closed: closed.length,
      winners,
      losers,
      breakeven: pnlList.filter((v) => v === 0).length,
      winRate: pnlList.length ? (winners / pnlList.length) * 100 : null,
      totalPnl: pnlList.reduce((sum, v) => sum + v, 0),
    };
  }, [rows]);

  const patternStats = useMemo(() => {
    const result = {};
    rows.forEach((r) => {
      const key = r.pattern || "ללא תבנית";
      result[key] = (result[key] || 0) + 1;
    });
    return result;
  }, [rows]);

  const patternPerformance = useMemo(() => {
    const map = {};
    rows.filter((r) => r.status === "סגור").forEach((r) => {
      const pnl = closedPnl(r);
      if (pnl === null) return;

      const key = r.pattern || "ללא תבנית";
      if (!map[key]) map[key] = { trades: 0, wins: 0, losses: 0, totalPnl: 0 };

      map[key].trades += 1;
      map[key].totalPnl += pnl;
      if (pnl > 0) map[key].wins += 1;
      if (pnl < 0) map[key].losses += 1;
    });

    return Object.entries(map).map(([pattern, data]) => ({
      pattern,
      ...data,
      winRate: data.trades ? (data.wins / data.trades) * 100 : 0,
      expectancy: data.trades ? data.totalPnl / data.trades : 0,
    }));
  }, [rows]);

  const durationPerformance = useMemo(() => {
    const buckets = {
      "0-7 ימים": { trades: 0, totalPnl: 0 },
      "1-4 שבועות": { trades: 0, totalPnl: 0 },
      "1-3 חודשים": { trades: 0, totalPnl: 0 },
      "3+ חודשים": { trades: 0, totalPnl: 0 },
    };

    rows.filter((r) => r.status === "סגור").forEach((r) => {
      const days = durationDays(r);
      const pnl = closedPnl(r);
      if (days === null || pnl === null) return;

      let key = "3+ חודשים";
      if (days <= 7) key = "0-7 ימים";
      else if (days <= 30) key = "1-4 שבועות";
      else if (days <= 90) key = "1-3 חודשים";

      buckets[key].trades += 1;
      buckets[key].totalPnl += pnl;
    });

    return Object.entries(buckets).map(([label, data]) => ({
      label,
      trades: data.trades,
      totalPnl: data.totalPnl,
      avg: data.trades ? data.totalPnl / data.trades : 0,
    }));
  }, [rows]);

  const patternDurationCombo = useMemo(() => {
    const map = {};

    rows.filter((r) => r.status === "סגור").forEach((r) => {
      const days = durationDays(r);
      const pnl = closedPnl(r);
      if (days === null || pnl === null) return;

      let bucket = "3+ חודשים";
      if (days <= 7) bucket = "0-7 ימים";
      else if (days <= 30) bucket = "1-4 שבועות";
      else if (days <= 90) bucket = "1-3 חודשים";

      const key = `${r.pattern || "ללא תבנית"} | ${bucket}`;
      if (!map[key]) map[key] = { trades: 0, totalPnl: 0 };

      map[key].trades += 1;
      map[key].totalPnl += pnl;
    });

    return Object.entries(map).map(([label, data]) => ({
      label,
      trades: data.trades,
      totalPnl: data.totalPnl,
      avg: data.trades ? data.totalPnl / data.trades : 0,
    }));
  }, [rows]);

  const equityStats = useMemo(() => {
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    const curve = rows
      .filter((r) => r.status === "סגור")
      .map((r) => {
        const pnl = closedPnl(r) || 0;
        equity += pnl;
        peak = Math.max(peak, equity);
        const drawdown = equity - peak;
        maxDrawdown = Math.min(maxDrawdown, drawdown);
        return { ticker: r.ticker, equity, peak, drawdown, pnl };
      });

    return { curve, currentEquity: equity, peakEquity: peak, maxDrawdown };
  }, [rows]);

  const riskStats = useMemo(() => {
    const exposure = totalExposure(rows);
    const portfolioRisk = totalPortfolioRisk(rows);
    const highest = highestRiskPosition(rows);

    return {
      exposure,
      portfolioRisk,
      portfolioRiskPercent: exposure ? (portfolioRisk / exposure) * 100 : null,
      highestRiskTicker: highest?.ticker || "—",
      highestRiskValue: highest ? positionRisk(highest) || 0 : 0,
    };
  }, [rows]);

  function patchRow(id, updater) {
    setRows((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
  }

  async function loadLivePrices() {
    const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;
    if (!apiKey) {
      alert("חסר Finnhub API Key ב-Vercel");
      return;
    }

    const tickers = [...new Set(rows.map((r) => r.ticker).filter(Boolean))];
    if (!tickers.length) {
      alert("אין טיקרים לטעינה");
      return;
    }

    setIsLoadingLive(true);

    try {
      const results = await Promise.all(
        tickers.map(async (ticker) => {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
          const data = await res.json();
          return [ticker, data?.c || null];
        })
      );

      const prices = Object.fromEntries(results.filter(([, price]) => price && price > 0));

      setRows((prev) =>
        prev.map((row) => (prices[row.ticker] ? { ...row, lastAdd: String(prices[row.ticker]) } : row))
      );
    } catch {
      alert("שגיאה בטעינת מחירי לייב");
    } finally {
      setIsLoadingLive(false);
    }
  }

  function updateVisibleRow(index, field, value) {
    const row = visibleRows[index];
    if (!row) return;
    if (field === "ticker") return;
    patchRow(row.id, (old) => ({ ...old, [field]: value }));
  }

  function commitTicker(index) {
    const row = visibleRows[index];
    if (!row || row.ticker) return;

    const draft = String(tickerDrafts[row.id] || "").trim().toUpperCase();
    if (!draft) return;

    if (rows.some((r) => r.ticker === draft)) {
      alert("הטיקר כבר קיים במערכת");
      return;
    }

    patchRow(row.id, (old) => ({ ...old, ticker: draft }));
    setSelectedId(row.id);
    setTickerDrafts((prev) => ({ ...prev, [row.id]: "" }));
  }

  function addRow() {
    const id = makeId();

    setRows((prev) => [
      ...prev,
      {
        id,
        date: today(),
        ticker: "",
        shares: "",
        entry: "",
        stop: "",
        lastAdd: "",
        status: "פעיל",
        closedDate: "",
        exitPrice: "",
        pattern: "",
        thesis: "",
        addTrigger: "",
        plannedAddSize: "",
        localStop: "",
        addInvalidation: "",
        chartImage: "",
        chartImageName: "",
        journal: [],
      },
    ]);

    setViewMode("active");
    setSelectedId(id);
  }

  function openCloseModal(index) {
    const row = visibleRows[index];
    if (!row) return;

    const qty = openShares(row) || num(row.shares) || 0;

    setCloseModal({
      id: row.id,
      ticker: row.ticker,
      qty: String(qty),
      price: row.exitPrice || row.lastAdd || row.entry || "",
      reason: "",
    });
  }

  function confirmCloseTrade() {
    if (!closeModal) return;

    const qty = num(closeModal.qty);
    const price = num(closeModal.price);

    if (!qty || !price) {
      alert("חובה להזין כמות ומחיר יציאה");
      return;
    }

    patchRow(closeModal.id, (old) => ({
      ...old,
      status: "סגור",
      closedDate: today(),
      exitPrice: closeModal.price,
      journal: [
        ...(old.journal || []),
        {
          date: today(),
          action: "יציאה מלאה",
          qty: closeModal.qty,
          price: closeModal.price,
          stop: old.stop || "",
          note: closeModal.reason || "סגירה דרך חלון סגירה",
        },
      ],
    }));

    setViewMode("history");
    setSelectedId(closeModal.id);
    setCloseModal(null);
  }

  function ignoreTrade() {
    if (!closeModal) return;

    setRows((prev) => prev.filter((r) => r.id !== closeModal.id));

    if (selectedId === closeModal.id) {
      setSelectedId("");
    }

    setCloseModal(null);
  }

  function updateSelected(field, value) {
    if (!selected) return;
    patchRow(selected.id, (old) => ({ ...old, [field]: value }));
  }

  function updateCoreField(field, value) {
    if (!selected) return;

    patchRow(selected.id, (old) => {
      const next = { ...old, [field]: value };
      const journal = [...(old.journal || [])];

      if (field === "shares" || field === "entry") {
        let entryIndex = journal.findIndex((j) => j.action === "כניסה");

        if (entryIndex === -1) {
          journal.unshift({
            date: old.date || today(),
            action: "כניסה",
            qty: field === "shares" ? value : old.shares || "",
            price: field === "entry" ? value : old.entry || "",
            stop: old.stop || "",
            note: "כניסת ליבה",
          });
        } else {
          journal[entryIndex] = {
            ...journal[entryIndex],
            qty: field === "shares" ? value : journal[entryIndex].qty,
            price: field === "entry" ? value : journal[entryIndex].price,
          };
        }

        next.journal = journal;
      }

      if (field === "stop") {
        next.stop = value;
      }

      return next;
    });
  }

  function addJournalLine() {
    if (!selected) return;

    patchRow(selected.id, (old) => ({
      ...old,
      journal: [...(old.journal || []), { date: today(), action: "הוספה", qty: "", price: "", stop: "", note: "" }],
    }));
  }

  function updateJournal(index, field, value) {
    if (!selected) return;

    patchRow(selected.id, (old) => {
      const journal = [...(old.journal || [])];
      journal[index] = { ...journal[index], [field]: value };

      const math = getPositionMath({ ...old, journal });
      const exit = [...journal].reverse().find((j) => j.action === "יציאה מלאה" && String(j.price || "").trim());

      const lastBuy = lastBuyPrice(journal, old.lastAdd);
      const lastStop = [...journal].reverse().find((j) => String(j.stop || "").trim());

      return {
        ...old,
        journal,
        stop: field === "stop" ? value : (lastStop ? lastStop.stop : old.stop),
        lastAdd: lastBuy || old.lastAdd,
        status: exit ? "סגור" : old.status,
        closedDate: exit ? old.closedDate || exit.date || today() : old.closedDate,
        exitPrice: exit ? exit.price : old.exitPrice,
      };
    });
  }

  function deleteJournal(index) {
    if (!selected) return;

    patchRow(selected.id, (old) => {
      const journal = (old.journal || []).filter((_, i) => i !== index);
      const exit = [...journal].reverse().find((j) => j.action === "יציאה מלאה" && String(j.price || "").trim());
      const lastStop = [...journal].reverse().find((j) => String(j.stop || "").trim());

      return {
        ...old,
        journal,
        status: exit ? "סגור" : "פעיל",
        closedDate: exit ? old.closedDate || exit.date || today() : "",
        exitPrice: exit ? exit.price : "",
        stop: lastStop ? lastStop.stop : old.stop,
      };
    });
  }

  function uploadChart(file) {
    if (!file || !selected) return;

    const reader = new FileReader();
    reader.onload = () => {
      patchRow(selected.id, (old) => ({
        ...old,
        chartImage: String(reader.result || ""),
        chartImageName: file.name,
      }));
    };

    reader.readAsDataURL(file);
  }

  function exportBackup() {
    const name = window.prompt("איך לקרוא לקובץ?", "campaign-backup") || "campaign-backup";
    const blob = new Blob([JSON.stringify({ rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${today().replaceAll("/", "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function importBackup(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const imported = Array.isArray(parsed) ? parsed : parsed.rows;

        if (!Array.isArray(imported)) {
          alert("קובץ לא תקין");
          return;
        }

        const cleaned = imported.map((r) => ({ ...r, id: r.id || makeId(r.ticker) }));

        setRows(cleaned);
        setSelectedId(cleaned[0]?.id || "");
      } catch {
        alert("לא הצלחתי לטעון את הגיבוי");
      }
    };

    reader.readAsText(file);
  }

  const cards = [
    ["סה״כ עסקאות", stats.total, "text-white"],
    ["פעילות", stats.active, "text-emerald-300"],
    ["סגורות", stats.closed, "text-amber-300"],
    ["ברווח", stats.winners, "text-emerald-300"],
    ["בהפסד", stats.losers, "text-red-400"],
    ["ברייק־איוון", stats.breakeven, "text-zinc-300"],
    ["אחוז הצלחה", percent(stats.winRate), "text-blue-300"],
    ["רווח סגור", money(stats.totalPnl), stats.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"],
    ["חשיפה פתוחה", money(riskStats.exposure), "text-blue-300"],
    ["סיכון פתוח", money(riskStats.portfolioRisk), riskStats.portfolioRisk > 500 ? "text-red-400" : "text-amber-300"],
    ["סיכון %", percent(riskStats.portfolioRiskPercent), "text-amber-300"],
    ["סיכון גבוה", `${riskStats.highestRiskTicker} ${money(riskStats.highestRiskValue)}`, "text-red-400"],
  ];

  return (
    <div className="min-h-screen bg-black p-6 text-white" dir="rtl">
      <div className="mb-6 rounded-2xl border border-amber-500/40 bg-zinc-950 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-right">
            <div className="mb-2 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              V1 STABLE FIX ROUND · TRADING JOURNAL
            </div>
            <h1 className="text-4xl font-extrabold">Campaign Trading Journal</h1>
            <p className="mt-1 text-sm text-zinc-400">
              יומן מסחר לקמפיינים: עסקאות פתוחות וסגורות, PnL, Risk, Add Plan, Journal ו־TradingView.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={loadLivePrices}
              className="rounded-xl border border-emerald-400 bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              {isLoadingLive ? "טוען מחירים..." : "טען מחירים"}
            </button>

            <div className="rounded-xl border border-zinc-800 bg-black p-3 text-right text-xs text-zinc-400">
              <div className="font-bold text-amber-300">מטרת הדשבורד</div>
              <div>ניהול עסקאות קיימות והיסטוריה — לא סינון מניות חדשות.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        {cards.map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-right">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className={`mt-1 break-words text-xl font-extrabold leading-tight ${color}`} dir="ltr">
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("active")}
            className={`rounded px-4 py-2 text-sm font-bold ${
              viewMode === "active" ? "bg-emerald-600" : "border border-zinc-700"
            }`}
          >
            עסקאות פעילות
          </button>

          <button
            onClick={() => setViewMode("history")}
            className={`rounded px-4 py-2 text-sm font-bold ${
              viewMode === "history" ? "bg-amber-500 text-black" : "border border-zinc-700"
            }`}
          >
            היסטוריה
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportBackup} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black">
            גיבוי לקובץ
          </button>

          <label className="cursor-pointer rounded border border-amber-500 px-4 py-2 text-sm font-bold text-amber-300">
            טעינת גיבוי
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => importBackup(e.target.files?.[0])}
              className="hidden"
            />
          </label>

          <button onClick={addRow} className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold">
            שורה חדשה
          </button>


        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <div className="grid min-w-[1450px] grid-cols-[105px_105px_105px_95px_115px_115px_115px_125px_100px_95px_95px_90px_150px] gap-4 bg-zinc-900 p-3 text-sm font-bold text-zinc-300">
          <div>תאריך</div>
          <div>טיקר</div>
          <div>כמות פתוחה</div>
          <div>Avg</div>
          <div>Global Stop</div>
          <div>פוזיציה</div>
          <div>רווח חי</div>
          <div>מחיר נוכחי</div>
          <div>מצב</div>
          <div>יציאה</div>
          <div>P/L</div>
          <div>פתח</div>
          <div>TradingView</div>
        </div>

        {visibleRows.map((row, index) => (
          <div
            key={row.id}
            className="grid min-w-[1450px] grid-cols-[105px_105px_105px_95px_115px_115px_115px_125px_100px_95px_95px_90px_150px] items-center gap-4 border-t border-zinc-800 p-3"
          >
            <input
              value={row.date}
              onChange={(e) => updateVisibleRow(index, "date", e.target.value)}
              className="rounded border border-zinc-800 bg-black px-2 py-1 text-center"
              dir="ltr"
            />

            <input
              value={row.ticker || tickerDrafts[row.id] || ""}
              readOnly={Boolean(row.ticker)}
              placeholder={row.ticker ? "" : "ENTER"}
              onChange={(e) => setTickerDrafts((p) => ({ ...p, [row.id]: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => e.key === "Enter" && commitTicker(index)}
              onBlur={() => commitTicker(index)}
              className={`rounded border px-2 py-1 text-center font-bold ${
                row.ticker ? "border-zinc-800 bg-zinc-950 text-zinc-400" : "border-amber-500 bg-black text-white"
              }`}
              dir="ltr"
            />

            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center font-bold text-amber-300" dir="ltr">
              {openShares(row) || "—"}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center font-bold text-blue-300" dir="ltr">
              {avgCost(row) ? Number(avgCost(row)).toFixed(2) : row.entry || "—"}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center font-bold text-red-400" dir="ltr">
              {displayStop(row) || "—"}
            </div>

            <div
              className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-center font-bold text-emerald-300"
              dir="ltr"
            >
              {money(positionValue(row))}
            </div>

            <div
              className={`rounded border px-2 py-1 text-center font-bold ${
                unrealizedPnl(row) === null
                  ? "border-zinc-800 text-zinc-500"
                  : unrealizedPnl(row) >= 0
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/40 bg-red-500/10 text-red-400"
              }`}
              dir="ltr"
            >
              {money(unrealizedPnl(row))}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center font-bold text-emerald-400" dir="ltr">
              {row.lastAdd || "—"}
            </div>

            <div
              className={`rounded border px-2 py-1 text-center text-xs font-bold ${
                row.status === "פעיל"
                  ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                  : "border-red-500/40 bg-red-500/20 text-red-400"
              }`}
            >
              {row.status}
            </div>

            <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center font-bold text-amber-300" dir="ltr">
              {row.exitPrice || "—"}
            </div>

            <div
              className={`rounded border px-2 py-1 text-center font-bold ${
                closedPnl(row) === null
                  ? "border-zinc-800 text-zinc-500"
                  : closedPnl(row) >= 0
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-red-500/40 bg-red-500/10 text-red-400"
              }`}
              dir="ltr"
            >
              {money(closedPnl(row))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedId(row.id);
                  setDrawerTab("overview");
                }}
                className="rounded bg-amber-500 px-3 py-1 text-sm font-bold text-black"
              >
                פתח
              </button>
              <button onClick={() => openCloseModal(index)} className="rounded bg-red-700 px-3 py-1 text-sm font-bold">
                ×
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => openTradingViewWeb(row.ticker)}
                className="rounded border border-blue-500 px-3 py-1 text-xs font-bold text-blue-300"
              >
                Web
              </button>

            </div>
          </div>
        ))}
      </div>

      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 text-right">
              <div className="text-xl font-extrabold text-amber-300">סגירת עסקה</div>
              <div className="text-sm text-zinc-500" dir="ltr">{closeModal.ticker}</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-zinc-500">כמות יציאה</div>
                <input
                  value={closeModal.qty}
                  onChange={(e) => setCloseModal((m) => ({ ...m, qty: e.target.value }))}
                  className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-left text-amber-300"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-zinc-500">מחיר יציאה</div>
                <input
                  value={closeModal.price}
                  onChange={(e) => setCloseModal((m) => ({ ...m, price: e.target.value }))}
                  className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-left text-emerald-300"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="mb-1 text-xs text-zinc-500">סיבת סגירה / הערה</div>
                <textarea
                  value={closeModal.reason}
                  onChange={(e) => setCloseModal((m) => ({ ...m, reason: e.target.value }))}
                  className="h-20 w-full rounded border border-zinc-800 bg-black px-3 py-2 text-right"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-between gap-2">
              <button onClick={ignoreTrade} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                התעלם
              </button>
              <button onClick={() => setCloseModal(null)} className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                ביטול
              </button>
              <button onClick={confirmCloseTrade} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black">
                אשר סגירה
              </button>
            </div>
          </div>
        </div>
      )}

      {showEquityHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 text-right">
              <div className="text-xl font-extrabold text-amber-300">הסבר Equity Curve</div>
              <div className="mt-1 text-sm text-zinc-500">החלון הזה מודד רק עסקאות סגורות.</div>
            </div>

            <div className="space-y-3 text-right text-sm text-zinc-300">
              <div>
                <span className="font-bold text-amber-300">Equity Curve:</span>
                <br />
                גרף שמראה את הרווח או ההפסד המצטבר שלך לאורך זמן.
              </div>

              <div>
                <span className="font-bold text-amber-300">Equity סגור:</span>
                <br />
                סך הרווח או ההפסד בפועל מעסקאות שכבר נסגרו.
              </div>

              <div>
                <span className="font-bold text-amber-300">Peak:</span>
                <br />
                השיא הגבוה ביותר שהגעת אליו ברווח המצטבר.
              </div>

              <div>
                <span className="font-bold text-amber-300">Max DD:</span>
                <br />
                הירידה הכי גדולה מהשיא. זה Drawdown — מדד סיכון חשוב מאוד.
              </div>

              <div className="rounded border border-zinc-800 bg-black p-3 text-xs text-zinc-500">
                אם אין עסקאות סגורות — כל הנתונים יישארו $0.00.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button onClick={() => setShowEquityHelp(false)} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black">
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className={`mt-6 rounded-xl border p-4 ${drawerThemeClass(drawerTheme)}`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <button onClick={() => setSelectedId("")} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-400">
              סגור מגירה
            </button>

            <div className="text-right">
              <h2 className="text-2xl font-extrabold" dir="ltr">{selected.ticker}</h2>
              <div className="text-sm text-zinc-500">
                {selected.status === "סגור" ? "מגירת היסטוריה" : "מגירה פנימית לניהול עסקה"}
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {[
                ["overview", "Overview"],
                ["ai", "AI Review"],
                ["add", "Add Plan"],
                ["journal", "Journal"],
                ["chart", "Chart"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDrawerTab(key)}
                  className={`rounded px-3 py-2 text-xs font-bold ${
                    drawerTab === key
                      ? "bg-amber-500 text-black"
                      : "border border-zinc-700 bg-black/20 text-zinc-300 hover:border-amber-500 hover:text-amber-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-bold text-amber-300">צבע:</div>

              <button
                onClick={() => setDrawerTheme("black")}
                className={drawerButtonClass(drawerTheme === "black", "border border-white bg-black text-white")}
              >
                שחור
              </button>

              <button
                onClick={() => setDrawerTheme("gray")}
                className={drawerButtonClass(drawerTheme === "gray", "bg-zinc-700 text-white")}
              >
                אפור
              </button>

              <button
                onClick={() => setDrawerTheme("white")}
                className={drawerButtonClass(drawerTheme === "white", "border border-zinc-400 bg-white text-black")}
              >
                לבן
              </button>

              <button
                onClick={() => setDrawerTheme("beige")}
                className={drawerButtonClass(drawerTheme === "beige", "border border-amber-300 bg-amber-100 text-black")}
              >
                בז׳
              </button>
            </div>
          </div>

          {drawerTab === "overview" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-800 bg-black p-4 text-right">
                <div className="mb-3 text-sm font-bold text-amber-300">Position Setup / עדכון דרך המגירה בלבד</div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">כמות בסיס / Shares</div>
                    <input
                      value={selected.shares || ""}
                      onChange={(e) => updateCoreField("shares", e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center font-bold text-amber-300"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">כניסה בסיסית / Entry</div>
                    <input
                      value={selected.entry || ""}
                      onChange={(e) => updateCoreField("entry", e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center font-bold text-blue-300"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">סטופ כולל / Stop</div>
                    <input
                      value={selected.stop || ""}
                      onChange={(e) => updateCoreField("stop", e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center font-bold text-red-400"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-zinc-500">מחיר נוכחי / Current</div>
                    <input
                      value={selected.lastAdd || ""}
                      onChange={(e) => updateSelected("lastAdd", e.target.value)}
                      className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center font-bold text-emerald-400"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  הערה: הטבלה הראשית היא תצוגה בלבד. כמות, כניסה, סטופ ומחיר מתעדכנים מהמגירה/יומן.
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-6">
                <InfoCard label="כניסה" value={selected.entry || "—"} color="text-blue-300" />
                <InfoCard label="סטופ" value={displayStop(selected) || "—"} color="text-red-400" />
                <InfoCard label="מחיר נוכחי" value={selected.lastAdd || "—"} color="text-emerald-400" />
                <InfoCard label="כמות קנייה" value={totalBoughtQty(selected)} />
                <InfoCard label="כמות פתוחה" value={openShares(selected)} color="text-amber-300" />
                <InfoCard label="Avg" value={avgCost(selected) ? Number(avgCost(selected)).toFixed(2) : "—"} color="text-blue-300" />
                <InfoCard label="פוזיציה" value={money(positionValue(selected))} color="text-emerald-300" />
                <InfoCard label="סיכון $" value={money(positionRisk(selected))} color="text-red-400" />
                <InfoCard label="סיכון %" value={percent(riskPercent(selected))} color="text-amber-300" />
                <InfoCard
                  label="רווח חי"
                  value={money(unrealizedPnl(selected))}
                  color={(unrealizedPnl(selected) || 0) >= 0 ? "text-emerald-300" : "text-red-400"}
                />
                <InfoCard label="מצב" value={selected.status} color={selected.status === "סגור" ? "text-red-400" : "text-emerald-300"} />
                <InfoCard label="מס׳ הוספות" value={getAddCount(selected)} color="text-amber-300" />
                <InfoCard label="משך ימים" value={durationDays(selected) ?? "—"} color="text-amber-300" />
                <InfoCard label="תבנית" value={selected.pattern || "—"} color="text-amber-300" />
              </div>

              <div className="rounded-xl border border-zinc-800 bg-black p-4 text-right">
                <div className="mb-3 text-sm font-bold text-amber-300">תקציר ניהול</div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-xs text-zinc-500">Add Status</div>
                    <div className="mt-1 font-bold text-amber-300" dir="ltr">{tradeManagement?.status || "—"}</div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-xs text-zinc-500">Add Trigger</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.addTrigger || "לא הוגדר"}</div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-xs text-zinc-500">Local Stop</div>
                    <div className="mt-1 font-bold text-red-400" dir="ltr">{selected.localStop || "—"}</div>
                  </div>
                  <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="text-xs text-zinc-500">Invalidation</div>
                    <div className="mt-1 text-sm text-zinc-300">{selected.addInvalidation || "לא הוגדר"}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {drawerTab === "ai" && (
            <div className="space-y-5">
              {tradeManagement && selected.status !== "סגור" ? (
                <div className={`rounded-xl border p-4 ${colorClasses(tradeManagement.color)}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="rounded bg-black/40 px-3 py-1 text-sm font-extrabold" dir="ltr">
                      {tradeManagement.status}
                    </div>
                    <div className="text-right text-lg font-extrabold">Trade Management Assistant</div>
                  </div>

                  <div className="mb-3 text-right text-sm font-bold text-white">{tradeManagement.title}</div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-black/30 bg-black/30 p-3 text-right">
                      <div className="mb-1 text-xs font-bold text-zinc-400">Add Decision / החלטת הוספה</div>
                      <div className="text-sm font-bold">{tradeManagement.addDecision}</div>
                    </div>

                    <div className="rounded border border-black/30 bg-black/30 p-3 text-right">
                      <div className="mb-1 text-xs font-bold text-zinc-400">Structure / מבנה</div>
                      <div className="text-sm">{tradeManagement.structure}</div>
                    </div>

                    <div className="rounded border border-black/30 bg-black/30 p-3 text-right">
                      <div className="mb-1 text-xs font-bold text-zinc-400">Risk / סיכון</div>
                      <div className="text-sm">{tradeManagement.risk}</div>
                    </div>

                    <div className="rounded border border-black/30 bg-black/30 p-3 text-right">
                      <div className="mb-1 text-xs font-bold text-zinc-400">Management / ניהול</div>
                      <div className="text-sm">{tradeManagement.management}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded border border-black/30 bg-black/30 p-3 text-right text-xs text-zinc-300">
                    <span className="font-bold text-amber-300">Journal Quality: </span>
                    {tradeManagement.journalQuality}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-black p-4 text-right text-sm text-zinc-400">
                  AI Review פעיל רק בעסקאות פתוחות.
                </div>
              )}
            </div>
          )}

          {drawerTab === "add" && (
            <div className="space-y-5">
              {selected.status !== "סגור" ? (
                <div className="rounded-xl border border-zinc-800 bg-black p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="rounded border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300">
                      Risk: {money(positionRisk(selected))} / {percent(riskPercent(selected))}
                    </div>

                    <div className="text-right text-sm font-bold text-amber-300">
                      Add Plan / תוכנית הוספה
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <div className="mb-1 text-xs text-zinc-500">Trigger / תנאי הוספה</div>
                      <input
                        value={selected.addTrigger || ""}
                        onChange={(e) => updateSelected("addTrigger", e.target.value)}
                        placeholder="לדוגמה: Higher Low מעל 4.20"
                        className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm text-white"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-zinc-500">Planned Add Size</div>
                      <input
                        value={selected.plannedAddSize || ""}
                        onChange={(e) => updateSelected("plannedAddSize", e.target.value)}
                        placeholder="150"
                        className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center text-sm text-amber-300"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-zinc-500">Local Stop</div>
                      <input
                        value={selected.localStop || ""}
                        onChange={(e) => updateSelected("localStop", e.target.value)}
                        placeholder="3.95"
                        className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-center text-sm text-red-400"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-xs text-zinc-500">Invalidation / ביטול</div>
                      <input
                        value={selected.addInvalidation || ""}
                        onChange={(e) => updateSelected("addInvalidation", e.target.value)}
                        placeholder="Break below mini base"
                        className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded border border-zinc-800 bg-zinc-950 p-3 text-right text-xs text-zinc-400">
                    המטרה: להחליט מראש איפה מוסיפים, כמה מוסיפים, ומה מבטל את ההוספה — לפני שהרגש נכנס לתמונה.
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-black p-4 text-right text-sm text-zinc-400">
                  Add Plan לא רלוונטי לעסקה סגורה.
                </div>
              )}
            </div>
          )}

          {drawerTab === "chart" && (
            <div className={`grid gap-3 ${selected.status === "סגור" ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
              <div className="rounded border border-zinc-800 bg-black p-3">
                <div className="mb-3 text-right text-sm font-bold text-amber-300">תבנית מסחר + תזה</div>

                <select
                  value={selected.pattern || ""}
                  onChange={(e) => updateSelected("pattern", e.target.value)}
                  className="mb-4 w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm text-amber-300"
                >
                  <option value="">בחר תבנית</option>
                  {tradePatterns.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>

                <div className="mb-2 text-right text-sm font-bold text-amber-300">תזה</div>

                <textarea
                  value={selected.thesis || ""}
                  onChange={(e) => updateSelected("thesis", e.target.value)}
                  className="h-28 w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm text-white"
                />

                {selected.status !== "סגור" && (
                  <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="mb-2 text-right text-xs font-bold text-zinc-400">קובץ גרף / צילום מסך</div>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => uploadChart(e.target.files?.[0])}
                      className="w-full rounded border border-zinc-800 bg-black p-2 text-sm text-zinc-300"
                    />

                    {selected.chartImageName && (
                      <div className="mt-2 text-right text-xs text-emerald-400">
                        נשמר: {selected.chartImageName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selected.chartImage ? (
                <div className="rounded border border-zinc-800 bg-black p-3">
                  <div className="mb-2 text-right text-sm font-bold text-amber-300">גרף שמור</div>
                  <img src={selected.chartImage} alt="chart" className="max-h-[420px] w-full rounded object-contain" />
                </div>
              ) : (
                <div className="rounded border border-zinc-800 bg-black p-3 text-right text-sm text-zinc-500">
                  עדיין אין גרף שמור לעסקה הזאת.
                </div>
              )}
            </div>
          )}

          {drawerTab === "journal" && (
            <div className="rounded border border-zinc-800 bg-black p-3">
              <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-right text-xs text-amber-200">
                כלל חישוב: Qty = מספר מניות בלבד. Price = מחיר למניה. יציאה חלקית עם Qty מפחיתה כמות פתוחה. יציאה מלאה סוגרת את העסקה. סטופ הוספה או Qty שלילי מפחיתים מניות פתוחות. סטופ הוספה או Qty שלילי מפחיתים מניות פתוחות אבל לא משנים את ה־Global Stop.
              </div>

              <div className="mb-3 flex items-center justify-between">
                <button onClick={addJournalLine} className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold">
                  פעולה +
                </button>
                <div className="text-sm font-bold text-amber-300">יומן פעולות</div>
              </div>

              <div className="overflow-x-auto">
                <div className="grid min-w-[860px] grid-cols-[120px_140px_100px_120px_120px_1fr_60px] gap-2 border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-500">
                  <div>תאריך</div>
                  <div>פעולה</div>
                  <div>Qty מניות</div>
                  <div>Price למניה</div>
                  <div>Global Stop</div>
                  <div>הערה</div>
                  <div></div>
                </div>

                {(selected.journal || []).map((line, i) => (
                  <div
                    key={i}
                    className="grid min-w-[860px] grid-cols-[120px_140px_100px_120px_120px_1fr_60px] items-center gap-2 border-b border-zinc-900 py-2"
                  >
                    <input
                      value={line.date}
                      onChange={(e) => updateJournal(i, "date", e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-white"
                      dir="ltr"
                    />

                    <select
                      value={line.action}
                      onChange={(e) => updateJournal(i, "action", e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-white"
                    >
                      {actions.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>

                    <input
                      value={line.qty || ""}
                      onChange={(e) => updateJournal(i, "qty", e.target.value)}
                      placeholder="מניות (+/-)"
                      className={`rounded border px-2 py-1 text-center text-amber-300 ${
                        (line.action === "כניסה" || line.action === "הוספה" || line.action === "יציאה חלקית" || line.action === "סטופ הוספה") && !num(line.qty)
                          ? "border-red-500 bg-red-500/10"
                          : "border-zinc-800 bg-zinc-950"
                      }`}
                      dir="ltr"
                    />

                    <input
                      value={line.price || ""}
                      onChange={(e) => updateJournal(i, "price", e.target.value)}
                      placeholder="מחיר למניה"
                      className={`rounded border px-2 py-1 text-center text-white ${
                        (line.action === "כניסה" || line.action === "הוספה" || line.action === "יציאה חלקית" || line.action === "יציאה מלאה" || line.action === "סטופ הוספה") && !num(line.price)
                          ? "border-red-500 bg-red-500/10"
                          : "border-zinc-800 bg-zinc-950"
                      }`}
                      dir="ltr"
                    />

                    <input
                      value={line.stop || ""}
                      onChange={(e) => updateJournal(i, "stop", e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-red-400"
                      dir="ltr"
                     placeholder="סטופ כולל לדוגמה: 3.85" />

                    <input
                      value={line.note || ""}
                      onChange={(e) => updateJournal(i, "note", e.target.value)}
                      className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-white"
                    />

                    <button onClick={() => deleteJournal(i)} className="rounded bg-red-700 px-3 py-1 text-sm font-bold">
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 space-y-6">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 text-right text-sm font-bold text-amber-300">ספירת תבניות מסחר</div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {Object.entries(patternStats).map(([pattern, count]) => (
                <div key={pattern} className="rounded border border-zinc-800 bg-black p-3 text-right">
                  <div className="text-xs text-zinc-500">{pattern}</div>
                  <div className="mt-1 text-xl font-extrabold text-amber-300">{count}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <button
                onClick={() => setShowEquityHelp(true)}
                className="rounded border border-zinc-700 px-3 py-1 text-xs font-bold text-zinc-300 hover:border-amber-500 hover:text-amber-300"
              >
                ? הסבר
              </button>

              <div className="text-right text-sm font-bold text-amber-300">
                Equity Curve + Drawdown
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-right">
              <InfoCard
                label="Equity סגור"
                value={money(equityStats.currentEquity)}
                color={equityStats.currentEquity >= 0 ? "text-emerald-300" : "text-red-400"}
              />
              <InfoCard label="Peak" value={money(equityStats.peakEquity)} color="text-blue-300" />
              <InfoCard label="Max DD" value={money(equityStats.maxDrawdown)} color="text-red-400" />
            </div>

            <div className="flex h-32 items-end gap-2 border-b border-zinc-800 pb-2" dir="ltr">
              {equityStats.curve.map((p, i) => {
                const height = Math.min(110, Math.max(8, Math.abs(p.equity) / 25));

                return (
                  <div key={`${p.ticker}-${i}`} className="flex flex-col items-center gap-1">
                    <div
                      title={`${p.ticker}: Equity ${money(p.equity)} | DD ${money(p.drawdown)}`}
                      className={p.equity >= 0 ? "w-3 rounded-t bg-emerald-500" : "w-3 rounded-t bg-red-500"}
                      style={{ height: `${height}px` }}
                    />
                    <div className="text-[10px] text-zinc-500">{p.ticker}</div>
                  </div>
                );
              })}

              {equityStats.curve.length === 0 && (
                <div className="text-sm text-zinc-500">
                  אין עדיין עסקאות סגורות ל־Equity Curve.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">Risk Dashboard / סיכון פתוח</div>

          <div className="grid gap-3 md:grid-cols-4">
            <InfoCard label="חשיפה פתוחה" value={money(riskStats.exposure)} color="text-blue-300" />
            <InfoCard label="סיכון פתוח" value={money(riskStats.portfolioRisk)} color={riskStats.portfolioRisk > 500 ? "text-red-400" : "text-amber-300"} />
            <InfoCard label="סיכון %" value={percent(riskStats.portfolioRiskPercent)} color="text-amber-300" />
            <InfoCard label="הכי מסוכן" value={`${riskStats.highestRiskTicker} ${money(riskStats.highestRiskValue)}`} color="text-red-400" />
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[120px_140px_140px_120px_120px_1fr] gap-2 border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-500">
              <div>טיקר</div>
              <div>פוזיציה</div>
              <div>סיכון $</div>
              <div>סיכון %</div>
              <div>Global Stop</div>
              <div>Add Plan</div>
            </div>

            {rows.filter((r) => r.status !== "סגור").map((row) => (
              <div key={`risk-${row.id}`} className="grid min-w-[720px] grid-cols-[120px_140px_140px_120px_120px_1fr] gap-2 border-b border-zinc-900 py-2 text-sm">
                <div className="font-bold" dir="ltr">{row.ticker || "—"}</div>
                <div className="text-blue-300" dir="ltr">{money(positionValue(row))}</div>
                <div className={(positionRisk(row) || 0) > 0 ? "text-red-400" : "text-zinc-500"} dir="ltr">{money(positionRisk(row))}</div>
                <div className="text-amber-300" dir="ltr">{percent(riskPercent(row))}</div>
                <div className="text-red-400" dir="ltr">{displayStop(row) || "—"}</div>
                <div className="text-zinc-300">{row.addTrigger || "חסר Trigger"}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">ביצועים לפי תבנית</div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-[180px_80px_100px_120px_120px_120px] gap-2 border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-500">
              <div>תבנית</div>
              <div>עסקאות</div>
              <div>Win Rate</div>
              <div>רווח כולל</div>
              <div>Expectancy</div>
              <div>ממוצע לעסקה</div>
            </div>

            {patternPerformance.map((p) => (
              <div
                key={p.pattern}
                className="grid min-w-[720px] grid-cols-[180px_80px_100px_120px_120px_120px] gap-2 border-b border-zinc-900 py-2 text-sm"
              >
                <div>{p.pattern}</div>
                <div>{p.trades}</div>
                <div className="text-blue-300">{percent(p.winRate)}</div>
                <div className={p.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"}>{money(p.totalPnl)}</div>
                <div className={p.expectancy >= 0 ? "text-emerald-300" : "text-red-400"}>{money(p.expectancy)}</div>
                <div className="text-zinc-300">{money(p.totalPnl / (p.trades || 1))}</div>
              </div>
            ))}

            {patternPerformance.length === 0 && (
              <div className="py-3 text-sm text-zinc-500">
                אין עדיין עסקאות סגורות עם נתוני תבנית.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">פילוח לפי זמן</div>

          <div className="grid grid-cols-[140px_100px_140px_140px] gap-2 text-sm">
            <div className="text-zinc-500">טווח</div>
            <div className="text-zinc-500">עסקאות</div>
            <div className="text-zinc-500">רווח כולל</div>
            <div className="text-zinc-500">ממוצע</div>

            {durationPerformance.map((d) => (
              <React.Fragment key={d.label}>
                <div>{d.label}</div>
                <div>{d.trades}</div>
                <div className={d.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"}>{money(d.totalPnl)}</div>
                <div className="text-zinc-300">{money(d.avg)}</div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">שילוב תבנית + זמן</div>

          <div className="grid grid-cols-[220px_100px_140px_140px] gap-2 text-sm">
            <div className="text-zinc-500">תבנית + זמן</div>
            <div className="text-zinc-500">עסקאות</div>
            <div className="text-zinc-500">רווח כולל</div>
            <div className="text-zinc-500">ממוצע</div>

            {patternDurationCombo.map((c) => (
              <React.Fragment key={c.label}>
                <div>{c.label}</div>
                <div>{c.trades}</div>
                <div className={c.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"}>{money(c.totalPnl)}</div>
                <div className="text-zinc-300">{money(c.avg)}</div>
              </React.Fragment>
            ))}

            {patternDurationCombo.length === 0 && (
              <div className="col-span-4 py-3 text-sm text-zinc-500">
                אין עדיין שילוב תבנית + זמן להצגה.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
