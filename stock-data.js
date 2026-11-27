export const STOCK_STORAGE_KEY = "daylog:life:stock:v1";
export const DEFAULT_STOCK_ACCOUNT = "默认账户";
export const STOCK_TYPES = { opening: "补录持仓", buy: "买入", sell: "卖出", dividend: "现金分红" };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_PRICE = 1_000_000;
const MAX_SHARES = 10_000_000;
const MAX_CENTS = 100_000_000_000_000;

export function stockSymbol(input) {
  const value = String(input ?? "").trim().toLowerCase();
  const parts = /^(?:(sh|sz|bj))?(\d{6})(?:\.(sh|sz|bj))?$/.exec(value);
  if (!parts) return "";
  const [, prefix, code, suffix] = parts;
  const exchange = /^[56]/.test(code) ? "sh"
    : /^[013]/.test(code) ? "sz"
    : /^([48]|920)/.test(code) ? "bj" : "";
  if (!exchange || (prefix && prefix !== exchange) || (suffix && suffix !== exchange)) return "";
  return exchange + code;
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function cleanText(value, limit) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

function decimal(value, places, minimum, maximum, message) {
  const number = Number(value);
  const scale = 10 ** places;
  const integer = Math.round(number * scale);
  const amount = integer / scale;
  if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(amount)
      || amount < minimum || amount > maximum || Math.abs(number - amount) > 1e-9) {
    throw new Error(message);
  }
  return amount;
}

function normalizeTrade(value) {
  const id = value?.id;
  const symbol = stockSymbol(value?.symbol);
  const at = timestamp(value?.at);
  const type = value?.type;
  if (typeof id !== "string" || !ID_PATTERN.test(id) || !at || !Object.hasOwn(STOCK_TYPES, type)) {
    throw new Error("请检查股票交易类型和日期");
  }
  if (!symbol) throw new Error("请输入沪深北六位股票或 ETF 代码");
  const dividend = type === "dividend";
  const shares = dividend ? 0 : decimal(value.shares, 0, 1, MAX_SHARES, "请输入正整数股数或份数");
  const price = dividend ? 0 : decimal(value.price, 4, type === "opening" ? 0 : 0.0001, MAX_PRICE, "请输入有效的每股价格，最多四位小数");
  if (!dividend && String(value.price ?? "").trim() === "") throw new Error("请填写每股价格");
  const fee = dividend ? 0 : decimal(value.fee ?? 0, 2, 0, MAX_CENTS / 100, "请输入有效的手续费，最多两位小数");
  const amount = dividend ? decimal(value.amount, 2, 0.01, MAX_CENTS / 100, "请输入实际到账分红金额，最多两位小数") : 0;
  return { id, symbol, type, at, shares, price, fee, amount,
    account: cleanText(value.account, 32) || DEFAULT_STOCK_ACCOUNT,
    name: cleanText(value.name, 40), note: cleanText(value.note, 500),
    createdAt: timestamp(value.createdAt) || at,
  };
}

function normalizeQuote(value) {
  const symbol = stockSymbol(value?.symbol);
  const asOf = timestamp(value?.asOf);
  if (!symbol || !asOf || !["manual", "tencent"].includes(value.source)) throw new Error("估价日期或行情格式无效");
  return { symbol, asOf, source: value.source, name: cleanText(value.name, 40),
    price: decimal(value.price, 4, 0.0001, MAX_PRICE, "请输入有效的每股价格，最多四位小数"),
  };
}

export function stockPositionKey(account, symbol) {
  return JSON.stringify([account, symbol]);
}

function chronology(left, right) {
  return left.at.localeCompare(right.at) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function roundRatio(numerator, denominator) {
  return Number((numerator + denominator / 2n) / denominator);
}

function tradeValue(shares, price) {
  return roundRatio(BigInt(shares) * BigInt(Math.round(price * 10_000)), 100n);
}

function checkedCents(value) {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_CENTS) throw new Error("金额超过账本可记录范围");
  return value;
}

export function calculateStockPositions({ trades, quotes }) {
  const positions = new Map();
  const quoteBySymbol = new Map(quotes.map(quote => [quote.symbol, quote]));
  const chronological = trades.slice().sort(chronology);
  const entries = chronological.map(trade => {
    const key = stockPositionKey(trade.account, trade.symbol);
    const previous = positions.get(key);
    const position = previous || { key, account: trade.account, symbol: trade.symbol, name: "", shares: 0, cost: 0, realized: 0 };
    if (trade.name) position.name = trade.name;
    const context = `${trade.account} · ${trade.symbol.slice(2)}`;
    const gross = checkedCents(tradeValue(trade.shares, trade.price));
    const fee = Math.round(trade.fee * 100);
    let net = gross + fee;
    let realized = null;
    if (trade.type === "buy" || trade.type === "opening") {
      if (previous && trade.type === "opening") throw new Error(`${context} 只能在首笔补录持仓，请调整日期或改为买入`);
      position.shares += trade.shares;
      position.cost = checkedCents(position.cost + net);
    } else if (trade.type === "sell") {
      if (trade.shares > position.shares) throw new Error(`${context} 的卖出数量超过当时持仓（${position.shares} 股/份）`);
      net = gross - fee;
      if (net < 0) throw new Error(`${context} 的卖出手续费超过成交金额`);
      const removed = roundRatio(BigInt(position.cost) * BigInt(trade.shares), BigInt(position.shares));
      position.cost -= removed;
      position.shares -= trade.shares;
      realized = net - removed;
    } else {
      if (!previous) throw new Error(`${context} 请先补录持仓或登记买入，再记录分红`);
      net = Math.round(trade.amount * 100);
      realized = net;
    }
    if (position.shares > MAX_SHARES) throw new Error(`${context} 的持有数量超过可记录范围`);
    position.realized = checkedCents(position.realized + (realized ?? 0));
    positions.set(key, position);
    return { ...trade, net: checkedCents(net), realized };
  });
  return {
    entries: entries.reverse(),
    positions: [...positions.values()].map(position => {
      const quote = quoteBySymbol.get(position.symbol);
      const market = position.shares && quote ? tradeValue(position.shares, quote.price) : null;
      const floating = market === null ? null : market - position.cost;
      return { ...position, name: position.name || quote?.name || "", quote, market, floating,
        average: position.shares ? position.cost / 100 / position.shares : null,
      };
    }),
  };
}

export function normalizeStockBackup(value) {
  if (value === undefined) return { trades: [], quotes: [] };
  if (!Array.isArray(value?.trades) || !Array.isArray(value?.quotes)) throw new Error("股票持仓备份格式无效");
  const trades = value.trades.map(normalizeTrade).sort(chronology);
  const quotes = value.quotes.map(normalizeQuote);
  if (new Set(trades.map(trade => trade.id)).size !== trades.length
      || new Set(quotes.map(quote => quote.symbol)).size !== quotes.length) throw new Error("股票持仓备份含有重复记录");
  return { trades, quotes };
}

export function readStockData() {
  const raw = localStorage.getItem(STOCK_STORAGE_KEY);
  return normalizeStockBackup(raw === null ? undefined : JSON.parse(raw));
}

function write(data) {
  calculateStockPositions(data);
  localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(data));
}

export function saveStockTrade(input) {
  const data = readStockData();
  const previous = data.trades.find(trade => trade.id === input.id);
  if (input.id && !previous) throw new Error("这笔交易已删除，请重新打开持仓页");
  const trade = normalizeTrade({ ...input,
    id: previous?.id || `stock_${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
    createdAt: previous?.createdAt || new Date().toISOString(),
  });
  data.trades = data.trades.filter(item => item.id !== trade.id).concat(trade).sort(chronology);
  write(data);
  return trade;
}

export function deleteStockTrade(id) {
  const data = readStockData();
  data.trades = data.trades.filter(trade => trade.id !== id);
  write(data);
}

function applyQuotes(current, incoming, replaceEqual = false) {
  const quotes = new Map(current.map(quote => [quote.symbol, quote]));
  let changed = 0;
  for (const quote of incoming) {
    const previous = quotes.get(quote.symbol);
    if (!previous || quote.asOf > previous.asOf || (replaceEqual && quote.asOf === previous.asOf
        && JSON.stringify(quote) !== JSON.stringify(previous))) {
      quotes.set(quote.symbol, quote);
      changed++;
    }
  }
  return { quotes: [...quotes.values()], changed };
}

export function saveStockQuotes(incoming) {
  const data = readStockData();
  const { quotes, changed } = applyQuotes(data.quotes, incoming.map(normalizeQuote), true);
  if (changed) write({ ...data, quotes });
  return changed;
}

export function mergeStockBackup(incoming) {
  const current = readStockData();
  const known = new Set(current.trades.map(trade => trade.id));
  const added = incoming.trades.filter(trade => !known.has(trade.id));
  const { quotes, changed } = applyQuotes(current.quotes, incoming.quotes);
  if (added.length || changed) write({ trades: current.trades.concat(added).sort(chronology), quotes });
  return added.length;
}
