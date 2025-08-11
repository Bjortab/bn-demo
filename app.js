:root{
  --primary:#6366F1;
  --secondary:#06B6D4;
  --accent:#22C55E;
  --text:#0b1220;
  --muted:#667085;
  --bg:#ffffff;
  --panel:#f8fafc;
  --border:#e5e7eb;
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: var(--panel); color: var(--text); }

.topbar { position: sticky; top: 0; background: #0f172a; color: #fff; padding: 12px 16px; box-shadow: 0 2px 8px rgba(0,0,0,.25); z-index: 10; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing:.2px; }
.brand .name { font-size: 18px; }
.tag { font-size: 12px; background: var(--accent); color: #0a0a0a; border-radius: 6px; padding: 2px 6px; margin-left: 8px; }
.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.tab { background: #1f2937; color: #d1d5db; border: 1px solid #334155; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
.tab.active { background: #e5e7eb; color: #111827; border-color: #e5e7eb; }

main { padding: 20px; max-width: 980px; margin: 0 auto; }
.hero { margin-bottom: 20px; }
.card { background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,.05); }

label { display: grid; gap: 6px; margin: 10px 0; }
button { border: 1px solid #11182720; background: #111827; color: white; padding: 8px 12px; border-radius: 10px; cursor: pointer; }
button:hover { opacity: .95; }
.status { margin-left: 10px; font-size: 12px; color: #059669; }

.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.panel { display: none; }
.panel.active { display: block; }
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
input[type="search"], select, input[type='color'] { padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; width: 100%; background: #fff; }
.actions { display: flex; gap: 8px; margin-top: 8px; }

footer.footer { padding: 24px; text-align: center; color: #6b7280; }
dialog { border: none; border-radius: 12px; padding: 0; max-width: 720px; width: 95vw; }
dialog::backdrop { background: rgba(0,0,0,.3); backdrop-filter: blur(2px); }

.theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; padding-top: 8px; }
