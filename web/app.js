(function () {
  var meta = document.getElementById("meta");
  var empty = document.getElementById("empty");
  var table = document.getElementById("table");
  var body = document.getElementById("rows");

  function money(amount, currency) {
    if (amount === null || amount === undefined || amount === "") return "";
    var n = Number(amount);
    if (!isFinite(n)) return "";
    var text = Math.round(n).toLocaleString("en-US");
    if (!currency || currency === "USD") return "$" + text;
    return text + " " + currency;
  }

  function cell(text) {
    var td = document.createElement("td");
    td.textContent = text;
    return td;
  }

  var sources = [
    "https://raw.githubusercontent.com/accomplish999/premium-domains/main/data/results.json",
    "results.json",
  ];

  function load(index) {
    if (index >= sources.length) {
      meta.textContent = "No results.json yet. The daily run writes it.";
      empty.hidden = false;
      return;
    }
    fetch(sources[index], { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("results.json " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.generatedAt) throw new Error("empty results");
        render(data);
      })
      .catch(function () {
        load(index + 1);
      });
  }

  function render(data) {
    var rows = data.rows || [];
    var when = data.generatedAt;
    var floor = data.threshold ? "$" + Number(data.threshold).toLocaleString("en-US") : "";
    meta.textContent = when + (floor ? "  floor " + floor + " marketplace" : "") + "  " + rows.length + " names";
    if (rows.length === 0) {
      empty.hidden = false;
      return;
    }
    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(cell(row.domain));
      var source = row.source || "";
      if (row.alsoSeenOn && row.alsoSeenOn.length) source += "+" + row.alsoSeenOn.join("+");
      tr.appendChild(cell(source));
      var price = cell(money(row.price, row.currency));
      price.className = "num";
      tr.appendChild(price);
      tr.appendChild(cell(row.auctionEnd || ""));
      var market = cell(money(row.marketplace, "USD"));
      market.className = "num";
      tr.appendChild(market);
      var linkCell = document.createElement("td");
      if (row.link) {
        var a = document.createElement("a");
        a.href = row.link;
        a.textContent = "Open";
        a.rel = "noreferrer";
        linkCell.appendChild(a);
      }
      tr.appendChild(linkCell);
      body.appendChild(tr);
    });
    table.hidden = false;
  }

  load(0);
})();
