"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;
const ANALYTICS_ORIGIN = "https://analyticsapi.zoho.in";
const WORKSPACE_ID = "525719000000004002";
const VIEW_ID = "525719000000291010";
const BULK_VIEW_URL = `${ANALYTICS_ORIGIN}/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/views/${VIEW_ID}/data`;
const ORG_ID = "60066631932";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function validDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getAccessToken() {
  if (process.env.ZOHO_ANALYTICS_ACCESS_TOKEN) {
    return process.env.ZOHO_ANALYTICS_ACCESS_TOKEN;
  }

  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Local server credentials are missing. Set ZOHO_ANALYTICS_ACCESS_TOKEN, or ZOHO_REFRESH_TOKEN with ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://accounts.zoho.in/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error("Zoho OAuth token refresh failed.");
  }
  return result.access_token;
}

async function fetchStockStatement(fromDate, toDate) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    "ZANALYTICS-ORGID": ORG_ID
  };
  const config = JSON.stringify({
    responseFormat: "json",
    criteria: `("Date" >= '${fromDate}' AND "Date" <= '${toDate}')`
  });
  const url = new URL(BULK_VIEW_URL);
  url.searchParams.set("CONFIG", config);

  const createResponse = await fetch(url, { headers });
  const createResult = await createResponse.json();
  if (!createResponse.ok || !createResult.data || !createResult.data.jobId) {
    console.error("Zoho Analytics export creation failed:", createResponse.status, JSON.stringify(createResult));
    throw new Error(createResult.data?.errorMessage || createResult.summary || "Unable to create the Analytics export job.");
  }

  const jobId = createResult.data.jobId;
  const jobUrl = `${ANALYTICS_ORIGIN}/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/exportjobs/${jobId}`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt > 0) await new Promise(function (resolve) { setTimeout(resolve, 1000); });
    const statusResponse = await fetch(jobUrl, { headers });
    const statusResult = await statusResponse.json();
    if (!statusResponse.ok || !statusResult.data) {
      throw new Error(statusResult.data?.errorMessage || statusResult.summary || "Unable to check the Analytics export job.");
    }
    if (String(statusResult.data.jobCode) === "1003" || String(statusResult.data.jobCode) === "1005") {
      throw new Error(statusResult.data.jobStatus || "The Analytics export job failed.");
    }
    if (String(statusResult.data.jobCode) === "1004") {
      const downloadResponse = await fetch(`${jobUrl}/data`, { headers });
      const downloadResult = await downloadResponse.json();
      if (!downloadResponse.ok) {
        throw new Error(downloadResult.data?.errorMessage || downloadResult.summary || "Unable to download the Analytics export.");
      }
      if (Array.isArray(downloadResult)) return downloadResult;
      if (Array.isArray(downloadResult.data)) return downloadResult.data;
      if (downloadResult.data && Array.isArray(downloadResult.data.data)) return downloadResult.data.data;
      throw new Error("The Analytics export did not contain a data array.");
    }
  }
  throw new Error("The Analytics export timed out.");
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
    if (!validDate(fromDate) || !validDate(toDate) || fromDate > toDate) {
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
