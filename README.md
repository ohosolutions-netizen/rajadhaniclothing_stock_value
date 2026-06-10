# Stock Value Report

A ZET-packaged Zoho Creator JS widget that reads the **Stock Value Daily Cumulative**
query table from Zoho Analytics through a server-side Creator Deluge function.

The widget contains no OAuth token, client secret, API key, or Analytics connection
credential.

## Architecture

```text
Creator page widget
  -> Creator Custom API (GET get_stock_statement)
  -> Deluge getStockStatement(fromDate, toDate)
  -> Zoho Analytics API on analyticsapi.zoho.in
```

Zoho Creator's current JS API v2 officially invokes server-side custom functionality
through a **Custom API**:

```js
ZOHO.CREATOR.DATA.invokeCustomApi(config)
```

Official references:

- JS API v2 setup and SDK CDN: https://www.zoho.com/creator/help/js-api/v2/
- Invoke Custom API: https://www.zoho.com/creator/help/js-api/v2/custom-api.html

## 1. Create the Analytics connection

In the Creator application owned by `rajadhaniclothing`:

1. Open **Setup -> Connections**.
2. Create a **Zoho OAuth** connection.
3. Select **Zoho Analytics**.
4. Set the connection link name to `zoho_analytics_connection`.
5. Grant scope `ZohoAnalytics.data.read`.
6. Authorize the connection against the India data centre account.

The Deluge function only calls `https://analyticsapi.zoho.in`.

## 2. Create the Deluge function

Create an application-level Deluge function:

- Name: `getStockStatement`
- Return type: `string`
- Arguments:
  - `fromDate` (`string`)
  - `toDate` (`string`)

Paste the code from [`deluge/getStockStatement.dg`](deluge/getStockStatement.dg).

The function validates both dates, creates an asynchronous Analytics bulk export
job, polls it until completion, downloads the JSON export, and returns only its data
array as a JSON string. This view does not support synchronous export.

## 3. Publish it as a Creator Custom API

Creator JS API v2 does not document a direct widget-to-function method. Publish the
function through Creator's supported Custom API mechanism:

1. Open the application's **Microservices -> Custom APIs** area.
2. Create a Custom API backed by `getStockStatement`.
3. Use link name `get_stock_statement`.
4. Set request method to **GET**.
5. Map GET query parameters `fromDate` and `toDate` to the function arguments.
6. Use Creator-user authentication and give the roles/profiles that use the page
   permission to invoke the Custom API.

The widget calls it with:

```js
ZOHO.CREATOR.DATA.invokeCustomApi({
  api_name: "get_stock_statement",
  http_method: "GET",
  query_params: "fromDate=2026-06-01&toDate=2026-06-10"
})
```

If a different Custom API link name is chosen, update `CUSTOM_API_NAME` at the top
of `app/app.js`.

## 4. Validate and package

From this directory:

```sh
zet validate
zet pack
```

Upload the generated ZIP as a Creator widget named **Stock Value Report**, then add
it to a page in the `rajadhani-clothings` application.

For a local report backed directly by the specified Analytics view, provide OAuth
credentials in the local `.env` file. Replace the dummy values for
`ZOHO_REFRESH_TOKEN`, `ZOHO_CLIENT_ID`, and `ZOHO_CLIENT_SECRET`, then run:

```sh
npm start
```

Alternatively, clear those three values and set a short-lived
`ZOHO_ANALYTICS_ACCESS_TOKEN` in `.env`.

Then open `http://127.0.0.1:8000/app/`. Credentials remain server-side and are never
sent to the widget.

## Vercel deployment

The repository includes a Vercel Node function at `/api/stock-statement`. In the
Vercel project, add these environment variables for Production, Preview, and
Development as needed:

- `ZOHO_REFRESH_TOKEN`
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`

Alternatively, set the short-lived `ZOHO_ANALYTICS_ACCESS_TOKEN`. When both modes
are configured, the refresh-token credentials take precedence.

Redeploy after changing environment variables. The Vercel-hosted browser calls the
serverless function, while a widget hosted on `creatorapp.zoho.in` continues to use
the Creator Custom API.

GitHub Actions secrets are not automatically available to Vercel. Add these
variables directly in **Vercel Project Settings -> Environment Variables**, then
redeploy.
