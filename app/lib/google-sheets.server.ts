import { sha256 } from "./security.server";

const googleScope = "https://www.googleapis.com/auth/drive.file";
const encryptionContext = new TextEncoder().encode(
  "akari-google-refresh-token-v1",
);

type GoogleEnvironment = CloudflareEnvironment & {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY: string;
};

export type GoogleSheetCampaign = {
  id: string;
  slug: string;
  title: string;
  projectTitle: string;
  budgetCents: number;
  currency: string;
  weightFollowers: number;
  weightXScore: number;
  weightSorsaScore: number;
};

export type GoogleSheetApplicant = {
  creatorName: string;
  xUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  xFollowers: number;
  xScore: number;
  sorsaScore: number;
  status: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function base64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function encryptionKey(env: GoogleEnvironment) {
  const raw = base64ToBytes(env.GOOGLE_TOKEN_ENCRYPTION_KEY.trim());
  if (raw.byteLength !== 32)
    throw new Error("Google token encryption key must be 32 bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptRefreshToken(token: string, env: GoogleEnvironment) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encryptionContext },
    await encryptionKey(env),
    new TextEncoder().encode(token),
  );
  return {
    encrypted: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

async function decryptRefreshToken(
  encrypted: string,
  iv: string,
  env: GoogleEnvironment,
) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(iv),
      additionalData: encryptionContext,
    },
    await encryptionKey(env),
    base64ToBytes(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function redirectUri(env: GoogleEnvironment) {
  return new URL("/integrations/google/callback", env.APP_URL).toString();
}

export async function beginGoogleOAuth(
  db: D1Database,
  userId: string,
  env: GoogleEnvironment,
) {
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare(
      "DELETE FROM google_oauth_states WHERE expires_at <= datetime('now')",
    ),
    db
      .prepare(
        `INSERT INTO google_oauth_states
         (state_hash, user_id, expires_at)
         VALUES (?, ?, datetime('now', '+10 minutes'))`,
      )
      .bind(await sha256(state), userId),
  ]);
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authorization.searchParams.set("redirect_uri", redirectUri(env));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", googleScope);
  authorization.searchParams.set("access_type", "offline");
  authorization.searchParams.set("prompt", "consent");
  authorization.searchParams.set("include_granted_scopes", "true");
  authorization.searchParams.set("state", state);
  return authorization.toString();
}

export async function completeGoogleOAuth(
  db: D1Database,
  userId: string,
  code: string,
  state: string,
  env: GoogleEnvironment,
) {
  const stateHash = await sha256(state);
  const validState = await db
    .prepare(
      `SELECT 1 FROM google_oauth_states
       WHERE state_hash = ? AND user_id = ? AND expires_at > datetime('now')`,
    )
    .bind(stateHash, userId)
    .first();
  await db
    .prepare("DELETE FROM google_oauth_states WHERE state_hash = ?")
    .bind(stateHash)
    .run();
  if (!validState) throw new Error("The Google connection request expired.");

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(env),
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json<{
    refresh_token?: string;
    scope?: string;
    error?: string;
  }>();
  if (!response.ok || !payload.refresh_token)
    throw new Error(
      payload.error === "redirect_uri_mismatch"
        ? "Google rejected the configured callback URL."
        : "Google did not return a reusable connection token.",
    );
  const token = await encryptRefreshToken(payload.refresh_token, env);
  await db
    .prepare(
      `INSERT INTO google_connections
       (user_id, encrypted_refresh_token, token_iv, scope)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         encrypted_refresh_token = excluded.encrypted_refresh_token,
         token_iv = excluded.token_iv, scope = excluded.scope,
         updated_at = datetime('now')`,
    )
    .bind(userId, token.encrypted, token.iv, payload.scope ?? googleScope)
    .run();
}

async function refreshAccessToken(
  db: D1Database,
  userId: string,
  env: GoogleEnvironment,
) {
  const connection = await db
    .prepare(
      `SELECT encrypted_refresh_token AS encryptedRefreshToken,
              token_iv AS tokenIv
       FROM google_connections WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ encryptedRefreshToken: string; tokenIv: string }>();
  if (!connection) throw new Error("Connect Google Drive first.");
  const refreshToken = await decryptRefreshToken(
    connection.encryptedRefreshToken,
    connection.tokenIv,
    env,
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json<{
    access_token?: string;
    error?: string;
  }>();
  if (!response.ok || !payload.access_token)
    throw new Error(
      payload.error === "invalid_grant"
        ? "The Google connection expired. Disconnect and reconnect it."
        : "Google authorization is temporarily unavailable.",
    );
  return { accessToken: payload.access_token, refreshToken };
}

export async function disconnectGoogle(
  db: D1Database,
  userId: string,
  env: GoogleEnvironment,
) {
  try {
    const { refreshToken } = await refreshAccessToken(db, userId, env);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
  } finally {
    await db
      .prepare("DELETE FROM google_connections WHERE user_id = ?")
      .bind(userId)
      .run();
  }
}

export function googleSheetValues(
  campaign: GoogleSheetCampaign,
  applicants: GoogleSheetApplicant[],
) {
  const lastRow = applicants.length + 2;
  const rows: Array<Array<string | number>> = [
    [
      "Creator",
      "X",
      "TikTok",
      "Instagram",
      "YouTube",
      "X Followers",
      "XScore",
      "Sorsa Score",
      "Decision",
      "Follower Percentile",
      "XScore Percentile",
      "Sorsa Percentile",
      "AKARI Score",
      "Distribution %",
      `Payout (${campaign.currency})`,
    ],
  ];
  for (const [index, applicant] of applicants.entries()) {
    const row = index + 2;
    const selected = `$I${row}="accepted"`;
    rows.push([
      applicant.creatorName,
      applicant.xUrl,
      applicant.tiktokUrl,
      applicant.instagramUrl,
      applicant.youtubeUrl,
      applicant.xFollowers,
      applicant.xScore,
      applicant.sorsaScore,
      applicant.status,
      `=IF(${selected},IFERROR(PERCENTRANK(FILTER($F$2:$F$${lastRow},$I$2:$I$${lastRow}="accepted"),F${row}),1),0)`,
      `=IF(${selected},IFERROR(PERCENTRANK(FILTER($G$2:$G$${lastRow},$I$2:$I$${lastRow}="accepted"),G${row}),1),0)`,
      `=IF(${selected},IFERROR(PERCENTRANK(FILTER($H$2:$H$${lastRow},$I$2:$I$${lastRow}="accepted"),H${row}),1),0)`,
      `=IF(${selected},MAX(0.05,J${row}*${campaign.weightFollowers / 100}+K${row}*${campaign.weightXScore / 100}+L${row}*${campaign.weightSorsaScore / 100}),0)`,
      `=IFERROR(M${row}/SUM($M$2:$M$${lastRow}),0)`,
      `=ROUND(N${row}*${campaign.budgetCents / 100},2)`,
    ]);
  }
  rows.push(
    [],
    [
      "Private campaign budget",
      `${campaign.currency} ${(campaign.budgetCents / 100).toFixed(2)}`,
    ],
    [
      "Formula weights",
      `Followers ${campaign.weightFollowers}% / XScore ${campaign.weightXScore}% / Sorsa ${campaign.weightSorsaScore}%`,
    ],
  );
  return rows;
}

async function googleRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json<
    T & {
      error?: { message?: string };
    }
  >();
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Google Sheets request failed.");
  return payload;
}

export async function createOrRefreshIioSheet(
  db: D1Database,
  userId: string,
  campaign: GoogleSheetCampaign,
  applicants: GoogleSheetApplicant[],
  env: GoogleEnvironment,
) {
  const { accessToken } = await refreshAccessToken(db, userId, env);
  const existing = await db
    .prepare(
      `SELECT spreadsheet_id AS spreadsheetId,
              spreadsheet_url AS spreadsheetUrl
       FROM iio_google_sheets WHERE campaign_id = ?`,
    )
    .bind(campaign.id)
    .first<{ spreadsheetId: string; spreadsheetUrl: string }>();
  let spreadsheetId = existing?.spreadsheetId;
  let spreadsheetUrl = existing?.spreadsheetUrl;
  if (!spreadsheetId) {
    const created = await googleRequest<{
      spreadsheetId: string;
      spreadsheetUrl: string;
    }>("https://sheets.googleapis.com/v4/spreadsheets", accessToken, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: `AKARI IIO · ${campaign.title}` },
        sheets: [
          {
            properties: { title: "IIO", gridProperties: { frozenRowCount: 1 } },
          },
        ],
      }),
    });
    spreadsheetId = created.spreadsheetId;
    spreadsheetUrl = created.spreadsheetUrl;
  }
  const range = encodeURIComponent("IIO!A1:O");
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
    accessToken,
    { method: "POST", body: "{}" },
  );
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("IIO!A1")}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        range: "IIO!A1",
        majorDimension: "ROWS",
        values: googleSheetValues(campaign, applicants),
      }),
    },
  );
  await googleRequest(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.12, green: 0.08, blue: 0.16 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: "COLUMNS",
                startIndex: 0,
                endIndex: 15,
              },
            },
          },
        ],
      }),
    },
  );
  await db
    .prepare(
      `INSERT INTO iio_google_sheets
       (campaign_id, spreadsheet_id, spreadsheet_url, created_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(campaign_id) DO UPDATE SET
         spreadsheet_id = excluded.spreadsheet_id,
         spreadsheet_url = excluded.spreadsheet_url,
         created_by = excluded.created_by, updated_at = datetime('now')`,
    )
    .bind(campaign.id, spreadsheetId, spreadsheetUrl, userId)
    .run();
  return { spreadsheetId, spreadsheetUrl };
}
