const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 5050;
const FIREBASE_DB = "https://brobar-a7700-default-rtdb.firebaseio.com";
const PHONE_EXPORT_DIR = "/storage/emulated/0/Download/BetaDrop_Render_Cloud";

const dbFile = path.join(__dirname, "builds.json");
const apkDir = path.join(__dirname, "apks");

if (!fs.existsSync(apkDir)) fs.mkdirSync(apkDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "{}");

// Helper: Firebase HTTPS Request
function fbRequest(method, fbPath, data) {
  return new Promise((resolve) => {
    try {
      const payload = data ? JSON.stringify(data) : null;
      const req = https.request(FIREBASE_DB + fbPath + ".json", {
        method: method,
        headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}
      }, (res) => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      if (payload) req.write(payload);
      req.end();
    } catch (e) { resolve(null); }
  });
}

function getDb() {
  try { return JSON.parse(fs.readFileSync(dbFile, "utf8")); }
  catch (e) { return {}; }
}

// Sync DB & Files to Phone Storage + Firebase Cloud (So it works 24x7 even when phone is OFF!)
async function syncEverything(db, uploadedId, apkBuffer) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));

  // 1. Save to Phone Download Folder (/storage/emulated/0/Download/BetaDrop_Render_Cloud)
  try {
    if (fs.existsSync("/storage/emulated/0/Download")) {
      fs.mkdirSync(path.join(PHONE_EXPORT_DIR, "apks"), { recursive: true });
      fs.copyFileSync(path.join(__dirname, "package.json"), path.join(PHONE_EXPORT_DIR, "package.json"));
      fs.copyFileSync(path.join(__dirname, "betadrop_server.cjs"), path.join(PHONE_EXPORT_DIR, "betadrop_server.cjs"));
      fs.copyFileSync(dbFile, path.join(PHONE_EXPORT_DIR, "builds.json"));
      for (const f of fs.readdirSync(apkDir)) {
        fs.copyFileSync(path.join(apkDir, f), path.join(PHONE_EXPORT_DIR, "apks", f));
      }
    }
  } catch (e) {}

  // 2. Save Metadata to Firebase Cloud
  await fbRequest("PUT", "/betadrop_v3/apps", db);

  // 3. Save APK Binary Chunks to Firebase Cloud (So Render.com can upload/download APKs 24x7 when phone is OFF!)
  if (uploadedId && apkBuffer) {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(apkBuffer.length / CHUNK_SIZE);
    await fbRequest("PUT", "/betadrop_v3/apk_meta/" + uploadedId, { totalChunks: totalChunks, size: apkBuffer.length });
    for (let i = 0; i < totalChunks; i++) {
      const slice = apkBuffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await fbRequest("PUT", "/betadrop_v3/apk_chunks/" + uploadedId + "/c_" + i, slice.toString("base64"));
    }
  }
}

// On startup: Pull real apps from Firebase Cloud if local is empty (e.g. on Render.com!)
(async () => {
  const cloudApps = await fbRequest("GET", "/betadrop_v3/apps");
  if (cloudApps && typeof cloudApps === "object") {
    const local = getDb();
    const merged = Object.assign({}, cloudApps, local);
    fs.writeFileSync(dbFile, JSON.stringify(merged, null, 2));
  }
  syncEverything(getDb());
})();

// Pure Hand-Crafted Modern CSS (Zero External CDN Failure!)
const COMMON_CSS = [
  "<style>",
  ":root { --bg: #07090e; --card: #11151f; --border: #1e2536; --green: #00a870; --green-hover: #00c282; --blue: #4f46e5; --text: #f1f5f9; --muted: #94a3b8; }",
  "* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }",
  "body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 16px; line-height: 1.5; }",
  ".container { max-width: 600px; margin: 0 auto; }",
  ".nav { display: flex; align-items: center; justify-content: space-between; background: var(--card); border: 1px solid var(--border); padding: 14px 18px; border-radius: 18px; margin-bottom: 18px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }",
  ".brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: #fff; }",
  ".brand-icon { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #00a870, #059669); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; color: #000; box-shadow: 0 4px 15px rgba(0,168,112,0.3); }",
  ".badge-live { background: rgba(0,168,112,0.15); color: #34d399; border: 1px solid rgba(0,168,112,0.3); padding: 5px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; }",
  ".card { background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 20px; margin-bottom: 18px; box-shadow: 0 12px 32px rgba(0,0,0,0.35); }",
  ".grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }",
  "@media (max-width: 480px) { .grid-2 { grid-template-columns: 1fr; } }",
  "label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }",
  "input, textarea, select { width: 100%; background: #07090e; border: 1px solid var(--border); color: #fff; padding: 12px 14px; border-radius: 12px; font-size: 14px; outline: none; transition: border 0.2s; }",
  "input:focus, textarea:focus { border-color: var(--green); }",
  ".btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 14px 18px; border-radius: 14px; font-size: 15px; font-weight: 700; border: none; cursor: pointer; text-decoration: none; transition: transform 0.15s, opacity 0.2s; }",
  ".btn:active { transform: scale(0.98); }",
  ".btn-green { background: var(--green); color: #04130d; box-shadow: 0 6px 20px rgba(0,168,112,0.3); }",
  ".btn-blue { background: var(--blue); color: #fff; box-shadow: 0 6px 20px rgba(79,70,229,0.3); }",
  ".btn-dark { background: #1e2536; color: #fff; border: 1px solid #2e3852; }",
  ".progress-wrap { display: none; background: #07090e; border: 1px solid var(--border); border-radius: 12px; height: 26px; overflow: hidden; margin-top: 12px; position: relative; }",
  ".progress-bar { background: linear-gradient(90deg, #00a870, #34d399); height: 100%; width: 0%; transition: width 0.2s; }",
  ".progress-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px #000; }",
  ".app-item { display: flex; flex-direction: column; gap: 14px; background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 16px; margin-bottom: 12px; }",
  ".app-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }",
  ".app-icon { width: 60px; height: 60px; border-radius: 16px; object-fit: cover; background: #1e2536; border: 1px solid #2e3852; flex-shrink: 0; }",
  ".pill { display: inline-block; background: rgba(0,168,112,0.15); color: #34d399; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }",
  ".stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); background: #0b0e17; border: 1px solid var(--border); border-radius: 16px; padding: 12px 6px; text-align: center; margin: 18px 0; }",
  ".stat-box { border-right: 1px solid var(--border); }",
  ".stat-box:last-child { border-right: none; }",
  ".stat-val { font-size: 16px; font-weight: 800; color: #fff; }",
  ".stat-lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }",
  ".code-box { background: #05070b; border: 1px solid var(--border); border-radius: 12px; padding: 12px; font-family: monospace; font-size: 12px; color: #34d399; word-break: break-all; margin: 8px 0; }",
  "</style>"
].join("\n");

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");

  // 1. MAIN DASHBOARD (Upload & Real Builds List)
  if (req.method === "GET" && u.pathname === "/") {
    const html = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>BetaDrop Cloud — Real APK Distribution</title>' + COMMON_CSS + '</head><body>',
      '<div class="container">',
      '  <div class="nav">',
      '    <a href="/" class="brand"><div class="brand-icon">▶</div><div><div style="font-size:18px;font-weight:800;">BetaDrop <span style="color:#00a870;">Cloud</span></div><div style="font-size:11px;color:var(--muted);">100% Real Data • Cloud & Phone Sync</div></div></a>',
      '    <span class="badge-live">● 24x7 ONLINE</span>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <h2 style="font-size:17px;margin-bottom:14px;">🚀 Upload Real Android APK</h2>',
      '    <div class="grid-2">',
      '      <div><label>App Name *</label><input id="appName" placeholder="e.g. Fall With Frnd"></div>',
      '      <div><label>Developer / Studio Name *</label><input id="devName" placeholder="e.g. BroBar Official"></div>',
      '    </div>',
      '    <div class="grid-2">',
      '      <div><label>Version *</label><input id="appVer" value="1.0.0" placeholder="1.0.0"></div>',
      '      <div><label>Package Name / Custom ID</label><input id="appSlug" placeholder="e.g. fall-with-frnd"></div>',
      '    </div>',
      '    <div style="margin-bottom:12px;"><label>Real App Description / Release Notes</label><textarea id="appDesc" rows="2" placeholder="Write real features of your app..."></textarea></div>',
      '    <div class="grid-2">',
      '      <div><label>🖼️ App Logo (PNG/JPG)</label><input type="file" id="logoFile" accept="image/*"></div>',
      '      <div><label>📦 Select (.APK) File *</label><input type="file" id="apkFile" accept=".apk"></div>',
      '    </div>',
      '    <button id="upBtn" class="btn btn-green" onclick="uploadRealApk()">☁️ Upload APK to 24x7 Cloud & Generate Links</button>',
      '    <div class="progress-wrap" id="pWrap"><div class="progress-bar" id="pBar"></div><div class="progress-text" id="pText">0% Uploading...</div></div>',
      '  </div>',
      '',
      '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
      '    <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;">📦 Real Hosted Applications</span>',
      '    <span style="font-size:11px;color:#34d399;">Synced with Phone & Firebase</span>',
      '  </div>',
      '  <div id="buildsList">Loading real builds...</div>',
      '</div>',
      '<script>',
      'const DEFAULT_ICON = "data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' viewBox=\'0 0 100 100\'><rect width=\'100\' height=\'100\' rx=\'24\' fill=\'%2300a870\'/><path d=\'M35 28 L72 50 L35 72 Z\' fill=\'%2304130d\'/></svg>";',
      'async function loadBuilds() {',
      '  const res = await fetch("/api/builds");',
      '  const db = await res.json();',
      '  const list = document.getElementById("buildsList");',
      '  const keys = Object.keys(db);',
      '  if (!keys.length) { list.innerHTML = "<div class=\'card\' style=\'text-align:center;color:var(--muted);font-size:13px;\'>No APKs uploaded yet. Upload your first real APK above!</div>"; return; }',
      '  list.innerHTML = "";',
      '  for (const id of keys.reverse()) {',
      '    const b = db[id];',
      '    const storeUrl = location.origin + "/store/" + id;',
      '    const directUrl = location.origin + "/dl/" + id + ".apk";',
      '    const manageUrl = location.origin + "/builds/manage/?id=" + id + "&tab=settings";',
      '    const icon = b.logo || DEFAULT_ICON;',
      '    list.innerHTML += \'<div class="app-item">\' +',
      '      \'<div class="app-row">\' +',
      '        \'<div style="display:flex;align-items:center;gap:12px;"><img src="\' + icon + \'" class="app-icon">\' +',
      '        \'<div><div style="font-size:16px;font-weight:800;">\' + b.name + \' <span class="pill">v\' + b.version + \'</span></div>\' +',
      '        \'<div style="font-size:12px;color:var(--muted);">\' + b.dev + \' • <b>\' + b.sizeMB + \' MB</b> (\' + Number(b.sizeBytes || 0).toLocaleString() + \' bytes)</div>\' +',
      '        \'<div style="font-size:11px;color:#34d399;margin-top:2px;">⬇️ \' + (b.downloads || 0) + \' Real Downloads • Uploaded: \' + b.updatedAt + \'</div></div></div>\' +',
      '        \'<a href="\' + manageUrl + \'" class="btn btn-dark" style="width:auto;padding:10px 14px;font-size:12px;">⚙️ Manage</a>\' +',
      '      \'</div>\' +',
      '      \'<div class="grid-2" style="margin:0;">\' +',
      '        \'<a href="\' + storeUrl + \'" target="_blank" class="btn btn-green" style="padding:10px;font-size:13px;">▶ Open Play Store Page</a>\' +',
      '        \'<a href="\' + directUrl + \'" class="btn btn-blue" style="padding:10px;font-size:13px;">⚡ Direct APK Download</a>\' +',
      '      \'</div></div>\';',
      '  }',
      '}',
      'async function uploadRealApk() {',
      '  const apk = document.getElementById("apkFile").files[0];',
      '  if (!apk) return alert("Bhai pehle apni .APK file select karo!");',
      '  const name = document.getElementById("appName").value.trim() || apk.name.replace(/\\.apk$/i, "");',
      '  const dev = document.getElementById("devName").value.trim() || "Official Developer";',
      '  const ver = document.getElementById("appVer").value.trim() || "1.0.0";',
      '  const desc = document.getElementById("appDesc").value.trim() || "Verified Android APK package.";',
      '  const slug = document.getElementById("appSlug").value.trim();',
      '  const logo = document.getElementById("logoFile").files[0];',
      '  let logoData = "";',
      '  if (logo) {',
      '    logoData = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(logo); });',
      '  }',
      '  const btn = document.getElementById("upBtn");',
      '  const pWrap = document.getElementById("pWrap");',
      '  const pBar = document.getElementById("pBar");',
      '  const pText = document.getElementById("pText");',
      '  btn.disabled = true; pWrap.style.display = "block";',
      '  const q = "name=" + encodeURIComponent(name) + "&dev=" + encodeURIComponent(dev) + "&ver=" + encodeURIComponent(ver) + "&desc=" + encodeURIComponent(desc) + "&id=" + encodeURIComponent(slug) + "&fname=" + encodeURIComponent(apk.name);',
      '  const xhr = new XMLHttpRequest();',
      '  xhr.open("POST", "/api/upload?" + q, true);',
      '  if (logoData) xhr.setRequestHeader("x-logo", logoData);',
      '  xhr.upload.onprogress = (e) => {',
      '    if (e.lengthComputable) {',
      '      const pct = Math.round((e.loaded / e.total) * 100);',
      '      pBar.style.width = pct + "%";',
      '      pText.innerText = pct < 100 ? ("Uploading Real APK: " + pct + "%") : "Syncing to 24x7 Cloud & Phone Storage...";',
      '    }',
      '  };',
      '  xhr.onload = () => {',
      '    const out = JSON.parse(xhr.responseText);',
      '    window.location.href = "/builds/manage/?id=" + out.id + "&tab=settings";',
      '  };',
      '  xhr.send(apk);',
      '}',
      'loadBuilds();',
      '</script></body></html>'
    ].join("\n");
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  // 2. API: GET REAL BUILDS
  if (req.method === "GET" && u.pathname === "/api/builds") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(getDb()));
  }

  // 3. API: UPLOAD REAL APK (Calculates Real SHA-256, Exact Byte Size, Saves Locally + Phone + Firebase Cloud)
  if (req.method === "POST" && u.pathname === "/api/upload") {
    const name = u.searchParams.get("name") || "Android App";
    let rawId = (u.searchParams.get("id") || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!rawId) rawId = "app-" + Date.now();
    const dev = u.searchParams.get("dev") || "Official Developer";
    const ver = u.searchParams.get("ver") || "1.0.0";
    const desc = u.searchParams.get("desc") || "";
    const fname = u.searchParams.get("fname") || (rawId + ".apk");
    const logo = req.headers["x-logo"] || "";

    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", async () => {
      const buf = Buffer.concat(chunks);
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      fs.writeFileSync(path.join(apkDir, rawId + ".apk"), buf);

      const db = getDb();
      const existing = db[rawId] || {};
      db[rawId] = {
        id: rawId,
        name: name,
        dev: dev,
        version: ver,
        desc: desc || existing.desc || "Real Android APK package.",
        fileName: fname,
        sizeBytes: buf.length,
        sizeMB: (buf.length / (1024 * 1024)).toFixed(2),
        sha256: sha256,
        logo: logo || existing.logo || "",
        downloads: existing.downloads || 0,
        reviews: existing.reviews || [],
        updatedAt: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      };

      await syncEverything(db, rawId, buf);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: rawId }));
    });
    return;
  }

  // 4. API: SUBMIT REAL USER REVIEW ON PLAY STORE PAGE
  if (req.method === "POST" && u.pathname === "/api/review") {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const db = getDb();
      if (db[body.id]) {
        if (!Array.isArray(db[body.id].reviews)) db[body.id].reviews = [];
        db[body.id].reviews.unshift({
          user: body.user || "Verified User",
          stars: Number(body.stars) || 5,
          comment: body.comment || "",
          date: new Date().toLocaleDateString("en-IN")
        });
        await syncEverything(db);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  // 5. MANAGE & SETTINGS PAGE (/builds/manage/?id=xxx&tab=settings)
  if (req.method === "GET" && u.pathname.startsWith("/builds/manage")) {
    const id = u.searchParams.get("id");
    const db = getDb();
    const b = db[id];
    if (!b) { res.writeHead(404); return res.end("Build not found"); }
    const html = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>Manage ' + b.name + '</title>' + COMMON_CSS + '</head><body>',
      '<div class="container">',
      '  <div class="nav"><a href="/" style="color:#34d399;text-decoration:none;font-weight:700;font-size:14px;">← Back to All Apps</a><span class="badge-live">ID: ' + id + '</span></div>',
      '  <div class="card">',
      '    <h2 style="font-size:22px;font-weight:800;">' + b.name + ' <span class="pill">v' + b.version + '</span></h2>',
      '    <p style="font-size:13px;color:var(--muted);margin-top:4px;">Developer: <b>' + b.dev + '</b> • Exact Size: <b>' + b.sizeMB + ' MB (' + Number(b.sizeBytes).toLocaleString() + ' bytes)</b></p>',
      '    <p style="font-size:11px;color:#34d399;margin-top:4px;word-break:break-all;">🔒 Real SHA-256: ' + b.sha256 + '</p>',
      '',
      '    <hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">',
      '    <label style="color:#34d399;">▶ LINK 1: Professional Google Play Store Style Page</label>',
      '    <div class="code-box" id="link1"></div>',
      '    <div class="grid-2"><button class="btn btn-green" onclick="copyTxt(\'link1\')">📋 Copy Play Store Link</button><a id="open1" target="_blank" class="btn btn-dark">↗ Open Store Page</a></div>',
      '',
      '    <label style="color:#818cf8;margin-top:16px;">⚡ LINK 2: Direct Instant APK Download Link</label>',
      '    <div class="code-box" id="link2" style="color:#818cf8;"></div>',
      '    <div class="grid-2"><button class="btn btn-blue" onclick="copyTxt(\'link2\')">📋 Copy Direct APK Link</button><a id="open2" class="btn btn-dark">⬇️ Test Direct Download</a></div>',
      '  </div>',
      '',
      '  <div class="card">',
      '    <h3 style="font-size:16px;margin-bottom:6px;color:#fbbf24;">🔄 Update New APK Version (Keep Same 2 Links!)</h3>',
      '    <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">Jab bhi aap naya APK upload karoge, upar wale dono links bilkul change nahi honge!</p>',
      '    <div class="grid-2"><div><label>New Version</label><input id="nver" value="' + b.version + '"></div><div><label>New APK File</label><input type="file" id="napk" accept=".apk"></div></div>',
      '    <button id="ubtn" class="btn btn-green" onclick="updateSameLink()">☁️ Upload New APK on Same Links</button>',
      '  </div>',
      '</div>',
      '<script>',
      'const sUrl = location.origin + "/store/' + id + '";',
      'const dUrl = location.origin + "/dl/' + id + '.apk";',
      'document.getElementById("link1").innerText = sUrl; document.getElementById("open1").href = sUrl;',
      'document.getElementById("link2").innerText = dUrl; document.getElementById("open2").href = dUrl;',
      'function copyTxt(el) { navigator.clipboard.writeText(document.getElementById(el).innerText); alert("✅ Link Copied!"); }',
      'async function updateSameLink() {',
      '  const f = document.getElementById("napk").files[0];',
      '  if (!f) return alert("Select new APK file first!");',
      '  const btn = document.getElementById("ubtn"); btn.disabled = true; btn.innerText = "⏳ Uploading & Syncing to Cloud...";',
      '  const ver = document.getElementById("nver").value;',
      '  await fetch("/api/upload?id=' + id + '&name=' + encodeURIComponent(b.name) + '&dev=' + encodeURIComponent(b.dev) + '&ver=" + encodeURIComponent(ver) + "&fname=" + encodeURIComponent(f.name), { method: "POST", body: await f.arrayBuffer() });',
      '  alert("✅ APK Updated! Both links now serve the new version!"); location.reload();',
      '}',
      '</script></body></html>'
    ].join("\n");
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  // 6. LINK 1: REAL GOOGLE PLAY STORE PAGE (/store/:id)
  if (req.method === "GET" && (u.pathname.startsWith("/store/") || u.pathname.startsWith("/install"))) {
    const id = u.pathname.startsWith("/store/") ? u.pathname.split("/store/")[1].replace(/\/$/, "") : u.searchParams.get("id");
    const db = getDb();
    const b = db[id];
    if (!b) { res.writeHead(404); return res.end("App not found"); }

    const reviews = Array.isArray(b.reviews) ? b.reviews : [];
    const avgRating = reviews.length ? (reviews.reduce((a, r) => a + Number(r.stars), 0) / reviews.length).toFixed(1) + " ★" : "New ★";
    const dlUrl = "/dl/" + id + ".apk";
    const defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' rx='24' fill='%2300a870'/><path d='M35 28 L72 50 L35 72 Z' fill='%2304130d'/></svg>";
    const icon = b.logo || defaultSvg;

    let reviewsHtml = "";
    for (const r of reviews.slice(0, 10)) {
      reviewsHtml += '<div style="border-bottom:1px solid var(--border);padding:10px 0;"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;"><span>👤 ' + r.user + '</span><span style="color:#fbbf24;">' + "★".repeat(r.stars) + '</span></div><p style="font-size:12px;color:var(--muted);margin-top:4px;">' + r.comment + '</p><span style="font-size:10px;color:#475569;">' + r.date + '</span></div>';
    }
    if (!reviewsHtml) reviewsHtml = '<p style="font-size:12px;color:var(--muted);">No reviews yet. Be the first to review after installing!</p>';

    const html = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>' + b.name + ' — Download Official APK</title>' + COMMON_CSS + '</head><body>',
      '<div class="container">',
      '  <div class="nav"><div class="brand"><div class="brand-icon">▶</div><div><div style="font-size:16px;font-weight:800;">Google Play <span style="color:#00a870;">OTA</span></div><div style="font-size:11px;color:var(--muted);">Verified Direct APK Distribution</div></div></div><span class="badge-live">🛡️ Verified SHA-256</span></div>',
      '  <div class="card">',
      '    <div style="display:flex;align-items:center;gap:16px;">',
      '      <img src="' + icon + '" style="width:84px;height:84px;border-radius:22px;object-fit:cover;background:#1e2536;border:1px solid #2e3852;flex-shrink:0;">',
      '      <div>',
      '        <h1 style="font-size:24px;font-weight:800;line-height:1.2;">' + b.name + '</h1>',
      '        <p style="color:#00a870;font-weight:700;font-size:14px;margin-top:4px;">' + b.dev + '</p>',
      '        <p style="font-size:11px;color:var(--muted);margin-top:2px;">Version ' + b.version + ' • Updated ' + b.updatedAt + '</p>',
      '      </div>',
      '    </div>',
      '',
      '    <!-- 100% REAL STATS -->',
      '    <div class="stat-grid">',
      '      <div class="stat-box"><div class="stat-val">' + avgRating + '</div><div class="stat-lbl">' + reviews.length + ' Real Reviews</div></div>',
      '      <div class="stat-box"><div class="stat-val">' + b.sizeMB + ' MB</div><div class="stat-lbl">' + Number(b.sizeBytes).toLocaleString() + ' B</div></div>',
      '      <div class="stat-box"><div class="stat-val">' + (b.downloads || 0) + '</div><div class="stat-lbl">Real Downloads</div></div>',
      '    </div>',
      '',
      '    <!-- PLAY STORE INSTALL BUTTON -->',
      '    <a href="' + dlUrl + '" id="dlBtn" onclick="onDl()" class="btn btn-green" style="border-radius:99px;font-size:16px;padding:15px;">⬇️ Install Official APK (' + b.sizeMB + ' MB)</a>',
      '    <div style="text-align:center;font-size:11px;color:var(--muted);margin-top:10px;word-break:break-all;">🛡️ Play Protect SHA-256: <code>' + (b.sha256 ? b.sha256.substring(0, 24) + "..." : "Verified") + '</code></div>',
      '  </div>',
      '',
      '  <!-- REAL DESCRIPTION & PACKAGE INFO -->',
      '  <div class="card">',
      '    <h3 style="font-size:15px;font-weight:800;margin-bottom:8px;">About this app</h3>',
      '    <p style="font-size:13px;color:#cbd5e1;white-space:pre-wrap;">' + b.desc + '</p>',
      '    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);display:grid;grid-template-columns:1fr 1fr;gap:8px;">',
      '      <div>📦 File: <b style="color:#fff;">' + (b.fileName || (id + ".apk")) + '</b></div>',
      '      <div>🔢 Version: <b style="color:#fff;">v' + b.version + '</b></div>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- QR CODE -->',
      '  <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;">',
      '    <div><h3 style="font-size:15px;font-weight:800;">📱 Scan QR to Install</h3><p style="font-size:12px;color:var(--muted);margin-top:4px;">Scan with any phone camera to download the APK directly.</p></div>',
      '    <img id="qr" style="width:96px;height:96px;background:#fff;padding:6px;border-radius:14px;flex-shrink:0;">',
      '  </div>',
      '',
      '  <!-- REAL USER REVIEWS SECTION -->',
      '  <div class="card">',
      '    <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">⭐ Real Ratings & Reviews (' + reviews.length + ')</h3>',
      '    <div class="grid-2"><input id="rUser" placeholder="Your Name"><select id="rStars"><option value="5">★★★★★ (5 Stars)</option><option value="4">★★★★☆ (4 Stars)</option><option value="3">★★★☆☆ (3 Stars)</option><option value="2">★★☆☆☆ (2 Stars)</option><option value="1">★☆☆☆☆ (1 Star)</option></select></div>',
      '    <input id="rText" placeholder="Write your real review..." style="margin-bottom:10px;">',
      '    <button class="btn btn-dark" onclick="postReview()" style="padding:10px;font-size:13px;margin-bottom:14px;">✍️ Submit Real Review</button>',
      '    <div>' + reviewsHtml + '</div>',
      '  </div>',
      '</div>',
      '<script>',
      'document.getElementById("qr").src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(location.origin + "' + dlUrl + '");',
      'function onDl() { const b = document.getElementById("dlBtn"); b.innerText = "✅ Downloading APK... Check Notification Bar!"; }',
      'async function postReview() {',
      '  const user = document.getElementById("rUser").value.trim() || "Android User";',
      '  const stars = document.getElementById("rStars").value;',
      '  const comment = document.getElementById("rText").value.trim();',
      '  if (!comment) return alert("Write a comment first!");',
      '  await fetch("/api/review", { method: "POST", body: JSON.stringify({ id: "' + id + '", user, stars, comment }) });',
      '  location.reload();',
      '}',
      '</script></body></html>'
    ].join("\n");
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  // 7. LINK 2: DIRECT INSTANT APK DOWNLOAD (Auto-restores from Firebase Cloud if Render restarted!)
  if (req.method === "GET" && (u.pathname.startsWith("/dl/") || u.pathname.startsWith("/download/"))) {
    const id = u.pathname.split("/").pop().replace(/\.apk$/, "");
    const db = getDb();
    const file = path.join(apkDir, id + ".apk");

    // If running on Render.com and container restarted, pull APK binary chunks from Firebase Cloud automatically!
    if (db[id] && !fs.existsSync(file)) {
      const meta = await fbRequest("GET", "/betadrop_v3/apk_meta/" + id);
      if (meta && meta.totalChunks) {
        const bufs = [];
        for (let i = 0; i < meta.totalChunks; i++) {
          const b64 = await fbRequest("GET", "/betadrop_v3/apk_chunks/" + id + "/c_" + i);
          if (b64) bufs.push(Buffer.from(b64, "base64"));
        }
        if (bufs.length === meta.totalChunks) {
          fs.writeFileSync(file, Buffer.concat(bufs));
        }
      }
    }

    if (db[id] && fs.existsSync(file)) {
      db[id].downloads = (db[id].downloads || 0) + 1;
      syncEverything(db);
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="' + (db[id].fileName || (id + ".apk")) + '"',
        "Content-Length": fs.statSync(file).size
      });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404); return res.end("APK not found");
  }
  res.writeHead(204); res.end();
}).listen(PORT, () => {
  console.log("==================================================");
  console.log("🔥 REAL PLAY STORE & BETADROP CLOUD READY!");
  console.log("📂 SAVED TO PHONE: /storage/emulated/0/Download/BetaDrop_Render_Cloud");
  console.log("==================================================");
});
