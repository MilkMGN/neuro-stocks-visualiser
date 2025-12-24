// Config
const DATA_URL = "https://raw.githubusercontent.com/VedalAI/neuro-stocks-data/main/portfolio.json";
const REFRESH_MS = 30000;
const HISTORY_LIMIT = 1200;
const SAMPLE_TARGET = 400;
const TWITCH_PROXY_URL = window.TWITCH_PROXY_URL || "";
const SLEEP_CACHE_MS = 60000;

let equityChart;
let refreshTimer;
let sleepCache = { at: 0, value: false };

// Helpers
const fmtCurrency = (v) => Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtNumber = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtPercent = (v) => `${(Number(v) * 100).toFixed(2)}%`;
const fmtDateTime = (isoOrTs) => {
  const d = typeof isoOrTs === "number" ? new Date(isoOrTs * 1000) : new Date(isoOrTs);
  return d.toLocaleString("en-GB", { hour12: false });
};

const setDelta = (el, val) => {
  el.textContent = val;
  if (typeof val === "string" && val.startsWith("-")) {
    el.classList.add("negative");
  } else {
    el.classList.remove("negative");
  }
};

const sliceRecent = (arr, limit) => (Array.isArray(arr) && arr.length > limit ? arr.slice(-limit) : arr);
const downsample = (arr, target = SAMPLE_TARGET) => {
  if (!Array.isArray(arr) || arr.length <= target) return arr;
  const step = Math.ceil(arr.length / target);
  const result = [];
  for (let i = 0; i < arr.length; i += step) result.push(arr[i]);
  if (result[result.length - 1] !== arr[arr.length - 1]) result.push(arr[arr.length - 1]);
  return result;
};

// Renderers
const renderChart = (history) => {
  const ctx = document.getElementById("equity-chart").getContext("2d");
  const trimmed = sliceRecent(history, HISTORY_LIMIT);
  const sampled = downsample(trimmed, SAMPLE_TARGET);
  const labels = sampled.map((p) => fmtDateTime(p.timestamp));
  const values = sampled.map((p) => p.equity);
  if (!equityChart) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, "rgba(216, 108, 255, 0.35)");
    gradient.addColorStop(1, "rgba(216, 108, 255, 0.05)");
    equityChart = new Chart(ctx, {
      type: "line",
      data: { labels, datasets: [{ label: "Equity", data: values, borderColor: "#d86cff", borderWidth: 2.5, fill: true, backgroundColor: gradient, tension: 0.25, pointRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              color: "#c9bedf",
              autoSkip: true,
              maxTicksLimit: 6,
              callback: (_value, idx) => {
                const label = labels[idx] || "";
                return label.split(",")[1]?.trim() || label;
              }
            },
            grid: { display: false }
          },
          y: {
            ticks: { color: "#c9bedf" },
            grid: { color: "rgba(255,255,255,0.08)" }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(12, 11, 22, 0.85)",
            borderColor: "rgba(216,108,255,0.6)",
            borderWidth: 1,
            titleColor: "#f3eaff",
            bodyColor: "#f3eaff",
            callbacks: {
              label: (ctx) => fmtCurrency(ctx.parsed.y),
              title: (items) => labels[items[0].dataIndex]
            }
          }
        }
      }
    });
  } else {
    equityChart.data.labels = labels;
    equityChart.data.datasets[0].data = values;
    equityChart.update();
  }
};

const renderPositions = (positions) => {
  const tbody = document.querySelector("#positions-table tbody");
  if (!positions || positions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">No positions.</td></tr>';
    return;
  }
  tbody.innerHTML = positions.map((p) => {
    const cp = Number(p.currentPrice);
    const prev = Number(p.lastdayPrice);
    const reported = Number(p.changeToday);
    const derived = prev ? (cp - prev) / prev : 0;
    const change = Number.isFinite(reported) && reported !== 0 ? reported : derived;
    const changeClass = change >= 0 ? "badge" : "badge negative";
    const changeText = `${change >= 0 ? "▲" : "▼"} ${fmtPercent(Math.abs(change))}`;
    return `
      <tr>
        <td><strong>${p.symbol}</strong></td>
        <td>${fmtNumber(p.qty)}</td>
        <td>${fmtCurrency(p.marketValue)}</td>
        <td>${fmtCurrency(p.costBasis)}</td>
        <td>${fmtCurrency(p.currentPrice)}</td>
        <td>${fmtCurrency(p.lastdayPrice)}</td>
        <td><span class="${changeClass}">${changeText}</span></td>
      </tr>
    `;
  }).join("");
};

const renderActivities = (activities) => {
  const container = document.getElementById("activity-list");
  const items = Object.entries(activities || {}).flatMap(([id, arr]) =>
    arr.map((a) => ({ ...a, id }))
  );
  if (items.length === 0) {
    container.innerHTML = "<div class='muted'>No activity.</div>";
    return;
  }
  items.sort((a, b) => new Date(b.transaction_time) - new Date(a.transaction_time));
  const topItems = items.slice(0, 20);
  container.innerHTML = topItems.map((a) => {
    const sideColor = a.side === "buy" ? "var(--success)" : "var(--danger)";
    return `
      <div class="activity">
        <div>
          <strong>${a.side.toUpperCase()}</strong> ${a.qty} ${a.symbol} @ ${fmtCurrency(a.price)}
        </div>
        <div class="mini" style="color:${sideColor}">${fmtDateTime(a.transaction_time)}</div>
      </div>
    `;
  }).join("");
};

const updateSleepBanner = (isSleeping) => {
  const banner = document.getElementById("sleep-banner");
  if (!banner) return;
  banner.style.display = isSleeping ? "flex" : "none";
};

const fetchTwitchStatus = async () => {
  if (!TWITCH_PROXY_URL) {
    updateSleepBanner(false);
    return;
  }
  const now = Date.now();
  if (now - sleepCache.at < SLEEP_CACHE_MS) {
    updateSleepBanner(sleepCache.value);
    return;
  }
  const res = await fetch(`${TWITCH_PROXY_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Twitch proxy HTTP ${res.status}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Twitch proxy non-JSON response (first chars: ${text.slice(0, 80)})`);
  }
  const isSleeping = !!json.isSleeping;
  sleepCache = { at: now, value: isSleeping };
  updateSleepBanner(isSleeping);
};

const renderSummary = (account, history) => {
  const equity = Number(account.equity);
  const cash = Number(account.cash);
  const original = Number(account.originalInvestment || 20000);
  const delta = equity - original;
  const deltaPct = original ? delta / original : 0;

  document.getElementById("portfolio-value").textContent = fmtCurrency(equity);
  document.getElementById("cash").textContent = fmtCurrency(cash);
  document.getElementById("pl").textContent = fmtCurrency(delta);
  setDelta(document.getElementById("pl-percent"), `${(deltaPct * 100).toFixed(2)}%`);

  const latest = history?.[history.length - 1];
  if (latest) {
    document.getElementById("last-change").textContent = fmtCurrency(latest.change || 0);
    setDelta(document.getElementById("last-change-percent"), fmtPercent(latest.changePercent || 0));
    document.getElementById("last-change-time").textContent = `At ${fmtDateTime(latest.timestamp)}`;
  }
};

const loadData = async () => {
  document.getElementById("refresh-btn").disabled = true;
  try {
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    document.getElementById("error-box").style.display = "none";
    document.getElementById("error-text").textContent = "";

    renderSummary(data.account, data.history);
    renderChart(data.history || []);
    renderPositions(data.positions || []);
    renderActivities(data.activities || {});
    fetchTwitchStatus().catch((err) => console.warn("Twitch check failed", err));

    const updated = new Date();
    document.getElementById("last-updated").textContent = `Last updated: ${updated.toLocaleString("en-GB", { hour12: false, timeZone: "UTC" })} UTC`;
  } catch (err) {
    console.error(err);
    const errorBox = document.getElementById("error-box");
    const errorText = document.getElementById("error-text");
    if (errorBox && errorText) {
      errorText.textContent = err.message || "Unknown error";
      errorBox.style.display = "inline-flex";
    }
  } finally {
    document.getElementById("refresh-btn").disabled = false;
  }
};

const startAutoRefresh = () => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadData, REFRESH_MS);
};

document.getElementById("refresh-btn").addEventListener("click", loadData);
loadData();
startAutoRefresh();
