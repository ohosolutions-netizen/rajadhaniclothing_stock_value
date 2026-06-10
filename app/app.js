(function () {
  "use strict";

  const CUSTOM_API_NAME = "get_stock_statement";
  const numberColumns = [
    "Opening_Value",
    "Purchase_Value",
    "Credit_Note_Value",
    "Adjustment_Surplus",
    "Sales_Value",
    "Offer_Sales_Value",
    "Vendor_Credit_Value",
    "Adjustment_Shortage",
    "Net_Movement",
    "Closing_Value"
  ];
  const outflowColumns = [
    "Sales_Value",
    "Offer_Sales_Value",
    "Vendor_Credit_Value",
    "Adjustment_Shortage"
  ];
  const inflowColumns = ["Purchase_Value", "Credit_Note_Value", "Adjustment_Surplus"];

  const elements = {
    form: document.getElementById("filters"),
    fromDate: document.getElementById("from-date"),
    toDate: document.getElementById("to-date"),
    button: document.getElementById("load-button"),
    notice: document.getElementById("notice"),
    body: document.getElementById("statement-body"),
    empty: document.getElementById("empty-state"),
    chart: document.getElementById("chart"),
    rowCount: document.getElementById("row-count"),
    rangeLabel: document.getElementById("range-label"),
    opening: document.getElementById("opening-value"),
    inflow: document.getElementById("total-inflow"),
    outflow: document.getElementById("total-outflow"),
    closing: document.getElementById("closing-value")
  };

  const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  });
  const compactCurrency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1
  });

  function toInputDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setDefaultDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    elements.fromDate.value = toInputDate(firstDay);
    elements.toDate.value = toInputDate(today);
  }

  function asNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeRows(rows) {
    if (!Array.isArray(rows)) throw new Error("The function response did not contain a data array.");
    return rows.map(function (row) {
      const normalized = { Date: String(row.Date ?? "") };
      numberColumns.forEach(function (column) {
        normalized[column] = asNumber(row[column]);
      });
      return normalized;
    });
  }

  function unwrapResponse(response) {
    let value = response;
    for (let depth = 0; depth < 5; depth += 1) {
      if (typeof value === "string") {
        value = JSON.parse(value);
        continue;
      }
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== "object") break;
      if (value.error) throw new Error(typeof value.error === "string" ? value.error : JSON.stringify(value.error));
      if (Array.isArray(value.data)) return value.data;
      if (Object.prototype.hasOwnProperty.call(value, "result")) {
        value = value.result;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(value, "response")) {
        value = value.response;
        continue;
      }
      break;
    }
    throw new Error("Unable to read the Custom API response.");
  }

  function errorMessage(error) {
    if (!error) return "Unable to load the stock statement.";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (error.error) return typeof error.error === "string" ? error.error : JSON.stringify(error.error);
    if (error.response) return typeof error.response === "string" ? error.response : JSON.stringify(error.response);
    try {
      return JSON.stringify(error);
    } catch (ignored) {
      return "Unable to load the stock statement.";
    }
  }

  function invokeStockStatement(fromDate, toDate) {
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (isLocalhost) {
      const params = new URLSearchParams({ fromDate: fromDate, toDate: toDate });
      return fetch(`/api/stock-statement?${params.toString()}`)
        .then(function (response) {
          return response.json().then(function (body) {
            if (!response.ok) throw new Error(body.error || "Unable to load Analytics data.");
            return body;
          });
        });
    }
    if (!window.ZOHO || !ZOHO.CREATOR || !ZOHO.CREATOR.DATA || !ZOHO.CREATOR.DATA.invokeCustomApi) {
      return Promise.reject(new Error("Zoho Creator API is unavailable. Open this widget inside Zoho Creator to load Analytics data."));
    }
    const config = {
      api_name: CUSTOM_API_NAME,
      http_method: "GET",
      query_params: new URLSearchParams({
        fromDate: fromDate,
        toDate: toDate
      }).toString()
    };
    return ZOHO.CREATOR.DATA.invokeCustomApi(config).then(unwrapResponse);
  }

  function showNotice(message) {
    elements.notice.textContent = message;
    elements.notice.hidden = false;
  }

  function clearNotice() {
    elements.notice.hidden = true;
    elements.notice.textContent = "";
  }

  function formatValue(value) {
    return currency.format(asNumber(value));
  }

  function valueClass(value) {
    if (value < 0) return "negative";
    if (value > 0) return "positive";
    return "";
  }

  function renderSummary(rows) {
    if (!rows.length) {
      [elements.opening, elements.inflow, elements.outflow, elements.closing].forEach(function (element) {
        element.textContent = "--";
      });
      return;
    }
    const totalInflow = rows.reduce(function (sum, row) {
      return sum + inflowColumns.reduce(function (subtotal, column) {
        return subtotal + row[column];
      }, 0);
    }, 0);
    const totalOutflow = rows.reduce(function (sum, row) {
      return sum + outflowColumns.reduce(function (subtotal, column) {
        return subtotal + Math.abs(row[column]);
      }, 0);
    }, 0);

    elements.opening.textContent = formatValue(rows[0].Opening_Value);
    elements.inflow.textContent = formatValue(totalInflow);
    elements.outflow.textContent = formatValue(totalOutflow);
    elements.closing.textContent = formatValue(rows[rows.length - 1].Closing_Value);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderTable(rows) {
    if (!rows.length) {
      elements.body.innerHTML = "";
      elements.empty.hidden = false;
      return;
    }

    const sum = function (column) {
      return rows.reduce(function (total, row) { return total + row[column]; }, 0);
    };
    const opening = rows[0].Opening_Value;
    const purchases = sum("Purchase_Value");
    const creditNotes = sum("Credit_Note_Value");
    const surplus = sum("Adjustment_Surplus");
    const sales = sum("Sales_Value") + sum("Offer_Sales_Value");
    const vendorCredits = sum("Vendor_Credit_Value");
    const shortage = sum("Adjustment_Shortage");
    const totalAvailable = opening + purchases + creditNotes + surplus;
    const closing = rows[rows.length - 1].Closing_Value;

    const line = function (label, note, incoming, outgoing, className) {
      return `<div class="statement-line ${className || ""}">
        <div class="movement-label">
          <strong>${escapeHtml(label)}</strong>
          ${note ? `<span>${escapeHtml(note)}</span>` : ""}
        </div>
        <div class="statement-value incoming ${incoming === null ? "empty-value" : ""}">${incoming === null ? "—" : escapeHtml(formatValue(incoming))}</div>
        <div class="statement-value outgoing ${outgoing === null ? "empty-value" : ""}">${outgoing === null ? "—" : escapeHtml(formatValue(outgoing))}</div>
      </div>`;
    };

    elements.body.innerHTML = [
      line("Opening stock value", "Opening balance on the first transaction date", opening, null, "opening-line"),
      line("Purchase value", "Stock received during the selected period", purchases, null),
      line("Adjustment surplus", "Positive stock adjustments", surplus, null),
      line("Credit note value", "Credits added back to stock", creditNotes, null),
      line("Total stock available", "Opening stock + all inflows", totalAvailable, null, "total-line"),
      line("Sales value", "Includes regular and offer sales", null, sales),
      line("Vendor credit value", "Stock value returned to vendors", null, vendorCredits),
      line("Adjustment shortage", "Negative stock adjustments", null, shortage),
      line("Closing stock value", "Final balance after all inflows and outflows", closing, null, "closing-line")
    ].join("");
    elements.empty.hidden = rows.length > 0;
  }

  function renderChart(rows) {
    if (!rows.length) {
      elements.chart.innerHTML = '<div class="chart-empty">No stock movement found for this date range.</div>';
      return;
    }

    const width = 1200;
    const height = 230;
    const padding = { top: 18, right: 24, bottom: 34, left: 78 };
    const values = rows.map(function (row) { return row.Closing_Value; });
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    const spread = max - min || Math.max(Math.abs(max) * 0.1, 1);
    min -= spread * 0.12;
    max += spread * 0.12;
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const x = function (index) {
      return padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
    };
    const y = function (value) {
      return padding.top + ((max - value) / (max - min)) * plotHeight;
    };
    const points = values.map(function (value, index) { return `${x(index)},${y(value)}`; }).join(" ");
    const area = `${padding.left},${padding.top + plotHeight} ${points} ${padding.left + plotWidth},${padding.top + plotHeight}`;
    const grid = [0, 0.5, 1].map(function (ratio) {
      const gridY = padding.top + ratio * plotHeight;
      const labelValue = max - ratio * (max - min);
      return `<line x1="${padding.left}" y1="${gridY}" x2="${padding.left + plotWidth}" y2="${gridY}" stroke="#e4ebe6" />
        <text x="${padding.left - 10}" y="${gridY + 4}" text-anchor="end" fill="#69756e" font-size="11">${escapeHtml(compactCurrency.format(labelValue))}</text>`;
    }).join("");

    elements.chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Closing stock value trend">
      <defs>
        <linearGradient id="stock-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b9b70" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#3b9b70" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      ${grid}
      <polygon points="${area}" fill="url(#stock-area)" />
      <polyline points="${points}" fill="none" stroke="#176b4a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${x(0)}" cy="${y(values[0])}" r="4" fill="#176b4a" />
      <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="4" fill="#176b4a" />
      <text x="${padding.left}" y="${height - 10}" fill="#69756e" font-size="11">${escapeHtml(rows[0].Date)}</text>
      <text x="${padding.left + plotWidth}" y="${height - 10}" text-anchor="end" fill="#69756e" font-size="11">${escapeHtml(rows[rows.length - 1].Date)}</text>
    </svg>`;
  }

  function render(rows, fromDate, toDate) {
    renderSummary(rows);
    renderTable(rows);
    renderChart(rows);
    elements.rowCount.textContent = `${fromDate} to ${toDate} · ${rows.length} transaction ${rows.length === 1 ? "day" : "days"}`;
    elements.rangeLabel.textContent = `${fromDate} to ${toDate}`;
  }

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearNotice();
    if (elements.fromDate.value > elements.toDate.value) {
      showNotice("From date must be on or before To date.");
      return;
    }

    elements.button.disabled = true;
    elements.button.textContent = "Loading...";
    invokeStockStatement(elements.fromDate.value, elements.toDate.value)
      .then(normalizeRows)
      .then(function (rows) {
        render(rows, elements.fromDate.value, elements.toDate.value);
      })
      .catch(function (error) {
        showNotice(errorMessage(error));
        render([], elements.fromDate.value, elements.toDate.value);
      })
      .finally(function () {
        elements.button.disabled = false;
        elements.button.textContent = "Run report";
      });
  });

  setDefaultDates();
  elements.chart.innerHTML = '<div class="chart-empty">Run the report to view the closing stock trend.</div>';
  elements.form.requestSubmit();
})();
