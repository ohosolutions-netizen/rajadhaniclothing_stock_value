"use strict";

const { fetchStockStatement, validateDateRange } = require("../lib/stock-statement");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const fromDate = request.query.fromDate;
  const toDate = request.query.toDate;
  if (!validateDateRange(fromDate, toDate)) {
    response.status(400).json({ error: "Provide a valid fromDate and toDate in yyyy-MM-dd format." });
    return;
  }

  try {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(await fetchStockStatement(fromDate, toDate));
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
};
