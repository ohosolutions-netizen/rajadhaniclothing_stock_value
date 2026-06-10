"use strict";

const ANALYTICS_ORIGIN = "https://analyticsapi.zoho.in";
const WORKSPACE_ID = "525719000000004002";
const VIEW_ID = "525719000000291010";
const BULK_VIEW_URL = `${ANALYTICS_ORIGIN}/restapi/v2/bulk/workspaces/${WORKSPACE_ID}/views/${VIEW_ID}/data`;
const ORG_ID = "60066631932";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_PATTERN.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateDateRange(fromDate, toDate) {
  return validDate(fromDate) && validDate(toDate) && fromDate <= toDate;
}

async function getAccessToken() {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    if (process.env.ZOHO_ANALYTICS_ACCESS_TOKEN) {
      return process.env.ZOHO_ANALYTICS_ACCESS_TOKEN;
    }
    throw new Error("Zoho credentials are missing from the server environment.");
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

module.exports = { fetchStockStatement, validateDateRange };
