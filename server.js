"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fetchStockStatement, validateDateRange } = require("./lib/stock-statement");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function serveFile(requestPath, response) {
  const requested = requestPath === "/" || requestPath === "/app/" ? "/app/index.html" : requestPath;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  response.writeHead(200, { "Content-Type": `${types[path.extname(filePath)] || "application/octet-stream"}; charset=utf-8` });
  fs.createReadStream(filePath).pipe(response);
}

http.createServer(async function (request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/api/stock-statement") {
    const fromDate = url.searchParams.get("fromDate");
    const toDate = url.searchParams.get("toDate");
    if (!validateDateRange(fromDate, toDate)) {
      sendJson(response, 400, { error: "Provide a valid fromDate and toDate in yyyy-MM-dd format." });
      return;
    }
    try {
      sendJson(response, 200, await fetchStockStatement(fromDate, toDate));
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }
  serveFile(url.pathname, response);
}).listen(PORT, "127.0.0.1", function () {
  console.log(`Stock Value Report running at http://127.0.0.1:${PORT}/app/`);
});
