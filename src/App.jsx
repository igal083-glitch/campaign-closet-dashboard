import React, { useEffect, useMemo, useState } from "react";

const starterData = [
  {
    date: "02/05/2026",
    ticker: "FOSL",
    shares: "740",
    entry: "1.58",
    stop: "3.85",
    lastAdd: "4.20",
    status: "פעיל",
    closedDate: "",
    exitPrice: "",
    thesis: "קמפיין שמחזיק מבנה אחרי פריצה. לא להדק סטופ מוקדם מדי.",
    chartImage: "",
    chartImageName: "",
    pattern: "",
    journal: [
      { date: "02/05/2026", action: "כניסה", qty: "740", price: "1.58", stop: "1.35", note: "כניסת ליבה" },
      { date: "02/05/2026", action: "הוספה", qty: "", price: "4.20", stop: "3.85", note: "הוספה אחרי המשך" },
    ],
  },
  {
    date: "02/05/2026",
    ticker: "NVAX",
    shares: "980",
    entry: "7.90",
    stop: "6.50",
    lastAdd: "10.70",
    status: "פעיל",
    closedDate: "",
    exitPrice: "",
    thesis: "מניית תנודתיות. לא קמפיין נקי, אבל עם פוטנציאל ספייק.",
    chartImage: "",
    chartImageName: "",
    pattern: "",
    journal: [
      { date: "02/05/2026", action: "כניסה", qty: "980", price: "7.90", stop: "6.50", note: "כניסה ראשונה" },
    ],
  },
];

const actions = ["כניסה", "הוספה", "סטופ כולל", "סטופ הוספה", "יציאה חלקית", "יציאה מלאה", "הערה"];

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

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function money(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v) > 0 ? "+" : ""}$${Number(v).toFixed(2)}`;
}

function percent(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
}

function parseDateDMY(s) {
  if (!s || typeof s !== "string") return null;
  const [d, m, y] = s.split("/").map((x) => Number(x));
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function durationDays(row) {
  if (String(row.status || "").trim() !== "סגור") return null;
  const start = parseDateDMY(row.date);
  const end = parseDateDMY(row.closedDate);
  if (!start || !end) return null;
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

function getPositionMath(row) {
  const journal = row.journal || [];

  let openQty = 0;
  let openCost = 0;
  let buyQty = 0;
  let buyCost = 0;
  let sellQty = 0;
  let sellValue = 0;
  let realizedPnl = 0;
  let hasRealized = false;

  const buyLines = journal.filter((j) => j.action === "כניסה" || j.action === "הוספה");
  const hasBuyLinesWithQty = buyLines.some((j) => num(j.qty) && num(j.price));

  // If journal has no usable buy quantities yet, use the main row as fallback.
  if (!hasBuyLinesWithQty) {
    const qty = num(row.shares) || 0;
    const price = num(row.entry) || 0;
    openQty = qty;
    openCost = qty * price;
    buyQty = qty;
    buyCost = qty * price;
  }

  journal.forEach((j) => {
    const price = num(j.price);
    if (!price) return;

    if (j.action === "כניסה" || j.action === "הוספה") {
      const qty = num(j.qty);
      if (!qty) return;
      openQty += qty;
      openCost += qty * price;
      buyQty += qty;
      buyCost += qty * price;
      return;
    }

    if (j.action === "יציאה חלקית" || j.action === "יציאה מלאה") {
      const requestedQty = num(j.qty);
      const qty = j.action === "יציאה מלאה"
        ? requestedQty || openQty
        : requestedQty || 0;

      if (!qty || !openQty) return;

      const actualQty = Math.min(qty, openQty);
      const avgBeforeSale = openCost / openQty;
      const saleValue = actualQty * price;
      const costRemoved = actualQty * avgBeforeSale;

      realizedPnl += saleValue - costRemoved;
      sellValue += saleValue;
      sellQty += actualQty;
      openQty -= actualQty;
      openCost -= costRemoved;
      hasRealized = true;
    }
  });

  const avgPrice = openQty ? openCost / openQty : buyQty ? buyCost / buyQty : null;

  return {
    buyCost,
    buyQty,
    sellValue,
    sellQty,
    avgPrice,
    openQty,
    closedQty: sellQty,
    openCost: openQty ? openCost : 0,
    realizedPnl: hasRealized ? realizedPnl : null,
  };
}

function avg(row) {
  return getPositionMath(row).avgPrice;
}

function totalBoughtQty(row) {
  const math = getPositionMath(row);
  return math.buyQty || num(row.shares) || 0;
}

function openShares(row) {
  const math = getPositionMath(row);
  return math.openQty || 0;
}

function avgCost(row) {
  return getPositionMath(row).avgPrice;
}

function positionValue(row) {
  const math = getPositionMath(row);
  const markPrice = num(row.lastAdd) || num(row.entry);

  if (math.openQty && markPrice) return math.openQty * markPrice;

  const shares = num(row.shares);
  const entry = num(row.entry);
  if (!shares || !entry) return null;
  return shares * entry;
}

function unrealizedPnl(row) {
  if (String(row.status || "").trim() === "סגור") return null;

  const math = getPositionMath(row);
  const markPrice = num(row.lastAdd) || num(row.entry);

  if (!math.openQty || !math.avgPrice || !markPrice) return null;

  return (markPrice - math.avgPrice) * math.openQty;
}

function getExitPrice(row) {
  const manualExit = num(row.exitPrice);
  if (manualExit !== null) return manualExit;

  const exitLine = [...(row.journal || [])]
    .reverse()
    .find((x) => x.action === "יציאה מלאה" && String(x.price || "").trim());

  return exitLine ? num(exitLine.price) : null;
}

function closedPnl(row) {
  if (String(row.status || "").trim() !== "סגור") return null;

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
  const invested = math.buyCost || ((num(row.shares) || 0) * (num(row.entry) || 0));
  if (pnl === null || !invested) return null;
  return (pnl / invested) * 100;
}

function latestAdd(journal, fallback) {
  const add = [...(journal || [])].reverse().find((x) => x.action === "הוספה" && String(x.price || "").trim());
  return add ? add.price : fallback || "";
}

export default function ClosetDashboard() {
  const [rows, setRows] = useState(() => {
    try {
      const saved = localStorage.getItem("campaign-dashboard-clean");
      return saved ? JSON.parse(saved) : starterData;
    } catch {
      return starterData;
    }
  });
  const [viewMode, setViewMode] = useState("active");
  const [selectedTicker, setSelectedTicker] = useState("FOSL");
  const [tickerDrafts, setTickerDrafts] = useState({});
  const [closeModal, setCloseModal] = useState(null);
const [livePrices, setLivePrices] = useState({});
const [isLoadingLive, setIsLoadingLive] = useState(false);
  useEffect(() => {
    localStorage.setItem("campaign-dashboard-clean", JSON.stringify(rows));
  }, [rows]);
async function loadLivePrices() {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;

  if (!apiKey) {
    alert("חסר API KEY");
    return;
  }

  const tickers = [...new Set(rows.map(r => r.ticker).filter(Boolean))];

  if (!tickers.length) return;

  setIsLoadingLive(true);

  try {
    const results = await Promise.all(
      tickers.map(async (ticker) => {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
        );
        const data = await res.json();
        return [ticker, data.c];
      })
    );

    const map = Object.fromEntries(results);

    setRows(prev =>
      prev.map(r =>
        map[r.ticker]
          ? { ...r, lastAdd: String(map[r.ticker]) }
          : r
      )
    );

  } catch (e) {
    alert("שגיאה בטעינת מחירים");
  } finally {
    setIsLoadingLive(false);
  }
}
  async function loadLivePrices() {
  const apiKey = import.meta.env.VITE_FINNHUB_API_KEY;

  if (!apiKey) {
    alert("חסר Finnhub API Key");
    return;
  }

  const tickers = [...new Set(rows.map(r => r.ticker).filter(Boolean))];

  if (!tickers.length) return;

  setIsLoadingLive(true);

  try {
    const results = await Promise.all(
      tickers.map(async (ticker) => {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`
        );
        const data = await res.json();
        return [ticker, data.c];
      })
    );

        const map = Object.fromEntries(results);

    setLivePrices(map);

    setRows((prev) =>
      prev.map((r) =>
        map[r.ticker]
          ? { ...r, lastAdd: String(map[r.ticker]) }
          : r
      )
    );
  } catch (e) {
    alert("שגיאה בטעינת מחירים");
  } finally {
    setIsLoadingLive(false);
  }
}
    
}
  const visibleRows = useMemo(
    () => rows.filter((r) => (viewMode === "history" ? r.status === "סגור" : r.status !== "סגור")),
    [rows, viewMode]
  );

  const selected = rows.find((r) => r.ticker === selectedTicker);

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
      totalPnl: pnlList.reduce((a, b) => a + b, 0),
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

    rows.filter(r => r.status === "סגור").forEach((r) => {
      const key = r.pattern || "ללא תבנית";
      const pnl = closedPnl(r);

      if (pnl === null) return;

      if (!map[key]) {
        map[key] = {
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnl: 0,
        };
      }

      map[key].trades += 1;
      map[key].totalPnl += pnl;
      if (pnl > 0) map[key].wins += 1;
      if (pnl < 0) map[key].losses += 1;
    });

    return Object.entries(map).map(([pattern, data]) => {
      const winRate = data.trades ? (data.wins / data.trades) * 100 : 0;
      const expectancy = data.trades ? data.totalPnl / data.trades : 0;

      return {
        pattern,
        ...data,
        winRate,
        expectancy,
      };
    });
  }, [rows]);

  const durationPerformance = useMemo(() => {
    const buckets = {
      "0-7 ימים": { trades: 0, totalPnl: 0 },
      "1-4 שבועות": { trades: 0, totalPnl: 0 },
      "1-3 חודשים": { trades: 0, totalPnl: 0 },
      "3+ חודשים": { trades: 0, totalPnl: 0 },
    };

    rows.filter(r => r.status === "סגור").forEach((r) => {
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

    rows.filter(r => r.status === "סגור").forEach((r) => {
      const pattern = r.pattern || "ללא תבנית";
      const days = durationDays(r);
      const pnl = closedPnl(r);

      if (days === null || pnl === null) return;

      let bucket = "3+ חודשים";

      if (days <= 7) bucket = "0-7 ימים";
      else if (days <= 30) bucket = "1-4 שבועות";
      else if (days <= 90) bucket = "1-3 חודשים";

      const key = `${pattern} | ${bucket}`;

      if (!map[key]) {
        map[key] = { trades: 0, totalPnl: 0 };
      }

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
    const closed = rows
      .filter((r) => r.status === "סגור")
      .map((r) => ({
        ticker: r.ticker,
        closedDate: r.closedDate,
        pnl: closedPnl(r) || 0,
      }));

    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;

    const curve = closed.map((trade) => {
      equity += trade.pnl;
      peak = Math.max(peak, equity);
      const drawdown = equity - peak;
      maxDrawdown = Math.min(maxDrawdown, drawdown);

      return {
        ...trade,
        equity,
        peak,
        drawdown,
      };
    });

    return {
      curve,
      currentEquity: equity,
      peakEquity: peak,
      maxDrawdown,
    };
  }, [rows]);

  const selectedAdvice = useMemo(() => {
    if (!selected) return null;

    const pattern = selected.pattern || "";
    const patternData = patternPerformance.find((p) => p.pattern === pattern);
    const livePnl = unrealizedPnl(selected);
    const openQty = openShares(selected);

    if (!pattern) {
      return {
        tone: "neutral",
        title: "חסר סיווג תבנית",
        text: "בחר תבנית מסחר כדי שהמערכת תוכל להשוות את העסקה לנתונים ההיסטוריים שלך.",
      };
    }

    if (!patternData || patternData.trades < 2) {
      return {
        tone: "neutral",
        title: "אין מספיק דאטה לתבנית הזו",
        text: "התבנית קיימת, אבל עדיין אין מספיק עסקאות סגורות כדי להסיק ממנה מסקנה אמינה.",
      };
    }

    if (patternData.expectancy > 0 && livePnl !== null && livePnl >= 0) {
      return {
        tone: "good",
        title: "התבנית עובדת לטובתך",
        text: "לתבנית הזו יש Expectancy חיובי אצלך, והעסקה כרגע חיובית. ניהול לפי מבנה עדיף על יציאה מהירה.",
      };
    }

    if (patternData.expectancy > 0 && livePnl !== null && livePnl < 0) {
      return {
        tone: "warn",
        title: "תבנית טובה, עסקה תחת לחץ",
        text: "הסטטיסטיקה של התבנית חיובית, אבל העסקה כרגע שלילית. בדוק אם המבנה נשבר או שזה רק Pullback רגיל.",
      };
    }

    if (patternData.expectancy <= 0) {
      return {
        tone: "bad",
        title: "זהירות — תבנית חלשה אצלך",
        text: "לפי ההיסטוריה שלך, התבנית הזו לא מייצרת Expectancy חיובי. כדאי להקטין גודל או לדרוש אישור מבני חזק יותר.",
      };
    }

    return {
      tone: openQty > 0 ? "neutral" : "warn",
      title: "אין המלצה חד־משמעית",
      text: "המערכת צריכה עוד נתונים או עדכון ביומן כדי לתת מסקנה ברורה.",
    };
  }, [selected, patternPerformance]);

  function patchRow(ticker, patcher) {
    setRows((prev) => prev.map((r) => (r.ticker === ticker ? patcher(r) : r)));
  }

  function updateVisibleRow(index, field, value) {
    const row = visibleRows[index];
    if (!row) return;

    if (field === "ticker") return;

    patchRow(row.ticker, (old) => {
      if (field === "status" && value === "סגור") {
        const math = getPositionMath(old);
        const openQty = math.openQty || num(old.shares) || 0;
        const exit = window.prompt("מחיר יציאה מלאה:", old.exitPrice || old.lastAdd || old.entry || "");
        const journal = [
          ...(old.journal || []),
          {
            date: today(),
            action: "יציאה מלאה",
            qty: String(openQty),
            price: exit || "",
            stop: old.stop || "",
            note: "סגירה אוטומטית — כמות פתוחה מלאה",
          },
        ];
        return {
          ...old,
          status: "סגור",
          closedDate: today(),
          exitPrice: exit || "",
          journal,
        };
      }
      if (field === "status" && value === "פעיל") {
        return { ...old, status: "פעיל", closedDate: "", exitPrice: "" };
      }
      return { ...old, [field]: field === "ticker" ? value.toUpperCase() : value };
    });

    if (field === "status" && value === "סגור") {
      setViewMode("history");
      setSelectedTicker(row.ticker);
    }
  }

  function commitTicker(index) {
    const row = visibleRows[index];
    if (!row) return;

    if (row.ticker) return;

    const draft = String(tickerDrafts[index] || "").trim().toUpperCase();
    if (!draft) return;

    const exists = rows.some((r) => r.ticker === draft);
    if (exists) {
      alert("הטיקר כבר קיים במערכת");
      return;
    }

    setRows((prev) => prev.map((r) => (r === row ? { ...r, ticker: draft } : r)));
    setSelectedTicker(draft);
    setTickerDrafts((prev) => ({ ...prev, [index]: "" }));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        date: today(),
        ticker: "",
        shares: "",
        entry: "",
        stop: "",
        lastAdd: "",
        status: "פעיל",
        closedDate: "",
        exitPrice: "",
        thesis: "",
        chartImage: "",
        chartImageName: "",
        pattern: "",
        journal: [],
      },
    ]);
    setViewMode("active");
  }

  function openCloseModal(index) {
    const row = visibleRows[index];
    if (!row) return;

    const math = getPositionMath(row);
    const openQty = math.openQty || num(row.shares) || 0;

    setCloseModal({
      ticker: row.ticker,
      qty: String(openQty),
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

    patchRow(closeModal.ticker, (old) => ({
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
    setSelectedTicker(closeModal.ticker);
    setCloseModal(null);
  }

  function deleteVisibleRow(index) {
    openCloseModal(index);
  }

  function updateSelected(field, value) {
    if (!selected) return;
    patchRow(selected.ticker, (old) => ({ ...old, [field]: value }));
  }

  function addJournalLine() {
    if (!selected) return;
    patchRow(selected.ticker, (old) => ({
      ...old,
      journal: [...(old.journal || []), { date: today(), action: "הוספה", qty: "", price: "", stop: "", note: "" }],
    }));
  }

  function updateJournal(index, field, value) {
    if (!selected) return;
    patchRow(selected.ticker, (old) => {
      const journal = [...(old.journal || [])];
      journal[index] = { ...journal[index], [field]: value };
      const totalQty = journal
        .filter((x) => x.action === "כניסה" || x.action === "הוספה")
        .reduce((sum, x) => sum + (num(x.qty) || 0), 0);
      const exit = [...journal].reverse().find((x) => x.action === "יציאה מלאה" && String(x.price || "").trim());
      const math = getPositionMath({ ...old, journal });
      return {
        ...old,
        journal,
        lastAdd: latestAdd(journal, old.lastAdd),
        shares: String(math.buyQty || 0),
        status: exit ? "סגור" : old.status,
        closedDate: exit ? old.closedDate || exit.date || today() : old.closedDate,
        exitPrice: exit ? exit.price : old.exitPrice,
      };
    });
  }

  function deleteJournal(index) {
    if (!selected) return;
    patchRow(selected.ticker, (old) => ({ ...old, journal: (old.journal || []).filter((_, i) => i !== index) }));
  }

  function uploadChart(file) {
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = () => patchRow(selected.ticker, (old) => ({ ...old, chartImage: String(reader.result || ""), chartImageName: file.name }));
    reader.readAsDataURL(file);
  }

  function exportBackup() {
    const customName = window.prompt("איך לקרוא לקובץ? (בלי סיומת)", "campaign-backup");
    const fileName = `${customName || "campaign-backup"}-${today().replaceAll("/", "-")}.json`;
    const blob = new Blob([JSON.stringify({ rows }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    alert(`הגיבוי נשמר בשם:
${fileName}`);
  }

  function exportPdfReport() {
    alert("PDF report זמנית כבוי — נחזיר אותו נקי בשלב הבא");
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const importedRows = Array.isArray(parsed) ? parsed : parsed.rows;
        if (!Array.isArray(importedRows)) return alert("קובץ לא תקין");
        setRows(importedRows);
        setSelectedTicker(importedRows[0]?.ticker || "");
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
  ];

  return (
    <div className="min-h-screen bg-black p-6 text-white" dir="rtl">
      <h1 className="mb-2 text-4xl font-extrabold">ארון קמפיינים</h1>
      <p className="mb-6 text-zinc-500">מסך ראשי נקי: רק נתוני ליבה. כל העומק נמצא בתוך המגירה של הטיקר.</p>

      <div className="mb-5 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-right">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className={`mt-1 text-2xl font-extrabold ${color}`} dir="ltr">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setViewMode("active")} className={`rounded px-4 py-2 text-sm font-bold ${viewMode === "active" ? "bg-emerald-600" : "border border-zinc-700"}`}>עסקאות פעילות</button>
          <button onClick={() => setViewMode("history")} className={`rounded px-4 py-2 text-sm font-bold ${viewMode === "history" ? "bg-amber-500 text-black" : "border border-zinc-700"}`}>היסטוריה</button>
        </div>
        <div className="flex gap-2">
          <button onClick={exportBackup} className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black">גיבוי לקובץ</button>
          <button onClick={exportPdfReport} className="rounded border border-blue-500 px-4 py-2 text-sm font-bold text-blue-300">PDF דוח ביצועים</button>
          <label className="cursor-pointer rounded border border-amber-500 px-4 py-2 text-sm font-bold text-amber-300">טעינת גיבוי<input type="file" accept=".json,application/json" onChange={(e) => importBackup(e.target.files?.[0])} className="hidden" /></label>
          <button onClick={addRow} className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold">שורה חדשה</button>
      <button
  onClick={loadLivePrices}
  className="rounded border border-emerald-500 px-4 py-2 text-sm font-bold text-emerald-300"
>
  טען מחירים
</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <div className="grid min-w-[1280px] grid-cols-[110px_110px_110px_100px_120px_120px_120px_130px_110px_100px_100px_90px] gap-4 bg-zinc-900 p-3 text-sm font-bold text-zinc-300">
          <div>תאריך</div><div>טיקר</div><div>כמות קנייה</div><div>כניסה</div><div>סטופ</div><div>פוזיציה</div><div>רווח חי</div><div>מחיר נוכחי</div><div>מצב</div><div>יציאה</div><div>P/L</div><div></div>
        </div>

        {visibleRows.map((row, index) => (
          <div key={`${row.ticker}-${index}`} className="grid min-w-[1280px] grid-cols-[110px_110px_110px_100px_120px_120px_120px_130px_110px_100px_100px_90px] items-center gap-4 border-t border-zinc-800 p-3">
            <input value={row.date} onChange={(e) => updateVisibleRow(index, "date", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center" dir="ltr" />
            <input
              value={row.ticker || tickerDrafts[index] || ""}
              readOnly={Boolean(row.ticker)}
              placeholder={row.ticker ? "" : "ENTER"}
              onChange={(e) => setTickerDrafts((prev) => ({ ...prev, [index]: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTicker(index);
              }}
              onBlur={() => commitTicker(index)}
              className={`rounded border px-2 py-1 text-center font-bold ${row.ticker ? "border-zinc-800 bg-zinc-950 text-zinc-400" : "border-amber-500 bg-black text-white"}`}
              dir="ltr"
            />
            <input value={row.shares} onChange={(e) => updateVisibleRow(index, "shares", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center font-bold" dir="ltr" />
            <input value={row.entry} onChange={(e) => updateVisibleRow(index, "entry", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center text-blue-300" dir="ltr" />
            <input value={row.stop} onChange={(e) => updateVisibleRow(index, "stop", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center text-red-400" dir="ltr" />
            <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-center font-bold text-emerald-300" dir="ltr">{money(positionValue(row))}</div>
            <div className={`rounded border px-2 py-1 text-center font-bold ${unrealizedPnl(row) === null ? "border-zinc-800 text-zinc-500" : unrealizedPnl(row) >= 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-400"}`} dir="ltr">{money(unrealizedPnl(row))}</div>
            <input value={row.lastAdd || ""} onChange={(e) => updateVisibleRow(index, "lastAdd", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center text-emerald-400" dir="ltr" />
            <select value={row.status} onChange={(e) => updateVisibleRow(index, "status", e.target.value)} className={`rounded border px-2 py-1 text-center text-xs font-bold ${row.status === "פעיל" ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-red-500/40 bg-red-500/20 text-red-400"}`}><option>פעיל</option><option>סגור</option></select>
            <input value={row.exitPrice || ""} onChange={(e) => updateVisibleRow(index, "exitPrice", e.target.value)} className="rounded border border-zinc-800 bg-black px-2 py-1 text-center text-amber-300" dir="ltr" />
            <div className={`rounded border px-2 py-1 text-center font-bold ${closedPnl(row) === null ? "border-zinc-800 text-zinc-500" : closedPnl(row) >= 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-400"}`} dir="ltr">{money(closedPnl(row))}</div>
            <div className="flex gap-2"><button onClick={() => setSelectedTicker(row.ticker)} className="rounded bg-amber-500 px-3 py-1 text-sm font-bold text-black">פתח</button><button onClick={() => deleteVisibleRow(index)} className="rounded bg-red-700 px-3 py-1 text-sm font-bold">×</button></div>
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
                <div className="mb-1 text-right text-xs text-zinc-500">כמות יציאה</div>
                <input
                  value={closeModal.qty}
                  onChange={(e) => setCloseModal((m) => ({ ...m, qty: e.target.value }))}
                  className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-left text-amber-300 outline-none focus:border-amber-400"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="mb-1 text-right text-xs text-zinc-500">מחיר יציאה</div>
                <input
                  value={closeModal.price}
                  onChange={(e) => setCloseModal((m) => ({ ...m, price: e.target.value }))}
                  className="w-full rounded border border-zinc-800 bg-black px-3 py-2 text-left text-emerald-300 outline-none focus:border-emerald-400"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="mb-1 text-right text-xs text-zinc-500">סיבת סגירה / הערה</div>
                <textarea
                  value={closeModal.reason}
                  onChange={(e) => setCloseModal((m) => ({ ...m, reason: e.target.value }))}
                  className="h-20 w-full rounded border border-zinc-800 bg-black px-3 py-2 text-right outline-none focus:border-amber-400"
                  placeholder="למה סגרת? יעד, שבירת מבנה, סטופ, החלטה ידנית..."
                />
              </div>
            </div>

            <div className="mt-5 flex justify-between gap-2">
              <button
                onClick={() => {
                  // התעלם = סגירה בלי שמירה בהיסטוריה
                  setRows((prev) => prev.filter((r) => r.ticker !== closeModal.ticker));
                  if (selectedTicker === closeModal.ticker) setSelectedTicker("");
                  setCloseModal(null);
                }}
                className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
              >
                התעלם
              </button>

              <button
                onClick={() => setCloseModal(null)}
                className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
              >
                ביטול
              </button>

              <button
                onClick={confirmCloseTrade}
                className="rounded bg-amber-500 px-4 py-2 text-sm font-bold text-black"
              >
                אשר סגירה
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-5 flex items-center justify-between">
            <button onClick={() => setSelectedTicker("")} className="rounded border border-zinc-700 px-3 py-2 text-sm text-zinc-400">סגור מגירה</button>
            <div className="text-right">
              <h2 className="text-2xl font-extrabold" dir="ltr">{selected.ticker}</h2>
              <div className="text-sm text-zinc-500">{selected.status === "סגור" ? "מגירת היסטוריה" : "מגירה פנימית"}</div>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-6">
            {[
              ["כניסה", selected.entry, "text-blue-300"],
              ["סטופ", selected.stop, "text-red-400"],
              ["מחיר נוכחי", selected.lastAdd || "—", "text-emerald-400"],
              ["כמות קנייה", totalBoughtQty(selected), "text-white"],
              ["כמות פתוחה", openShares(selected), "text-amber-300"],
              ["Avg", avgCost(selected) ? Number(avgCost(selected)).toFixed(2) : "—", "text-blue-300"],
              ["פוזיציה", money(positionValue(selected)), "text-emerald-300"],
              ["רווח חי", money(unrealizedPnl(selected)), unrealizedPnl(selected) !== null && unrealizedPnl(selected) >= 0 ? "text-emerald-300" : "text-red-400"],
              ["מצב", selected.status, selected.status === "סגור" ? "text-red-400" : "text-emerald-300"],
              ["תאריך סגירה", selected.closedDate || "—", "text-zinc-300"],
              ["משך ימים", durationDays(selected) ?? "—", "text-amber-300"],
              ["תבנית", selected.pattern || "—", "text-amber-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded border border-zinc-800 bg-black p-3 text-right">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className={`font-bold ${color}`} dir="ltr">{value}</div>
              </div>
            ))}
          </div>

          <div className={`mb-5 grid gap-3 ${selected.status === "סגור" ? "md:grid-cols-1" : "md:grid-cols-2"}`}>
            <div className="rounded border border-zinc-800 bg-black p-3">
              <div className="mb-3 text-right text-sm font-bold text-amber-300">תבנית מסחר</div>
              <select value={selected.pattern || ""} onChange={(e) => updateSelected("pattern", e.target.value)} className="mb-4 w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm text-amber-300">
                <option value="">בחר תבנית</option>
                {tradePatterns.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              {selectedAdvice && (
                <div className={`mb-4 rounded border p-3 text-right ${selectedAdvice.tone === "good" ? "border-emerald-500/40 bg-emerald-500/10" : selectedAdvice.tone === "bad" ? "border-red-500/40 bg-red-500/10" : selectedAdvice.tone === "warn" ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-950"}`}>
                  <div className="mb-1 text-sm font-bold text-amber-300">המלצה חיה</div>
                  <div className="text-sm text-zinc-300">{selectedAdvice.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">{selectedAdvice.text}</div>
                </div>
              )}

              <div className="mb-2 text-right text-sm font-bold text-amber-300">תזה</div>
              <textarea value={selected.thesis || ""} onChange={(e) => updateSelected("thesis", e.target.value)} className="h-24 w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-right text-sm" />

              {selected.status !== "סגור" && (
                <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-2 text-right text-xs font-bold text-zinc-400">קובץ גרף / צילום מסך</div>
                  <input type="file" accept="image/*" onChange={(e) => uploadChart(e.target.files?.[0])} className="w-full rounded border border-zinc-800 bg-black p-2 text-sm text-zinc-300" />
                  {selected.chartImageName && <div className="mt-2 text-right text-xs text-emerald-400">נשמר: {selected.chartImageName}</div>}
                </div>
              )}
            </div>

            {selected.status !== "סגור" && selected.chartImage && (
              <div className="rounded border border-zinc-800 bg-black p-3">
                <div className="mb-2 text-right text-sm font-bold text-amber-300">גרף שמור</div>
                <img src={selected.chartImage} alt="chart" className="max-h-[380px] w-full rounded object-contain" />
              </div>
            )}
          </div>

          <div className="rounded border border-zinc-800 bg-black p-3">
            <div className="mb-3 flex items-center justify-between">
              <button onClick={addJournalLine} className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold">פעולה +</button>
              <div className="text-sm font-bold text-amber-300">יומן פעולות</div>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[860px] grid-cols-[120px_140px_100px_120px_120px_1fr_60px] gap-2 border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-500">
                <div>תאריך</div><div>פעולה</div><div>כמות</div><div>מחיר</div><div>סטופ</div><div>הערה</div><div></div>
              </div>
              {(selected.journal || []).map((line, i) => (
                <div key={i} className="grid min-w-[860px] grid-cols-[120px_140px_100px_120px_120px_1fr_60px] items-center gap-2 border-b border-zinc-900 py-2">
                  <input value={line.date} onChange={(e) => updateJournal(i, "date", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center" dir="ltr" />
                  <select value={line.action} onChange={(e) => updateJournal(i, "action", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
                    {actions.map((a) => <option key={a}>{a}</option>)}
                  </select>
                  <input value={line.qty || ""} onChange={(e) => updateJournal(i, "qty", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-amber-300" dir="ltr" />
                  <input value={line.price} onChange={(e) => updateJournal(i, "price", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center" dir="ltr" />
                  <input value={line.stop} onChange={(e) => updateJournal(i, "stop", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-red-400" dir="ltr" />
                  <input value={line.note} onChange={(e) => updateJournal(i, "note", e.target.value)} className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1" />
                  <button onClick={() => deleteJournal(i)} className="rounded bg-red-700 px-3 py-1 text-sm font-bold">×</button>
                </div>
              ))}
            </div>
          </div>
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
            <div className="mb-3 text-right text-sm font-bold text-amber-300">Equity Curve + Drawdown</div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-right">
              <div className="rounded border border-zinc-800 bg-black p-3">
                <div className="text-xs text-zinc-500">Equity סגור</div>
                <div className={equityStats.currentEquity >= 0 ? "font-bold text-emerald-300" : "font-bold text-red-400"} dir="ltr">
                  {money(equityStats.currentEquity)}
                </div>
              </div>
              <div className="rounded border border-zinc-800 bg-black p-3">
                <div className="text-xs text-zinc-500">Peak</div>
                <div className="font-bold text-blue-300" dir="ltr">{money(equityStats.peakEquity)}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-black p-3">
                <div className="text-xs text-zinc-500">Max DD</div>
                <div className="font-bold text-red-400" dir="ltr">{money(equityStats.maxDrawdown)}</div>
              </div>
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
              {equityStats.curve.length === 0 && <div className="text-sm text-zinc-500">אין עדיין עסקאות סגורות ל־Equity Curve.</div>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">ביצועים לפי תבנית</div>
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[180px_80px_100px_120px_120px_120px] gap-2 border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-500">
              <div>תבנית</div><div>עסקאות</div><div>Win Rate</div><div>רווח כולל</div><div>Expectancy</div><div>ממוצע לעסקה</div>
            </div>
            {patternPerformance.map((p) => (
              <div key={p.pattern} className="grid grid-cols-[180px_80px_100px_120px_120px_120px] gap-2 border-b border-zinc-900 py-2 text-sm">
                <div>{p.pattern}</div>
                <div>{p.trades}</div>
                <div className="text-blue-300">{percent(p.winRate)}</div>
                <div className={p.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"}>{money(p.totalPnl)}</div>
                <div className={p.expectancy >= 0 ? "text-emerald-300" : "text-red-400"}>{money(p.expectancy)}</div>
                <div className="text-zinc-300">{money(p.totalPnl / (p.trades || 1))}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="mb-3 text-right text-sm font-bold text-amber-300">פילוח לפי זמן</div>
          <div className="grid grid-cols-[140px_100px_140px_140px] gap-2 text-sm">
            <div className="text-zinc-500">טווח</div><div className="text-zinc-500">עסקאות</div><div className="text-zinc-500">רווח כולל</div><div className="text-zinc-500">ממוצע</div>
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
            <div className="text-zinc-500">תבנית + זמן</div><div className="text-zinc-500">עסקאות</div><div className="text-zinc-500">רווח כולל</div><div className="text-zinc-500">ממוצע</div>
            {patternDurationCombo.map((c) => (
              <React.Fragment key={c.label}>
                <div>{c.label}</div>
                <div>{c.trades}</div>
                <div className={c.totalPnl >= 0 ? "text-emerald-300" : "text-red-400"}>{money(c.totalPnl)}</div>
                <div className="text-zinc-300">{money(c.avg)}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
