import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8080);

createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>SEO Forge</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 24px;color:#222}h1{font-size:28px;margin:0 0 8px}p{color:#555}</style>
</head><body>
<h1>SEO Forge</h1>
<p>Phase 1A: shipped. CLI publishes articles end-to-end from local machine.</p>
<p>Phase 1B: dashboard + worker on Railway lands here next.</p>
<p style="color:#888;font-size:13px">${new Date().toISOString()}</p>
</body></html>`);
}).listen(port, () => {
  console.log(`SEO Forge placeholder listening on :${port}`);
});
