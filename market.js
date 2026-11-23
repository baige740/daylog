import { icon } from "./icons.js";

const assets = [
  ["上证指数", "点", "chart", "#438a71", "#e4f2e9"],
  ["COMEX 黄金", "美元 / 金衡盎司", "gold", "#bc9145", "#faf0d8"],
  ["COMEX 白银", "美元 / 金衡盎司", "gem", "#7c8fa6", "#edf0f5"],
  ["WTI 原油", "美元 / 桶", "oil", "#a78062", "#f5ede4"],
];

const quoteSymbols = ["sh000001", "hf_GC", "hf_SI", "hf_CL"];
const quoteEndpoint = "https://qt.gtimg.cn/q=" + quoteSymbols.join(",");
const breadthMarkets = [
  { secid: "1.000001", name: "沪市" },
  { secid: "0.399001", name: "深市" },
  { secid: "0.899050", name: "北交所" },
];
const breadthEndpoint = "https://push2.eastmoney.com/api/qt/ulist.np/get"
  + "?fltt=2&invt=2"
  + "&fields=f12,f13,f104,f105,f106,f124"
  + "&secids=" + breadthMarkets.map(market => market.secid).join(",");
const sinaBreadthCountEndpoint = "https://vip.stock.finance.sina.com.cn/"
  + "quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a";
const sinaBreadthPageEndpoint = "https://vip.stock.finance.sina.com.cn/"
  + "quotes_service/api/json_v2.php/Market_Center.getHQNodeData"
  + "?sort=changepercent&asc=0&node=hs_a&symbol=&_s_r_a=page";
const sinaBreadthPageSize = 100;
const marketCacheKey = "daylog:market";
const breadthCacheKey = "daylog:market-breadth";
const rateKey = "daylog:usd-cny";
const gramsPerTroyOunce = 31.1034768;

// This dated snapshot keeps the RMB estimates useful before the first FX request finishes.
const bundledRate = {
  rate: 6.69198,
  asOf: 1795132952,
  nextUpdate: 1795221582,
};

function format(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCount(value) {
  return Number(value).toLocaleString("zh-CN");
}

function delta(value) {
  return (value > 0 ? "+" : "") + value.toFixed(2) + "%";
}

function validRate(fx) {
  return Number.isFinite(fx?.rate)
    && fx.rate > 0
    && Number.isSafeInteger(fx.asOf)
    && fx.asOf > 0
    && fx.asOf <= Date.now() / 1000 + 300
    && Number.isSafeInteger(fx.nextUpdate)
    && fx.nextUpdate > fx.asOf;
}

function yuanPrice(symbol, price, rate) {
  if (symbol === "hf_CL") return format(price * rate) + " 元/桶";
  return format(price * rate / gramsPerTroyOunce) + " 元/克";
}

function rateDate(fx) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fx.asOf * 1000);
}

function providerTimestamp(seconds) {
  const value = Number(seconds);
  if (!Number.isSafeInteger(value) || value <= 0) return "";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value * 1000);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day
    + " " + values.hour + ":" + values.minute + ":" + values.second;
}

function validBreadth(value) {
  return value
    && Number.isInteger(value.advancing)
    && Number.isInteger(value.declining)
    && Number.isInteger(value.unchanged)
    && value.advancing >= 0
    && value.declining >= 0
    && value.unchanged >= 0
    && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value.timestamp || "")
    && typeof value.complete === "boolean"
    && Array.isArray(value.markets)
    && (value.source === undefined || value.source === "eastmoney" || value.source === "sina");
}

function readCachedBreadth() {
  try {
    const value = JSON.parse(localStorage.getItem(breadthCacheKey));
    return validBreadth(value)
      ? {...value, source: value.source === "sina" ? "sina" : "eastmoney"}
      : null;
  } catch {
    return null;
  }
}

function updateHistory(history, quote) {
  const rows = (history || []).slice();
  const date = quote.timestamp.slice(0, 10);
  const last = rows.at(-1);
  if (last?.[0] === date && last.length === 3) {
    rows[rows.length - 1] = [date, quote.price, "quote"];
  } else if (!last || date > last[0]) {
    rows.push([date, quote.price, "quote"]);
  }
  return rows.slice(-32);
}

function curve(rows, color, id, large = false) {
  if (!rows?.length) return "";
  const values = rows.map(row => row[1]);
  const low = Math.min(...values);
  const span = Math.max(...values) - low || 1;
  const coords = values.map((price, index) => (
    2 + index * 106 / Math.max(1, values.length - 1)
  ).toFixed(2) + "," + (32 - (price - low) / span * 26).toFixed(2)).join(" ");
  return '<svg class="' + (large ? "chart-detail" : "spark") + '" viewBox="0 0 110 37"'
    + ' preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id
    + '" x1="0" y1="0" x2="0" y2="1"><stop stop-color="' + color
    + '" stop-opacity=".17"></stop><stop offset="1" stop-color="' + color
    + '" stop-opacity="0"></stop></linearGradient></defs><polygon points="2,37 '
    + coords + ' 108,37" fill="url(#' + id + ')"></polygon><polyline points="'
    + coords + '" fill="none" stroke="' + color + '" stroke-width="' + (large ? 2 : 1.65)
    + '" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round">'
    + "</polyline></svg>";
}

function parseQuotes(raw) {
  return quoteSymbols.map((symbol, index) => {
    const text = raw.match(new RegExp('v_' + symbol + '="([^"]+)"'))?.[1];
    if (!text) return null;
    const fields = text.split(index ? "," : "~");
    const quoteTime = fields[30] || "";
    const price = Number(index ? fields[0] : fields[3]);
    const change = Number(index ? fields[1] : fields[32]);
    const timestamp = index
      ? fields[12] + " " + fields[6]
      : quoteTime.replace(
        /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/,
        "$1-$2-$3 $4:$5:$6",
      );
    return price > 0
      && Number.isFinite(change)
      && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(timestamp)
      ? { price, change, timestamp }
      : null;
  });
}

async function fetchQuotes() {
  const response = await fetch(quoteEndpoint, {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("行情接口返回异常");
  const quotes = parseQuotes(new TextDecoder("gb18030").decode(await response.arrayBuffer()));
  if (quotes.some(quote => !quote)) throw new Error("行情返回不完整");
  return quotes;
}

async function fetchEastmoneyBreadth() {
  const response = await fetch(breadthEndpoint + "&_=" + Date.now(), {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error("全市场涨跌平接口返回异常");
  const payload = await response.json();
  const rows = payload?.data?.diff;
  if (!Array.isArray(rows)) throw new Error("全市场涨跌平返回不完整");

  const bySecid = new Map(rows.map(row => [String(row.f13) + "." + String(row.f12), row]));
  const markets = breadthMarkets.flatMap(market => {
    const row = bySecid.get(market.secid);
    const advancing = Number(row?.f104);
    const declining = Number(row?.f105);
    const unchanged = Number(row?.f106);
    if (
      !Number.isInteger(advancing)
      || !Number.isInteger(declining)
      || !Number.isInteger(unchanged)
    ) {
      return [];
    }
    return [{
      name: market.name,
      advancing,
      declining,
      unchanged,
      timestamp: providerTimestamp(row.f124),
    }];
  });

  if (markets.length !== breadthMarkets.length) {
    throw new Error("沪深京全市场涨跌平数据不完整");
  }

  const timestamp = markets
    .map(market => market.timestamp)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!timestamp) throw new Error("全市场涨跌平时间缺失");

  return {
    advancing: markets.reduce((sum, market) => sum + market.advancing, 0),
    declining: markets.reduce((sum, market) => sum + market.declining, 0),
    unchanged: markets.reduce((sum, market) => sum + market.unchanged, 0),
    timestamp,
    complete: true,
    source: "eastmoney",
    markets,
  };
}

function sinaChangePercent(row) {
  const value = Number(row?.changepercent);
  return Number.isFinite(value) ? value : 0;
}

async function fetchSinaPage(page, size = sinaBreadthPageSize) {
  const response = await fetch(
    sinaBreadthPageEndpoint + "&page=" + page + "&num=" + size + "&_=" + Date.now(),
    {
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(7000),
    },
  );
  if (!response.ok) throw new Error("新浪全市场排行接口返回异常");
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("新浪全市场排行返回不完整");
  }
  return {
    page,
    start: (page - 1) * size,
    rows,
  };
}

async function findSinaBoundary(total, predicate) {
  const pageCount = Math.ceil(total / sinaBreadthPageSize);
  const maximumRequests = Math.ceil(Math.log2(pageCount + 1)) + 2;
  let low = 1;
  let high = pageCount;
  let boundary = total;
  let requests = 0;

  while (low <= high) {
    if (++requests > maximumRequests) {
      throw new Error("新浪全市场分页定位次数异常");
    }
    const middle = Math.floor((low + high) / 2);
    const page = await fetchSinaPage(middle);
    const expectedRows = Math.max(
      0,
      Math.min(sinaBreadthPageSize, total - page.start),
    );
    if (!expectedRows || page.rows.length > sinaBreadthPageSize) {
      throw new Error("新浪全市场分页范围异常");
    }
    const rows = page.rows.slice(0, expectedRows);
    const local = rows.findIndex(row => predicate(sinaChangePercent(row)));
    if (local >= 0) {
      boundary = page.start + local;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return boundary;
}

async function fetchSinaBreadth() {
  const countResponse = await fetch(sinaBreadthCountEndpoint + "&_=" + Date.now(), {
    cache: "no-store",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(7000),
  });
  if (!countResponse.ok) throw new Error("新浪全市场股票数接口返回异常");
  const total = Number(await countResponse.json());
  if (!Number.isInteger(total) || total < 1000) {
    throw new Error("新浪全市场股票数异常");
  }

  const advancing = await findSinaBoundary(total, value => value <= 0);
  const downStart = await findSinaBoundary(total, value => value < 0);
  if (advancing > downStart || downStart > total) {
    throw new Error("新浪全市场涨跌平边界异常");
  }
  return {
    advancing,
    declining: total - downStart,
    unchanged: downStart - advancing,
    timestamp: providerTimestamp(Math.floor(Date.now() / 1000)),
    complete: true,
    source: "sina",
    markets: [],
  };
}

async function fetchBreadth() {
  let eastmoneyError;
  try {
    return await fetchEastmoneyBreadth();
  } catch (error) {
    eastmoneyError = error;
  }
  try {
    return await fetchSinaBreadth();
  } catch (error) {
    throw new AggregateError(
      [eastmoneyError, error],
      "全市场涨跌平暂不可用",
    );
  }
}

function breadthScope(breadth) {
  return breadth?.complete ? "沪深京全市场" : "沪深市场";
}

function breadthSource(breadth) {
  return breadth?.source === "sina" ? "新浪财经" : "东方财富";
}

function breadthMarkup(breadth) {
  if (!breadth) {
    return '<span class="market-breadth is-pending">全市场涨跌平正在同步</span>';
  }
  return '<span class="market-breadth" title="' + breadthScope(breadth)
    + "，" + breadthSource(breadth) + "，统计时间 " + breadth.timestamp + '">'
    + '<span class="market-breadth-title">' + breadthScope(breadth) + "</span>"
    + '<span class="is-up"><small>涨</small><b>' + formatCount(breadth.advancing) + "</b></span>"
    + '<span class="is-down"><small>跌</small><b>' + formatCount(breadth.declining) + "</b></span>"
    + '<span class="is-flat"><small>平</small><b>' + formatCount(breadth.unchanged) + "</b></span>"
    + "</span>";
}

function breadthDetails(breadth) {
  if (!breadth) return "";
  const sourceName = breadthSource(breadth);
  const sourceUrl = breadth.source === "sina"
    ? "https://vip.stock.finance.sina.com.cn/mkt/#hs_a"
    : "https://quote.eastmoney.com/center/#/index/1.000001";
  const scopeText = breadth.source === "sina"
    ? "沪深京 A 股实时排行按个股涨跌幅汇总；停牌或无涨跌幅的股票按平盘计入。"
    : "按个股涨跌方向汇总；沪市、深市、北交所依次为 涨 / 跌 / 平："
      + breadth.markets
        .map(market => market.name + " " + formatCount(market.advancing) + " / "
          + formatCount(market.declining) + " / " + formatCount(market.unchanged))
        .join("；");
  return "<dt>全市场涨跌平</dt><dd><span class=\"dialog-breadth\">"
    + "<b class=\"is-up\">涨 " + formatCount(breadth.advancing) + "</b>"
    + "<b class=\"is-down\">跌 " + formatCount(breadth.declining) + "</b>"
    + "<b class=\"is-flat\">平 " + formatCount(breadth.unchanged) + "</b></span></dd>"
    + "<dt>统计口径</dt><dd>" + breadthScope(breadth) + "。" + scopeText + "</dd>"
    + "<dt>统计时间</dt><dd>" + breadth.timestamp + " 北京时间</dd>"
    + "<dt>家数来源</dt><dd><a href=\"" + sourceUrl
    + "\" target=\"_blank\" rel=\"noopener noreferrer\">"
    + sourceName + "实时行情</a></dd>";
}

export async function startMarket(openDialog, toast) {
  const section = document.querySelector("#markets");
  const state = document.querySelector("#market-state");
  const button = document.querySelector("#refresh");
  let rows = [];
  let breadth = readCachedBreadth();
  let refreshing = false;
  let fx = bundledRate;
  let retryRateAfter = 0;
  let lastQuoteFailed = false;
  let lastBreadthFailed = false;

  try {
    const saved = JSON.parse(localStorage.getItem(rateKey));
    if (validRate(saved) && saved.asOf >= fx.asOf) fx = saved;
  } catch {
    // Keep the bundled dated rate.
  }

  async function refreshRate() {
    const now = Date.now();
    if (now < Math.max(fx.nextUpdate * 1000, retryRateAfter)) return;
    retryRateAfter = now + 3600000;
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) return;
      const data = await response.json();
      const next = {
        rate: data.rates?.CNY,
        asOf: data.time_last_update_unix,
        nextUpdate: data.time_next_update_unix,
      };
      if (
        data.result !== "success"
        || data.base_code !== "USD"
        || !validRate(next)
        || next.asOf < fx.asOf
      ) {
        return;
      }
      fx = next;
      paint();
      try {
        localStorage.setItem(rateKey, JSON.stringify(fx));
      } catch {
        // The current page still uses the fresh rate.
      }
    } catch {
      // Keep the dated local rate while the provider is unavailable.
    }
  }

  function paint() {
    section.innerHTML = assets.map(([name, unit, glyph, tone, light], index) => {
      const row = rows[index];
      const cny = index && row
        ? '<span class="market-cny" title="汇率时间 ' + rateDate(fx) + ' 北京时间">≈ '
          + yuanPrice(quoteSymbols[index], row.price, fx.rate) + "</span>"
        : "";
      const marketBreadth = index === 0 ? breadthMarkup(breadth) : "";
      return '<button class="market-card" data-asset="' + index
        + '" style="--tone:' + tone + ";--light:" + light
        + '" aria-label="查看' + name + '详情"><span class="market-name">'
        + '<span class="asset-glyph">' + icon(glyph) + "</span>" + name
        + '</span><strong class="market-price">' + (row ? format(row.price) : "—")
        + " <small>" + unit + '</small></strong>' + cny
        + '<span class="market-change ' + (row?.change > 0 ? "up" : "") + '">'
        + (row ? icon(row.change > 0 ? "trendUp" : "trendDown") + delta(row.change) : "暂无报价")
        + "</span>" + marketBreadth + curve(row?.history, tone, "curve" + index)
        + "</button>";
    }).join("");
  }

  function showStatus(cached) {
    const latest = rows.map(row => row?.timestamp || "").sort().at(-1);
    const breadthText = breadth
      ? "涨跌平 " + breadth.timestamp.slice(5, 16)
      : "涨跌平同步中";
    const mode = cached ? "上次有效行情" : "已刷新";
    state.innerHTML = latest
      ? "<i></i>" + mode + " · " + latest.slice(5, 16) + " · " + breadthText
      : "行情暂不可用";
    state.dataset.stale = cached ? "true" : "false";
    state.title = [
      latest ? "行情时间 " + latest + " 北京时间" : "暂时没有有效行情",
      breadth ? breadthScope(breadth) + "统计时间 " + breadth.timestamp : "全市场涨跌平尚未取得",
      lastQuoteFailed ? "本次行情刷新失败，已保留上次有效报价" : "",
      lastBreadthFailed ? "本次涨跌平刷新失败，已保留上次有效家数" : "",
    ].filter(Boolean).join("；");
  }

  section.addEventListener("click", event => {
    const card = event.target.closest("[data-asset]");
    if (!card) return;
    const index = Number(card.dataset.asset);
    const row = rows[index];
    const [name, unit, , color] = assets[index];
    if (!row) {
      toast("行情暂不可用，可点击刷新重试");
      return;
    }
    const history = row.history || [];
    const conversion = index
      ? "<dt>人民币折算</dt><dd>约 " + yuanPrice(quoteSymbols[index], row.price, fx.rate)
        + "</dd><dt>参考汇率</dt><dd>1 美元 = " + fx.rate
        + " 元人民币</dd><dt>汇率时间</dt><dd>" + rateDate(fx)
        + " 北京时间</dd><dt>汇率来源</dt><dd>"
        + '<a href="https://www.exchangerate-api.com/" target="_blank"'
        + ' rel="noopener noreferrer">ExchangeRate-API</a></dd>'
      : breadthDetails(breadth);
    openDialog(
      name,
      '<div class="detail-price">' + format(row.price)
        + ' <small style="font-size:14px;color:#718375">' + unit + "</small></div>"
        + curve(history, color, "detail-chart", true)
        + '<dl class="dialog-info">' + conversion
        + "<dt>" + (index ? "美元涨跌幅" : "涨跌幅") + "</dt><dd>" + delta(row.change) + "</dd>"
        + "<dt>报价时间</dt><dd>" + row.timestamp + " 北京时间</dd>"
        + "<dt>报价来源</dt><dd>腾讯财经</dd>"
        + (history.length
          ? "<dt>走势范围</dt><dd>" + history[0][0] + " 至 " + history.at(-1)[0]
            + "</dd><dt>走势来源</dt><dd>"
            + (index
              ? "新浪财经历史收盘价，随后按日保留本机获取的最近报价。"
              : "腾讯财经历史收盘价，随后按日保留本机获取的最近报价。")
            + "</dd>"
          : "")
        + "</dl>",
    );
  });

  async function refresh(manual = false) {
    if (refreshing) return false;
    refreshing = true;
    button.disabled = true;
    void refreshRate();
    try {
      const [quoteResult, breadthResult] = await Promise.allSettled([
        fetchQuotes(),
        fetchBreadth(),
      ]);

      lastQuoteFailed = quoteResult.status === "rejected";
      lastBreadthFailed = breadthResult.status === "rejected";

      if (quoteResult.status === "fulfilled") {
        rows = quoteResult.value.map((quote, index) => ({
          ...rows[index],
          symbol: quoteSymbols[index],
          ...quote,
          history: updateHistory(rows[index]?.history, quote),
        }));
        try {
          localStorage.setItem(marketCacheKey, JSON.stringify(rows));
        } catch {
          // Rendering can continue with the in-memory quotes.
        }
      }

      if (breadthResult.status === "fulfilled") {
        const nextBreadth = breadthResult.value;
        if (nextBreadth.source === "sina" && quoteResult.status === "fulfilled") {
          nextBreadth.timestamp = quoteResult.value[0].timestamp;
        }
        const keepCompleteSnapshot = !nextBreadth.complete
          && breadth?.complete
          && breadth.timestamp.slice(0, 10) === nextBreadth.timestamp.slice(0, 10);
        if (!keepCompleteSnapshot) {
          breadth = nextBreadth;
          try {
            localStorage.setItem(breadthCacheKey, JSON.stringify(breadth));
          } catch {
            // Rendering can continue with the in-memory breadth snapshot.
          }
        }
      }

      paint();
      showStatus(lastQuoteFailed || lastBreadthFailed);
      if (manual) {
        if (!lastQuoteFailed && !lastBreadthFailed) {
          toast("行情和全市场涨跌平已刷新");
        } else if (!lastQuoteFailed) {
          toast("报价已刷新，全市场家数暂时沿用上次");
        } else {
          toast(rows.length
            ? "暂时无法获取新报价，已显示上次有效行情"
            : "行情连接失败，请稍后重试");
        }
      }
      return true;
    } finally {
      refreshing = false;
      button.disabled = false;
    }
  }

  try {
    const bundled = await (await fetch("market.json", { cache: "no-store" })).json();
    if (Array.isArray(bundled)) rows = bundled;
  } catch {
    // A local quote cache can still provide the first render.
  }

  try {
    const cached = JSON.parse(localStorage.getItem(marketCacheKey));
    if (
      cached?.length === 4
      && cached.every((row, index) => (
        Number.isFinite(row.price)
        && Number.isFinite(row.change)
        && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.timestamp)
        && row.timestamp >= (rows[index]?.timestamp || "")
      ))
    ) {
      rows = cached.map((row, index) => ({
        ...rows[index],
        price: row.price,
        change: row.change,
        timestamp: row.timestamp,
        history: Array.isArray(row.history)
          && row.history.length <= 32
          && row.history.every(entry => (
            Array.isArray(entry)
            && /^\d{4}-\d\d-\d\d$/.test(entry[0])
            && Number.isFinite(entry[1])
          ))
          ? row.history
          : rows[index]?.history,
      }));
    }
  } catch {
    // Keep the bundled snapshot.
  }

  paint();
  showStatus(true);
  button.onclick = () => refresh(true);
  await refresh();
  setInterval(() => {
    if (!document.hidden) refresh();
  }, 60000);
  return refresh;
}
