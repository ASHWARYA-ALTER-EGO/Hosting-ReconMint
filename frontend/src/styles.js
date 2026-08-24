// All custom (non-Tailwind) CSS from the three source pages, merged once.
export const SHARED_STYLES = `
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background-color: #fcfcfc; color: #1e293b; }
  .custom-shadow { box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06); }
  .premium-shadow { box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05); }
  .inset-shadow { box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.03); }
  .gradient-btn { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); }
  .gradient-btn:hover { background: linear-gradient(135deg, #334155 0%, #1e293b 100%); }

  .sidebar-item { display:flex; align-items:center; padding:0.75rem 1rem; color:#64748b;
    font-weight:500; border-radius:0.75rem; margin-bottom:0.25rem; transition:all 0.2s ease;
    cursor:pointer; }
  .sidebar-item:hover { background:#f8fafc; color:#334155; }
  .sidebar-item.active { background:#f1f5f9; color:#0f172a; font-weight:600; }
  .sidebar-item i { width:1.5rem; margin-right:0.75rem; text-align:center; font-size:1.05rem; }
  .badge { font-size:0.6rem; padding:0.15rem 0.5rem; border-radius:9999px; background:transparent;
    border:1px solid #e2e8f0; color:#94a3b8; margin-left:auto; text-transform:uppercase;
    font-weight:500; letter-spacing:0.05em; }

  .file-card { border:1px solid #f1f5f9; border-radius:1rem; padding:1.25rem; display:flex;
    align-items:center; background:white; margin-bottom:1rem;
    box-shadow:0 4px 6px -1px rgba(0,0,0,0.02); transition:transform 0.2s, box-shadow 0.2s; }
  .file-card:hover { transform:translateY(-2px); box-shadow:0 10px 15px -3px rgba(0,0,0,0.03); }
  .file-icon { width:3.5rem; height:3.5rem; border-radius:0.75rem; display:flex; align-items:center;
    justify-content:center; margin-right:1.25rem; font-size:1.25rem; background:#f8fafc;
    border:1px solid #f1f5f9; }
  .file-icon.blue { color:#3b82f6; } .file-icon.green { color:#10b981; } .file-icon.purple { color:#8b5cf6; }
  .status-badge { padding:0.25rem 0.75rem; border-radius:9999px; font-size:0.75rem; font-weight:500;
    background:#ecfdf5; color:#059669; border:1px solid #d1fae5; display:inline-flex; align-items:center; }
  .status-badge.invalid { background:#fff1f2; color:#e11d48; border-color:#ffe4e6; }
  .step-line { flex:1; height:1px; background:#cbd5e1; margin:0 16px; }
  .step-line.active { background:#0f172a; }

  /* Waterfall */
  .waterfall-container { display:flex; align-items:flex-end; justify-content:space-between;
    height:240px; padding-top:40px; position:relative; }
  .waterfall-bar-wrapper { display:flex; flex-direction:column; align-items:center; position:relative;
    flex:1; height:100%; justify-content:flex-end; }
  .waterfall-bar { width:44px; border-radius:4px; position:relative; cursor:pointer; transition:opacity 0.2s; }
  .waterfall-bar:hover { opacity:0.8; }
  .connector { position:absolute; border-top:1px dashed #cbd5e1; width:100%; left:50%; z-index:0; }
  .bar-value { position:absolute; top:-24px; width:100%; text-align:center; font-size:12px;
    font-weight:600; color:#334155; }
  .wf-tooltip { visibility:hidden; opacity:0; position:absolute; bottom:calc(100% + 28px); left:50%;
    transform:translateX(-50%); background:#1e293b; color:white; text-align:center; padding:6px 10px;
    border-radius:4px; font-size:11px; white-space:nowrap; z-index:50; transition:opacity 0.2s;
    box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); pointer-events:none; }
  .wf-tooltip::after { content:""; position:absolute; top:100%; left:50%; margin-left:-5px;
    border-width:5px; border-style:solid; border-color:#1e293b transparent transparent transparent; }
  .waterfall-bar-wrapper:hover .wf-tooltip { visibility:visible; opacity:1; }

  .glass-panel { background:rgba(255,255,255,0.9); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); }
  ::-webkit-scrollbar { width:6px; height:6px; }
  ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:10px; }
  ::-webkit-scrollbar-thumb:hover { background:#94a3b8; }

  @keyframes toastIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .toast { animation: toastIn 0.25s ease; }
  @keyframes countUp { from { opacity:0; } to { opacity:1; } }
`;
