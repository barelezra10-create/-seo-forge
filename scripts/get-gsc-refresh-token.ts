#!/usr/bin/env tsx
/**
 * One-time OAuth flow to get a Google Search Console refresh token.
 * Reads GSC_CLIENT_ID and GSC_CLIENT_SECRET from .env, runs the auth code
 * flow against http://localhost:8788/oauth/callback, exchanges the code
 * for a refresh token, and appends GSC_REFRESH_TOKEN to .env.
 *
 * Usage:
 *   set -a && source .env && set +a && tsx scripts/get-gsc-refresh-token.ts
 */
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";
import { resolve } from "node:path";

const REDIRECT_URI = "http://localhost:8788/oauth/callback";
const SCOPE = "https://www.googleapis.com/auth/webmasters";
const ENV_PATH = resolve(process.cwd(), ".env");

const clientId = process.env.GSC_CLIENT_ID;
const clientSecret = process.env.GSC_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("ERROR: GSC_CLIENT_ID and GSC_CLIENT_SECRET must be set in env.");
  console.error("Run with: set -a && source .env && set +a && tsx scripts/get-gsc-refresh-token.ts");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("bad request");
    return;
  }
  const u = new URL(req.url, REDIRECT_URI);
  if (u.pathname !== "/oauth/callback") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const code = u.searchParams.get("code");
  const error = u.searchParams.get("error");
  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>OAuth error: ${error}</h1><p>Check your console for details.</p>`);
    console.error("OAuth error:", error);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.writeHead(400);
    res.end("no code");
    return;
  }

  console.log("Got authorization code, exchanging for tokens...");
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
    };

    if (!tokens.refresh_token) {
      throw new Error(
        "No refresh_token returned. This usually means you have already authorized this client. " +
          "Visit https://myaccount.google.com/permissions, revoke access for this app, then re-run.",
      );
    }

    // Append/update GSC_REFRESH_TOKEN in .env
    let envContents = "";
    try {
      envContents = readFileSync(ENV_PATH, "utf-8");
    } catch {
      // .env doesn't exist yet, fine
    }
    if (envContents.match(/^GSC_REFRESH_TOKEN=/m)) {
      envContents = envContents.replace(/^GSC_REFRESH_TOKEN=.*$/m, `GSC_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
      envContents = envContents.trimEnd() + `\nGSC_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    writeFileSync(ENV_PATH, envContents);

    console.log("\n=== Refresh token saved to .env ===");
    console.log(`GSC_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\nYou can now close this script. Refresh token is long-lived.");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h1>Success</h1><p>Refresh token saved to .env. You can close this tab.</p>`);
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 100);
  } catch (e) {
    console.error("Failed:", e);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Failed</h1><pre>${(e as Error).message}</pre>`);
    server.close();
    process.exit(1);
  }
});

server.listen(8788, () => {
  console.log("Listening on http://localhost:8788/oauth/callback");
  console.log("\nOpening browser for Google consent...");
  console.log("If your browser doesn't open, paste this URL manually:\n");
  console.log(authUrl.toString());
  console.log("");
  // Open browser (macOS specific)
  exec(`open "${authUrl.toString()}"`, (err) => {
    if (err) console.warn("(could not auto-open browser; paste the URL above)");
  });
});

server.on("error", (err) => {
  console.error("Server error:", err);
  process.exit(1);
});

// Safety timeout: 5 minutes
setTimeout(() => {
  console.error("Timed out after 5 minutes. Did you complete the consent screen?");
  server.close();
  process.exit(1);
}, 5 * 60 * 1000);
