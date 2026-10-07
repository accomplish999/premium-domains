(function (root) {
  var RESULT_URLS = [
    "https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json",
    "https://raw.githubusercontent.com/accomplish999/premium-domains/main/web/results.json",
  ];
  var ARCHIVE_URL = "https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/archive.json";
  var HISTORY_INDEX_URL =
    "https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/history/index.json";

  var EMPTY_COPY = "No domains above $25k in today's scan";
  var FILTER_EMPTY_COPY = "No domains match these filters.";
  var LOADING_COPY = "Loading the latest scan.";
  var ERROR_COPY = "Could not load the daily results.";
  var TYPE_ORDER = ["drop", "auction", "buynow", "marketplace", "closeout"];
  var TYPE_LABELS = {
    drop: "Dropping",
    auction: "Auction",
    buynow: "Buy now",
    marketplace: "Marketplace",
    closeout: "Closeout",
  };
  var TLD_ORDER = ["com", "net", "org", "io", "co", "ai", "sh", "ly", "to", "gg", "pro", "app", "dev", "xyz"];
  var SOURCE_NAMES = {
    parkio: "park.io",
    atom: "Atom",
    sedo: "Sedo",
    dynadot: "Dynadot",
    godaddy: "GoDaddy",
    afternic: "Afternic",
    dan: "Dan.com",
    namecheap: "Namecheap",
    dropcatch: "DropCatch",
    sav: "Sav",
    namesilo: "NameSilo",
    namejet: "NameJet",
    snapnames: "SnapNames",
    uniregistry: "Uniregistry",
  };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SORT_KEYS = {
    domain: true,
    marketplace: true,
    price: true,
    source: true,
    type: true,
    end: true,
    status: true,
    seen: true,
    firstSeen: true,
    lastSeen: true,
  };

  function isRow(row) {
    return !!row && typeof row === "object" && typeof row.domain === "string" && row.domain.length > 0;
  }

  function numberOr(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function rowsFrom(body) {
    if (!body || typeof body !== "object") return null;
    if (Array.isArray(body.rows)) return body.rows;
    if (Array.isArray(body.newRows)) return body.newRows;
    return null;
  }

  function extractScan(data) {
    if (Array.isArray(data)) {
      return { generatedAt: null, threshold: 25000, rows: data.filter(isRow), stats: null };
    }
    if (!data || typeof data !== "object") return null;

    var body = Object.prototype.hasOwnProperty.call(data, "result") ? data.result : data;
    if (Array.isArray(body)) {
      return {
        generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
        threshold: numberOr(data.threshold, 25000),
        rows: body.filter(isRow),
        stats: readStats(data.stats),
      };
    }

    var rows = rowsFrom(body);
    if (!rows) rows = rowsFrom(data);
    if (!rows) rows = [];

    var generatedAt = null;
    if (body && typeof body.generatedAt === "string" && body.generatedAt) generatedAt = body.generatedAt;
    else if (typeof data.generatedAt === "string" && data.generatedAt) generatedAt = data.generatedAt;

    var threshold = 25000;
    if (body && body.threshold !== undefined && body.threshold !== null) threshold = numberOr(body.threshold, 25000);
    else if (data.threshold !== undefined && data.threshold !== null) threshold = numberOr(data.threshold, 25000);

    var statsSource = body && body.stats && typeof body.stats === "object" ? body.stats : null;
    if (!statsSource && data.stats && typeof data.stats === "object") statsSource = data.stats;

    return {
      generatedAt: generatedAt,
      threshold: threshold,
      rows: rows.filter(isRow),
      stats: readStats(statsSource),
    };
  }

  function statNumber(stats, key) {
    if (!stats || stats[key] === null || stats[key] === undefined || stats[key] === "") return null;
    var n = Number(stats[key]);
    return isFinite(n) ? n : null;
  }

  function readStats(stats) {
    if (!stats || typeof stats !== "object") return null;
    return {
      fetched: statNumber(stats, "fetched"),
      kept: statNumber(stats, "kept"),
      valued: statNumber(stats, "valued"),
      above: statNumber(stats, "above"),
      highestMarketplace: statNumber(stats, "highestMarketplace"),
      truncated: stats.truncated === true,
    };
  }

  function dateOnly(value) {
    if (value === null || value === undefined || value === "") return "";
    var text = String(value);
    var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    var date = new Date(text);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function normalizeType(value) {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    var compact = String(value)
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (compact === "drop" || compact === "dropping") return "drop";
    if (compact === "auction") return "auction";
    if (compact === "buynow" || compact === "buy") return "buynow";
    if (compact === "marketplace") return "marketplace";
    if (compact === "closeout") return "closeout";
    return compact;
  }

  function typeLabel(key) {
    if (!key) return "";
    return TYPE_LABELS[key] || key;
  }

  function tldOf(domain) {
    var parts = String(domain || "")
      .toLowerCase()
      .split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  }

  function sourceList(row) {
    var list = [];
    if (row.source) list.push(String(row.source));
    if (Array.isArray(row.alsoSeenOn)) {
      for (var i = 0; i < row.alsoSeenOn.length; i++) {
        if (typeof row.alsoSeenOn[i] === "string" && row.alsoSeenOn[i] && list.indexOf(row.alsoSeenOn[i]) === -1) {
          list.push(row.alsoSeenOn[i]);
        }
      }
    }
    return list;
  }

  function displaySource(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var key = raw.toLowerCase().replace(/[\s._-]+/g, "");
    return SOURCE_NAMES[key] || raw;
  }

  function sourceLabel(row) {
    var list = sourceList(row);
    if (!list.length) return "";
    var names = [];
    for (var i = 0; i < list.length; i++) names.push(displaySource(list[i]));
    if (names.length === 1) return names[0];
    return names[0] + " + " + names.slice(1).join(" + ");
  }

  function normalizeRow(row, options) {
    var opts = options || {};
    var day = opts.fallbackDay || "";
    var active = true;
    if (typeof row.active === "boolean") active = row.active;
    var price = row.price === null || row.price === undefined || row.price === "" ? null : Number(row.price);
    if (price !== null && !isFinite(price)) price = null;
    var marketplace = Number(row.marketplace);
    var typeKey = normalizeType(row.listingType);
    return {
      domain: row.domain,
      marketplace: isFinite(marketplace) ? marketplace : null,
      price: price,
      currency: row.currency || null,
      source: row.source ? String(row.source) : "",
      sources: sourceList(row),
      sourceLabel: sourceLabel(row),
      typeKey: typeKey,
      typeLabel: typeLabel(typeKey),
      endDate: dateOnly(row.auctionEnd),
      link: row.link || "",
      active: active,
      firstSeen: dateOnly(row.firstSeen) || day,
      lastSeen: dateOnly(row.lastSeen) || day,
      tld: tldOf(row.domain),
    };
  }

  function readDates(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.dates)) return [];
    var dates = [];
    for (var i = 0; i < data.dates.length; i++) {
      if (typeof data.dates[i] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dates[i])) dates.push(data.dates[i]);
    }
    return dates;
  }

  function buildCatalog(resultsScan, archiveScan, dates) {
    var today = resultsScan ? dateOnly(resultsScan.generatedAt) : "";
    var scan = null;
    var fromArchive = false;
    if (archiveScan && Array.isArray(archiveScan.rows)) {
      scan = archiveScan;
      fromArchive = true;
    } else if (resultsScan && Array.isArray(resultsScan.rows)) {
      scan = resultsScan;
    } else {
      return null;
    }
    var day = dateOnly(scan.generatedAt) || today;
    var rows = scan.rows.map(function (row) {
      return normalizeRow(row, { fallbackDay: day });
    });
    if (!fromArchive) {
      rows = rows.map(function (row) {
        row.active = true;
        if (!row.firstSeen) row.firstSeen = day;
        if (!row.lastSeen) row.lastSeen = day;
        return row;
      });
    }
    return {
      fromArchive: fromArchive,
      generatedAt: (resultsScan && resultsScan.generatedAt) || scan.generatedAt || null,
      threshold: scan.threshold || (resultsScan && resultsScan.threshold) || 25000,
      stats: resultsScan && resultsScan.stats ? resultsScan.stats : null,
      today: today,
      dates: dates || [],
      rows: rows,
    };
  }

  function rowsForDay(scan, catalogRows, date) {
    var known = {};
    for (var i = 0; i < catalogRows.length; i++) known[catalogRows[i].domain] = catalogRows[i];
    return scan.rows.map(function (raw) {
      var row = normalizeRow(raw, { fallbackDay: date });
      var prior = known[raw.domain];
      if (prior) {
        row.active = prior.active;
        row.firstSeen = prior.firstSeen || row.firstSeen;
        row.lastSeen = prior.lastSeen || date;
      } else {
        row.firstSeen = date;
        row.lastSeen = date;
        row.active = true;
      }
      return row;
    });
  }

  function defaultFilters() {
    return {
      q: "",
      sources: [],
      tlds: [],
      min: null,
      status: "all",
      types: [],
      date: "",
      sort: "marketplace",
      dir: "desc",
    };
  }

  function splitList(value) {
    if (!value) return [];
    var parts = String(value).split(",");
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var item = parts[i].trim();
      if (item && out.indexOf(item) === -1) out.push(item);
    }
    return out;
  }

  function parseFilters(search) {
    var params = new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search);
    var filters = defaultFilters();
    filters.q = (params.get("q") || "").trim();
    filters.sources = splitList(params.get("source"));
    filters.tlds = splitList(params.get("tld")).map(function (tld) {
      return tld.replace(/^\./, "").toLowerCase();
    });
    var min = params.get("min");
    if (min !== null && min !== "" && isFinite(Number(min))) filters.min = Number(min);
    var status = params.get("status");
    if (status === "live" || status === "past" || status === "all") filters.status = status;
    filters.types = splitList(params.get("type")).map(normalizeType).filter(Boolean);
    var date = params.get("date") || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) filters.date = date;
    var sort = params.get("sort") || "";
    if (SORT_KEYS[sort]) filters.sort = sort;
    var dir = params.get("dir");
    if (dir === "asc" || dir === "desc") filters.dir = dir;
    return filters;
  }

  function serializeFilters(filters) {
    var params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.sources.length) params.set("source", filters.sources.join(","));
    if (filters.tlds.length) params.set("tld", filters.tlds.join(","));
    if (filters.min !== null && filters.min !== undefined && filters.min !== "") params.set("min", String(filters.min));
    if (filters.status && filters.status !== "all") params.set("status", filters.status);
    if (filters.types.length) params.set("type", filters.types.join(","));
    if (filters.date) params.set("date", filters.date);
    if (filters.sort !== "marketplace") params.set("sort", filters.sort);
    if (filters.dir !== "desc") params.set("dir", filters.dir);
    return params.toString();
  }

  function includes(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
    return false;
  }

  function applyFilters(rows, filters) {
    var query = (filters.q || "").trim().toLowerCase();
    return rows.filter(function (row) {
      if (query && String(row.domain).toLowerCase().indexOf(query) === -1) return false;
      if (filters.sources.length) {
        var sourceHit = false;
        for (var i = 0; i < row.sources.length; i++) {
          if (includes(filters.sources, row.sources[i])) sourceHit = true;
        }
        if (!sourceHit) return false;
      }
      if (filters.tlds.length && !includes(filters.tlds, row.tld)) return false;
      if (filters.min !== null && filters.min !== undefined && !(Number(row.marketplace) >= filters.min)) return false;
      if (filters.status === "live" && !row.active) return false;
      if (filters.status === "past" && row.active) return false;
      if (filters.types.length && !includes(filters.types, row.typeKey)) return false;
      return true;
    });
  }

  function sortValue(row, key) {
    if (key === "domain") return row.domain || "";
    if (key === "marketplace") return row.marketplace;
    if (key === "price") return row.price;
    if (key === "source") return row.sourceLabel || row.source || "";
    if (key === "type") return row.typeKey ? row.typeLabel : "";
    if (key === "end") return row.endDate || "";
    if (key === "status") return row.active ? "live" : "past";
    if (key === "firstSeen") return row.firstSeen || "";
    if (key === "lastSeen") return row.lastSeen || "";
    if (key === "seen") {
      if (!row.firstSeen && !row.lastSeen) return "";
      return (row.lastSeen || "0000-00-00") + " " + (row.firstSeen || "0000-00-00");
    }
    return row.marketplace;
  }

  function sortRows(rows, key, dir) {
    var sortKey = SORT_KEYS[key] ? key : "marketplace";
    var sign = dir === "asc" ? 1 : -1;
    return rows.slice().sort(function (a, b) {
      var av = sortValue(a, sortKey);
      var bv = sortValue(b, sortKey);
      var aMissing = av === null || av === undefined || av === "";
      var bMissing = bv === null || bv === undefined || bv === "";
      if (aMissing || bMissing) {
        if (aMissing && bMissing) return String(a.domain).localeCompare(String(b.domain));
        return aMissing ? 1 : -1;
      }
      var cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (cmp === 0) return String(a.domain).localeCompare(String(b.domain));
      return cmp * sign;
    });
  }

  function chooseScan(items) {
    var ok = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].scan) ok.push(items[i]);
    }
    if (!ok.length) return null;
    ok.sort(function (a, b) {
      var aRows = a.scan.rows.length > 0;
      var bRows = b.scan.rows.length > 0;
      if (aRows !== bRows) return aRows ? -1 : 1;
      var at = a.scan.generatedAt || "";
      var bt = b.scan.generatedAt || "";
      if (at !== bt) return at < bt ? 1 : -1;
      return a.rank - b.rank;
    });
    return ok[0].scan;
  }

  function formatMoney(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return "";
    var n = Number(amount);
    if (!isFinite(n)) return "";
    var text = Math.round(n).toLocaleString("en-US");
    if (!currency || currency === "USD") return "$" + text;
    return text + " " + currency;
  }

  function parseDay(value) {
    var day = dateOnly(value);
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return null;
    var month = Number(match[2]);
    var date = Number(match[3]);
    if (month < 1 || month > 12 || date < 1 || date > 31) return null;
    return { year: match[1], month: month, day: date, iso: day };
  }

  function formatDay(value, withYear) {
    var parts = parseDay(value);
    if (!parts) return "";
    var text = MONTHS[parts.month - 1] + " " + parts.day;
    if (withYear) text += ", " + parts.year;
    return text;
  }

  function formatUpdated(generatedAt) {
    var text = formatDay(generatedAt, true);
    if (!text) return "Not updated yet";
    return "Updated " + text;
  }

  function formatSeen(first, last) {
    var start = parseDay(first);
    var end = parseDay(last);
    if (!start && !end) return "";
    if (!start) return formatDay(end.iso, false);
    if (!end) return formatDay(start.iso, false);
    if (start.iso === end.iso) return formatDay(start.iso, false);
    var withYear = start.year !== end.year;
    return formatDay(start.iso, withYear) + " to " + formatDay(end.iso, withYear);
  }

  function formatCount(n) {
    return n === 1 ? "1 domain" : n + " domains";
  }

  function formatResultCount(shown, total) {
    if (shown === total) return formatCount(total);
    return shown.toLocaleString("en-US") + " of " + formatCount(total);
  }

  function formatFloor(threshold) {
    var n = Number(threshold);
    if (!isFinite(n)) return "$25k";
    if (n >= 1000 && n % 1000 === 0) return "$" + n / 1000 + "k";
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function formatSummary(stats, rowCount, threshold) {
    var above = stats && stats.above !== null && stats.above !== undefined ? stats.above : rowCount;
    var floor = formatFloor(threshold);
    if (stats && stats.valued !== null && stats.valued !== undefined) {
      var valuedLabel = stats.valued.toLocaleString("en-US") + " valued";
      return valuedLabel + " · " + above.toLocaleString("en-US") + " above " + floor;
    }
    return formatCount(rowCount);
  }

  function formatEnd(value) {
    return dateOnly(value);
  }

  // Short display date for the Ends column and the phone line: "Oct 12".
  // The year shows only when it is not the current one.
  function formatEndShort(value, now) {
    var parts = parseDay(value);
    if (!parts) return "";
    var year = String((now || new Date()).getFullYear());
    return formatDay(parts.iso, parts.year !== year);
  }

  // Action word for the phone row link, by listing type.
  function actionLabel(row) {
    if (!row.active) return "View";
    if (row.typeKey === "auction" || row.typeKey === "drop") return "Bid";
    return "Buy";
  }

  // Line 2 on phones: ask (or current bid on an auction), marketplace, end
  // date, past. Blank parts are left
  // out, so a row never shows a lone dash.
  function metaParts(row, now) {
    var parts = [];
    var ask = formatMoney(row.price, row.currency);
    if (ask) parts.push((row.typeKey === "auction" ? "Bid " : "Ask ") + ask);
    if (row.sourceLabel) parts.push(row.sourceLabel);
    var end = formatEndShort(row.endDate, now);
    if (end) parts.push((row.typeKey === "drop" ? "Drops " : "Ends ") + end);
    if (!row.active) parts.push("Past");
    return parts;
  }

  function listingUrl(link) {
    if (typeof link !== "string" || !link) return "";
    try {
      var url = new URL(link);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (err) {
      return "";
    }
    return "";
  }

  function uniqueSorted(values, preferred) {
    var seen = {};
    var list = [];
    for (var i = 0; i < values.length; i++) {
      if (!values[i] || seen[values[i]]) continue;
      seen[values[i]] = true;
      list.push(values[i]);
    }
    list.sort(function (a, b) {
      var ai = preferred ? preferred.indexOf(a) : -1;
      var bi = preferred ? preferred.indexOf(b) : -1;
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return String(a).localeCompare(String(b));
    });
    return list;
  }

  function collectSources(rows) {
    var values = [];
    for (var i = 0; i < rows.length; i++) values = values.concat(rows[i].sources);
    return uniqueSorted(values, null);
  }

  function collectTlds(rows) {
    var values = [];
    for (var i = 0; i < rows.length; i++) if (rows[i].tld) values.push(rows[i].tld);
    return uniqueSorted(values, TLD_ORDER);
  }

  function collectTypes(rows) {
    var values = [];
    for (var i = 0; i < rows.length; i++) if (rows[i].typeKey) values.push(rows[i].typeKey);
    var present = uniqueSorted(values, TYPE_ORDER);
    var base = TYPE_ORDER.slice(0, 3);
    for (var j = 0; j < present.length; j++) {
      if (base.indexOf(present[j]) === -1) base.push(present[j]);
    }
    return base;
  }

  function historyUrl(date) {
    return "https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/history/" + date + ".json";
  }

  function fetchJson(url, fetcher) {
    return fetcher(url, { cache: "no-store" }).then(
      function (response) {
        if (!response || !response.ok) return null;
        return response.json().then(
          function (data) {
            return data;
          },
          function () {
            return null;
          },
        );
      },
      function () {
        return null;
      },
    );
  }

  function loadCatalog(fetchImpl) {
    var fetcher = fetchImpl || root.fetch;
    return Promise.all([
      Promise.all(
        RESULT_URLS.map(function (url, index) {
          return fetchJson(url, fetcher).then(function (data) {
            var scan = data ? extractScan(data) : null;
            return scan ? { scan: scan, rank: index } : null;
          });
        }),
      ).then(chooseScan),
      fetchJson(ARCHIVE_URL, fetcher).then(function (data) {
        return data ? extractScan(data) : null;
      }),
      fetchJson(HISTORY_INDEX_URL, fetcher).then(readDates),
    ]).then(function (parts) {
      var catalog = buildCatalog(parts[0], parts[1], parts[2]);
      if (!catalog) throw new Error(ERROR_COPY);
      return catalog;
    });
  }

  function cell(document, text, className) {
    var td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text === null || text === undefined ? "" : text;
    return td;
  }

  function show(el, on) {
    if (!el) return;
    el.hidden = !on;
  }

  var state = {
    catalog: null,
    filters: null,
    cache: {},
    snapshotError: "",
    requestId: 0,
    bound: false,
  };

  function viewRows() {
    var date = state.filters.date;
    if (date) {
      if (state.snapshotError === date) return [];
      if (state.cache[date]) return state.cache[date].rows;
      return null;
    }
    return state.catalog.rows;
  }

  function viewGeneratedAt() {
    var date = state.filters.date;
    if (date && state.cache[date] && state.cache[date].generatedAt) return state.cache[date].generatedAt;
    return state.catalog.generatedAt;
  }

  function ensureSnapshot() {
    var date = state.filters.date;
    if (!date) {
      state.snapshotError = "";
      return Promise.resolve();
    }
    if (state.cache[date]) {
      state.snapshotError = "";
      return Promise.resolve();
    }
    var id = ++state.requestId;
    return fetchJson(historyUrl(date), root.fetch).then(function (data) {
      if (id !== state.requestId || state.filters.date !== date) return;
      var scan = data ? extractScan(data) : null;
      if (!scan) {
        state.snapshotError = date;
        return;
      }
      state.snapshotError = "";
      state.cache[date] = {
        generatedAt: scan.generatedAt,
        stats: scan.stats,
        threshold: scan.threshold,
        rows: rowsForDay(scan, state.catalog.rows, date),
      };
    });
  }

  function writeUrl() {
    if (!root.history || !root.location) return;
    var query = serializeFilters(state.filters);
    var next = root.location.pathname + (query ? "?" + query : "") + root.location.hash;
    var current = root.location.pathname + root.location.search + root.location.hash;
    if (next !== current) root.history.replaceState(null, "", next);
  }

  function filtersActive(filters) {
    return !!(
      filters.q ||
      (filters.sources && filters.sources.length) ||
      (filters.tlds && filters.tlds.length) ||
      (filters.types && filters.types.length) ||
      filters.date ||
      (filters.min !== null && filters.min !== undefined && filters.min !== "") ||
      (filters.status && filters.status !== "all")
    );
  }

  function syncControls(document) {
    var q = document.getElementById("q");
    var min = document.getElementById("min");
    if (q && q.value !== state.filters.q) q.value = state.filters.q;
    if (min) {
      var minText = state.filters.min === null || state.filters.min === undefined ? "" : String(state.filters.min);
      if (min.value !== minText) min.value = minText;
    }
  }

  function paintSelect(select, items, selected, blank) {
    if (!select) return;
    var optionKey =
      blank +
      "\n" +
      items
        .map(function (item) {
          return item.value + "\t" + item.label;
        })
        .join("\n");
    if (select.getAttribute("data-options") !== optionKey) {
      select.setAttribute("data-options", optionKey);
      select.textContent = "";
      var blankOption = document.createElement("option");
      blankOption.value = "";
      blankOption.textContent = blank;
      select.appendChild(blankOption);
      for (var i = 0; i < items.length; i++) {
        var option = document.createElement("option");
        option.value = items[i].value;
        option.textContent = items[i].label;
        select.appendChild(option);
      }
    }
    var next = selected || "";
    if (select.value !== next) select.value = next;
  }

  function withSelected(items, selected, labelFor) {
    if (!selected) return items;
    for (var i = 0; i < items.length; i++) if (items[i].value === selected) return items;
    return [{ value: selected, label: labelFor(selected) }].concat(items);
  }

  function paintOptions(document, rows) {
    var sources = collectSources(rows).map(function (source) {
      return { value: source, label: displaySource(source) };
    });
    sources.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    var sourceSelected = state.filters.sources.join(",");
    paintSelect(
      document.getElementById("f-source"),
      withSelected(sources, sourceSelected, function (value) {
        return splitList(value).map(displaySource).join(", ");
      }),
      sourceSelected,
      "All sources",
    );

    var tlds = collectTlds(rows).map(function (tld) {
      return { value: tld, label: "." + tld };
    });
    var tldSelected = state.filters.tlds.join(",");
    paintSelect(
      document.getElementById("f-tld"),
      withSelected(tlds, tldSelected, function (value) {
        return splitList(value)
          .map(function (tld) {
            return "." + tld.replace(/^\./, "");
          })
          .join(", ");
      }),
      tldSelected,
      "All TLDs",
    );

    var types = collectTypes(rows).map(function (type) {
      return { value: type, label: typeLabel(type) };
    });
    var typeSelected = state.filters.types.join(",");
    paintSelect(
      document.getElementById("f-type"),
      withSelected(types, typeSelected, function (value) {
        return splitList(value)
          .map(function (type) {
            return typeLabel(normalizeType(type));
          })
          .join(", ");
      }),
      typeSelected,
      "All types",
    );

    var dates = state.catalog.dates.slice();
    if (state.filters.date && dates.indexOf(state.filters.date) === -1) dates.unshift(state.filters.date);
    paintSelect(
      document.getElementById("date"),
      dates.map(function (date) {
        return { value: date, label: formatDay(date, true) || date };
      }),
      state.filters.date,
      "All time",
    );

    var status = document.getElementById("f-status");
    if (status && status.value !== state.filters.status) status.value = state.filters.status;
  }

  function paintSort(document) {
    var headers = document.querySelectorAll(".ps-sort");
    for (var i = 0; i < headers.length; i++) {
      var key = headers[i].getAttribute("data-sort");
      var th = headers[i].parentNode;
      var active = state.filters.sort;
      if (key === "seen" && (active === "firstSeen" || active === "lastSeen")) active = "seen";
      if (key === active) {
        th.setAttribute("aria-sort", state.filters.dir === "asc" ? "ascending" : "descending");
      } else {
        th.setAttribute("aria-sort", "none");
      }
    }
  }

  function render(document) {
    if (!state.catalog) return;
    var panel = document.getElementById("panel");
    var status = document.getElementById("status");
    var resultCount = document.getElementById("result-count");
    var empty = document.getElementById("empty");
    var nomatch = document.getElementById("nomatch");
    var table = document.getElementById("table");
    var body = document.getElementById("rows");
    var filters = document.getElementById("filters");
    var reset = document.getElementById("reset");
    var rows = viewRows();

    panel.setAttribute("aria-busy", rows === null ? "true" : "false");
    show(filters, true);
    show(reset, filtersActive(state.filters));
    syncControls(document);
    writeUrl();
    paintOptions(document, rows && rows.length ? rows : state.catalog.rows);

    if (state.filters.date && state.snapshotError === state.filters.date) {
      status.textContent =
        "Could not load the " + (formatDay(state.filters.date, true) || state.filters.date) + " snapshot.";
      if (resultCount) resultCount.textContent = "0";
      show(empty, false);
      show(nomatch, true);
      nomatch.textContent = "That day's snapshot did not load.";
      show(table, false);
      return;
    }

    if (rows === null) {
      status.textContent = "Loading " + (formatDay(state.filters.date, true) || state.filters.date) + ".";
      if (resultCount) resultCount.textContent = "Loading";
      show(empty, false);
      show(nomatch, false);
      show(table, false);
      return;
    }

    paintSort(document);
    status.textContent = formatUpdated(viewGeneratedAt()) + " · " + viewSummary(rows);

    var filtered = sortRows(applyFilters(rows, state.filters), state.filters.sort, state.filters.dir);
    if (resultCount) {
      resultCount.textContent =
        filtered.length === rows.length ? String(rows.length) : filtered.length + " of " + rows.length;
      resultCount.setAttribute("aria-label", formatResultCount(filtered.length, rows.length));
    }

    if (!rows.length) {
      show(empty, true);
      empty.textContent = state.filters.date
        ? "No domains above $25k on " + (formatDay(state.filters.date, true) || state.filters.date) + "."
        : EMPTY_COPY;
      show(nomatch, false);
      show(table, false);
      return;
    }

    if (!filtered.length) {
      show(empty, false);
      show(nomatch, true);
      nomatch.textContent = FILTER_EMPTY_COPY;
      show(table, false);
      return;
    }

    show(empty, false);
    show(nomatch, false);
    body.textContent = "";
    filtered.forEach(function (row) {
      var tr = document.createElement("tr");
      var head = document.createElement("th");
      head.scope = "row";
      var href = listingUrl(row.link);
      if (href) {
        var link = document.createElement("a");
        link.className = "ps-link";
        link.href = href;
        link.rel = "noopener noreferrer";
        link.target = "_blank";
        link.textContent = row.domain;
        var note = document.createElement("span");
        note.className = "sr-only";
        note.textContent = " (opens in a new tab)";
        link.appendChild(note);
        head.appendChild(link);
      } else {
        head.textContent = row.domain;
      }
      tr.appendChild(head);
      tr.appendChild(cell(document, formatMoney(row.marketplace, "USD"), "ps-num ps-val"));
      tr.appendChild(cell(document, formatMoney(row.price, row.currency), "ps-num"));
      // One marketplace name per line, so a name seen on two feeds stacks
      // instead of breaking at the plus sign.
      var src = cell(document, "", "ps-src");
      for (var n = 0; n < row.sources.length; n++) {
        var name = document.createElement("span");
        name.textContent = displaySource(row.sources[n]);
        src.appendChild(name);
      }
      tr.appendChild(src);
      tr.appendChild(cell(document, row.typeLabel));
      tr.appendChild(cell(document, formatEndShort(row.endDate), "ps-date"));
      tr.appendChild(cell(document, row.active ? "Live" : "Past"));
      tr.appendChild(cell(document, formatSeen(row.firstSeen, row.lastSeen), "ps-date"));

      // Phone only: the second line and the listing link. Hidden on wider
      // screens, where the columns above carry the same values.
      var meta = document.createElement("td");
      meta.className = "ps-meta";
      var parts = metaParts(row);
      for (var m = 0; m < parts.length; m++) {
        var part = document.createElement("span");
        part.textContent = parts[m];
        meta.appendChild(part);
      }
      tr.appendChild(meta);
      var act = document.createElement("td");
      act.className = "ps-act";
      if (href) {
        var buy = document.createElement("a");
        buy.className = "ps-link ps-buy";
        buy.href = href;
        buy.rel = "noopener noreferrer";
        buy.target = "_blank";
        var word = actionLabel(row);
        buy.textContent = word;
        buy.setAttribute(
          "aria-label",
          word + " " + row.domain + (row.sourceLabel ? " on " + row.sourceLabel : "") + " (opens in a new tab)",
        );
        act.appendChild(buy);
      }
      tr.appendChild(act);
      body.appendChild(tr);
    });
    show(table, true);
  }

  function viewSummary(rows) {
    if (state.filters.date && state.cache[state.filters.date]) {
      var snap = state.cache[state.filters.date];
      return formatSummary(snap.stats || null, rows.length, snap.threshold || state.catalog.threshold);
    }
    return formatSummary(state.catalog.stats, rows.length, state.catalog.threshold);
  }

  function bindList(document, id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function () {
      state.filters[key] = el.value ? splitList(el.value) : [];
      render(document);
    });
  }

  function bind(document) {
    if (state.bound) return;
    state.bound = true;
    var form = document.getElementById("filters");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
      });
    }
    var q = document.getElementById("q");
    if (q) {
      q.addEventListener("input", function () {
        state.filters.q = q.value.trim();
        render(document);
      });
    }
    var min = document.getElementById("min");
    if (min) {
      min.addEventListener("input", function () {
        var text = min.value.trim();
        state.filters.min = text === "" || !isFinite(Number(text)) ? null : Number(text);
        render(document);
      });
    }
    var date = document.getElementById("date");
    if (date) {
      date.addEventListener("change", function () {
        state.filters.date = date.value;
        ensureSnapshot().then(function () {
          render(document);
        });
      });
    }
    var statusSelect = document.getElementById("f-status");
    if (statusSelect) {
      statusSelect.addEventListener("change", function () {
        state.filters.status = statusSelect.value || "all";
        render(document);
      });
    }
    bindList(document, "f-source", "sources");
    bindList(document, "f-tld", "tlds");
    bindList(document, "f-type", "types");
    var reset = document.getElementById("reset");
    if (reset) {
      reset.addEventListener("click", function () {
        var sort = state.filters.sort;
        var dir = state.filters.dir;
        state.filters = defaultFilters();
        state.filters.sort = sort;
        state.filters.dir = dir;
        state.snapshotError = "";
        render(document);
      });
    }
    var sorts = document.querySelectorAll(".ps-sort");
    for (var s = 0; s < sorts.length; s++) {
      sorts[s].addEventListener("click", function (event) {
        var key = event.currentTarget.getAttribute("data-sort");
        if (state.filters.sort === key) {
          state.filters.dir = state.filters.dir === "asc" ? "desc" : "asc";
        } else {
          state.filters.sort = key;
          state.filters.dir =
            key === "domain" || key === "source" || key === "type" || key === "status" ? "asc" : "desc";
        }
        render(document);
      });
    }
    if (root.addEventListener) {
      root.addEventListener("popstate", function () {
        state.filters = parseFilters(root.location.search || "");
        ensureSnapshot().then(function () {
          render(document);
        });
      });
    }
  }

  function fail(document) {
    var panel = document.getElementById("panel");
    var status = document.getElementById("status");
    var empty = document.getElementById("empty");
    var nomatch = document.getElementById("nomatch");
    var table = document.getElementById("table");
    var filters = document.getElementById("filters");
    if (panel) panel.setAttribute("aria-busy", "false");
    if (status) status.textContent = ERROR_COPY;
    show(empty, false);
    show(nomatch, false);
    show(table, false);
    show(filters, false);
  }

  function boot(document) {
    var status = document.getElementById("status");
    if (!status) return;
    state.filters = parseFilters((root.location && root.location.search) || "");
    bind(document);
    status.textContent = LOADING_COPY;
    loadCatalog()
      .then(function (catalog) {
        state.catalog = catalog;
        return ensureSnapshot();
      })
      .then(function () {
        render(document);
      })
      .catch(function () {
        fail(document);
      });
  }

  var api = {
    RESULT_URLS: RESULT_URLS,
    ARCHIVE_URL: ARCHIVE_URL,
    HISTORY_INDEX_URL: HISTORY_INDEX_URL,
    EMPTY_COPY: EMPTY_COPY,
    ERROR_COPY: ERROR_COPY,
    extractScan: extractScan,
    sortRows: sortRows,
    chooseScan: chooseScan,
    formatMoney: formatMoney,
    formatUpdated: formatUpdated,
    formatCount: formatCount,
    formatSummary: formatSummary,
    formatResultCount: formatResultCount,
    formatEnd: formatEnd,
    formatEndShort: formatEndShort,
    actionLabel: actionLabel,
    metaParts: metaParts,
    formatSeen: formatSeen,
    formatDay: formatDay,
    displaySource: displaySource,
    listingUrl: listingUrl,
    sourceLabel: sourceLabel,
    loadCatalog: loadCatalog,
    normalizeRow: normalizeRow,
    normalizeType: normalizeType,
    typeLabel: typeLabel,
    buildCatalog: buildCatalog,
    rowsForDay: rowsForDay,
    readDates: readDates,
    applyFilters: applyFilters,
    parseFilters: parseFilters,
    serializeFilters: serializeFilters,
    defaultFilters: defaultFilters,
    historyUrl: historyUrl,
  };

  root.PremiumDomains = api;

  if (!root.document || !root.document.getElementById) return;
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", function () {
      boot(root.document);
    });
  } else {
    boot(root.document);
  }
})(typeof window !== "undefined" ? window : globalThis);
