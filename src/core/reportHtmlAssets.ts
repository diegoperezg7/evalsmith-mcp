/**
 * Stylesheet and page script of the HTML report, kept apart from the
 * generator so the script's CSP hash is computed over exactly this text.
 * The script builds the page from the embedded JSON with createElement and
 * textContent only; it never parses dataset text as HTML.
 *
 * The accent is the evalsmith orange. Pass and fail use green and rose so the
 * verdict colours stay distinct from the accent.
 */

const DARK = `
    --bg: #000000; --surface: #0c0a09; --surface-2: #161412; --border: #292524; --border-strong: #44403c;
    --text: #f5f5f4; --muted: #a8a29e; --accent: #ff8a3d; --accent-strong: #fdba74; --accent-soft: #2a1407;
    --pass: #4ade80; --fail: #fb7185; --neutral: #78716c; --track: #1c1917;
    --shadow: 0 1px 2px rgba(0,0,0,.6), 0 8px 24px rgba(0,0,0,.5);
    color-scheme: dark;`;

export const HTML_STYLE = String.raw`
:root {
  --bg: #ffffff; --surface: #ffffff; --surface-2: #fafaf9; --border: #e7e5e4; --border-strong: #d6d3d1;
  --text: #1c1917; --muted: #78716c; --accent: #c2410c; --accent-strong: #9a3412; --accent-soft: #fff7ed;
  --pass: #15803d; --fail: #e11d48; --neutral: #a8a29e; --track: #f5f5f4;
  --shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.05);
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --grad: linear-gradient(90deg, #ff8a3d, #c2410c);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${DARK}
  }
}
:root[data-theme="dark"] {${DARK}
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body { font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1280px; margin: 0 auto; padding: 28px 32px 64px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.noscript { padding: 24px; }
.mono { font-family: var(--mono); }
.num { font-variant-numeric: tabular-nums; }
.topbar { display: flex; align-items: center; gap: 14px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.brand-name { font-family: var(--mono); font-weight: 700; font-size: 18px; letter-spacing: -.01em; }
.brand-sub { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.topbar .meta { margin-left: auto; color: var(--muted); font-size: 12.5px; text-align: right; white-space: nowrap; }
.icon-btn { border: 1px solid var(--border); background: var(--surface); color: var(--text); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }
.icon-btn:hover { border-color: var(--accent); }
.icon-btn:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
section { margin-top: 28px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 12px; font-weight: 600; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
h2 .sub { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 12.5px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.pad { padding: 18px 20px; }
.note { color: var(--muted); font-size: 12.5px; margin: 10px 0 0; }
.pass-c { --v: var(--pass); } .fail-c { --v: var(--fail); } .neutral-c { --v: var(--neutral); } .accent-c { --v: var(--accent); }
.pill { display: inline-flex; justify-content: center; align-items: center; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; border-radius: 6px; padding: 2px 8px; color: var(--v); background: color-mix(in srgb, var(--v) 12%, transparent); border: 1px solid color-mix(in srgb, var(--v) 35%, transparent); white-space: nowrap; }

/* verdict and gates */
.hero { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: stretch; }
.verdict { padding: 22px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; }
.verdict::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--v); }
.verdict-label { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
.verdict-value { font-size: 46px; font-weight: 800; letter-spacing: -.02em; color: var(--v); line-height: 1.1; margin: 6px 0 8px; }
.verdict-note { color: var(--muted); font-size: 13px; margin: 2px 0; }
.gates { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.gate { padding: 14px 16px; border-top: 3px solid var(--v); }
.gate-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.gate-metric { font-family: var(--mono); font-weight: 700; font-size: 13px; overflow-wrap: anywhere; }
.gate-value { font-size: 28px; font-weight: 800; letter-spacing: -.02em; margin: 8px 0 2px; font-variant-numeric: tabular-nums; }
.gate-min { color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.gauge { position: relative; height: 8px; border-radius: 999px; background: var(--track); border: 1px solid var(--border); margin-top: 12px; }
.gauge .fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--v); }
.gauge .mark { position: absolute; top: -5px; bottom: -5px; width: 2px; margin-left: -1px; background: var(--text); border-radius: 1px; }
.empty { padding: 22px; color: var(--muted); }

/* retrieval */
.metrics { width: 100%; border-collapse: collapse; }
.metrics th, .metrics td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }
.metrics th { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; background: var(--surface-2); }
.metrics tr:last-child td { border-bottom: 0; }
.metrics td.k { font-family: var(--mono); font-weight: 700; width: 64px; white-space: nowrap; }
.bar { display: grid; grid-template-columns: minmax(80px, 1fr) auto; gap: 10px; align-items: center; }
.track { position: relative; height: 18px; }
.track .rail { position: absolute; left: 0; right: 0; top: 6px; height: 6px; border-radius: 999px; background: var(--track); border: 1px solid var(--border); }
.track .fill { position: absolute; left: 0; top: 6px; height: 6px; border-radius: 999px; background: var(--grad); }
.track .ci { position: absolute; top: 8px; height: 2px; background: var(--text); opacity: .55; }
.track .ci::before, .track .ci::after { content: ""; position: absolute; top: -5px; width: 2px; height: 12px; background: var(--text); }
.track .ci::before { left: -1px; } .track .ci::after { right: -1px; }
.track .mark { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--v); border-radius: 1px; }
.val { font-variant-numeric: tabular-nums; font-size: 13px; text-align: right; white-space: nowrap; }
.val small { display: block; color: var(--muted); font-size: 11px; }
.legend { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin-top: 12px; align-items: center; }
.legend i { display: inline-block; vertical-align: middle; margin-right: 6px; }
.legend .sw-fill { width: 18px; height: 6px; border-radius: 999px; background: var(--grad); }
.legend .sw-ci { width: 18px; height: 2px; background: var(--text); opacity: .6; }
.legend .sw-mark { width: 2px; height: 12px; background: var(--fail); }

/* comparison */
.cmp-row { display: grid; grid-template-columns: 36px minmax(140px, 220px) 1fr 190px; gap: 14px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border); }
.cmp-row:last-of-type { border-bottom: 0; }
.cmp-row.winner { background: var(--accent-soft); }
.rank { font-family: var(--mono); font-weight: 800; color: var(--muted); font-size: 15px; }
.winner .rank { color: var(--accent); }
.cfg { font-family: var(--mono); font-weight: 700; overflow-wrap: anywhere; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.badge { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #fff; background: var(--grad); border-radius: 6px; padding: 2px 7px; }
.plot { position: relative; height: 26px; }
.plot .axis { position: absolute; left: 0; right: 0; top: 12px; height: 2px; background: var(--border); }
.plot .ci { position: absolute; top: 9px; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 28%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); }
.plot .dot { position: absolute; top: 6px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--accent); }
.plot .zero { position: absolute; top: 2px; bottom: 2px; width: 2px; margin-left: -1px; background: var(--muted); }
.ticks { position: relative; height: 16px; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.ticks span { position: absolute; transform: translateX(-50%); }
.cmp-scale { display: grid; grid-template-columns: 36px minmax(140px, 220px) 1fr 190px; gap: 14px; padding: 0 20px 10px; }
.delta { display: grid; grid-template-columns: minmax(0, 1fr) minmax(200px, 360px); gap: 20px; align-items: center; padding: 16px 20px; border-top: 1px solid var(--border); background: var(--surface-2); border-radius: 0 0 14px 14px; }
.delta-text { font-size: 13px; }
.delta-text b { font-variant-numeric: tabular-nums; }

/* tool calls */
.seq { display: grid; grid-template-columns: minmax(0, 1fr) 150px minmax(0, 1fr); align-items: start; padding: 18px 20px; }
.seq-col h3 { margin: 0 0 10px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 600; }
.seq-col.right h3 { text-align: left; }
.node { height: 40px; margin-bottom: 10px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid var(--border); border-left: 4px solid var(--v); border-radius: 10px; background: var(--surface); }
.seq-col.left .node { border-left-width: 1px; border-right: 4px solid var(--v); }
.node .idx { font-family: var(--mono); color: var(--muted); font-size: 12px; min-width: 24px; }
.node .tool { font-family: var(--mono); font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.links { display: block; margin-top: 28px; overflow: visible; }
.links line { stroke-width: 2; }
.links .ok { stroke: var(--pass); }
.links .bad { stroke: var(--fail); stroke-dasharray: 5 4; }
.links circle { stroke: none; }
.reasons { margin: 0; padding: 14px 20px 16px 38px; border-top: 1px solid var(--border); font-size: 13px; }
.reasons li { margin: 4px 0; }
.reasons .mono { font-weight: 700; }

/* prompt regression */
.rates { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.rate { padding: 14px 16px; }
.rate-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.rate-value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; margin-top: 4px; color: var(--v, var(--text)); }
.cases { overflow: hidden; }
.cases-head, details.case > summary { display: grid; grid-template-columns: 110px minmax(0, 1fr) 96px 96px 170px 14px; gap: 12px; align-items: center; padding: 10px 16px; }
.cases-head { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 600; background: var(--surface-2); border-bottom: 1px solid var(--border); }
details.case { border-bottom: 1px solid var(--border); }
details.case:last-child { border-bottom: 0; }
details.case > summary { list-style: none; cursor: pointer; border-left: 4px solid var(--v); }
details.case > summary::-webkit-details-marker { display: none; }
details.case > summary:hover { background: var(--surface-2); }
details.case[open] > summary { background: var(--surface-2); }
.case-id { font-family: var(--mono); font-weight: 700; overflow-wrap: anywhere; }
.fails { color: var(--muted); font-size: 12.5px; }
.chev { color: var(--muted); transition: transform .15s; font-family: var(--mono); }
details[open] .chev { transform: rotate(90deg); }
.case-body { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 6px 20px 16px 20px; border-left: 4px solid var(--v); }
.side h4 { margin: 10px 0 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); display: flex; gap: 8px; align-items: center; }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { font-family: var(--mono); font-size: 12.5px; background: var(--surface-2); border: 1px solid var(--border); border-left: 3px solid var(--fail); border-radius: 8px; padding: 8px 10px; margin-bottom: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
.checks li.ok { border-left-color: var(--pass); color: var(--muted); font-family: inherit; }
.judge { grid-column: 1 / -1; border-left: 3px solid var(--accent); padding: 6px 10px; background: var(--accent-soft); border-radius: 0 8px 8px 0; font-size: 13px; }
footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 860px) {
  .wrap { padding: 20px 16px 48px; }
  .hero, .delta, .case-body { grid-template-columns: 1fr; }
  .rates { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cmp-row { grid-template-columns: 28px minmax(0, 1fr); }
  .cmp-row .plot, .cmp-row .val { grid-column: 1 / -1; }
  .cmp-scale { display: none; }
  .seq { grid-template-columns: minmax(0, 1fr) 60px minmax(0, 1fr); padding: 14px; }
  .cases-head { display: none; }
  details.case > summary { grid-template-columns: auto minmax(0, 1fr) 14px; }
  details.case > summary .side-pill, details.case > summary .fails { display: none; }
  .topbar { flex-wrap: wrap; }
}
`;

export const HTML_CLIENT = String.raw`
(function () {
  "use strict";
  var data = JSON.parse(document.getElementById("report-data").textContent);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) e.setAttribute(k, String(attrs[k]));
    return e;
  }
  function f4(v) { return v === null || v === undefined ? "n/a" : Number(v).toFixed(4); }
  function pct(v) { return (Number(v) * 100).toFixed(1) + "%"; }
  function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
  function pill(text, ok) { return el("span", "pill " + (ok === null ? "neutral-c" : ok ? "pass-c" : "fail-c"), text); }
  function section(title, sub) {
    var s = el("section");
    var h = add(el("h2"), document.createTextNode(title));
    if (sub) h.appendChild(el("span", "sub", sub));
    s.appendChild(h);
    return s;
  }
  var gateFor = {};
  data.gates.forEach(function (g) { gateFor[g.metric] = g; });

  // ------------------------------------------------------------ theme
  var root = document.documentElement;
  var themes = ["auto", "light", "dark"];
  var theme = "auto";
  var themeBtn = el("button", "icon-btn");
  themeBtn.type = "button";
  function applyTheme() {
    if (theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
    themeBtn.textContent = "Theme: " + theme;
  }
  themeBtn.addEventListener("click", function () {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    applyTheme();
  });

  // ------------------------------------------------------------ header
  var app = document.getElementById("app");
  var wrap = add(app, el("div", "wrap")).firstChild;
  var logo = svg("svg", { width: 40, height: 40, viewBox: "0 0 128 128", "aria-hidden": "true" });
  var grad = svg("linearGradient", { id: "tile", x1: 0, y1: 0, x2: 1, y2: 1 });
  add(grad, svg("stop", { offset: 0, "stop-color": "#FF8A3D" }), svg("stop", { offset: 1, "stop-color": "#C2410C" }));
  add(logo, add(svg("defs", {}), grad), svg("rect", { width: 128, height: 128, rx: 28, fill: "url(#tile)" }),
    svg("path", { d: "M46 36 L58 48 L84 22", fill: "none", stroke: "#FFFFFF", "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    svg("path", { fill: "#1C1917", d: "M18 60 C30 60 36 64 42 64 L106 64 C108 64 110 66 110 68 L110 74 C110 76 108 78 106 78 L94 78 C88 78 84 82 84 88 L84 92 L94 102 C95 103 94 106 92 106 L44 106 C42 106 41 103 42 102 L52 92 L52 88 C52 82 48 78 42 78 C30 78 22 70 18 60 Z" }),
    svg("rect", { x: 42, y: 64, width: 64, height: 4, rx: 2, fill: "#44403C" }));
  var parts = [];
  if (data.retrieval) parts.push("retrieval");
  if (data.comparison) parts.push("comparison");
  if (data.toolCalls) parts.push("tool calls");
  if (data.regression) parts.push("prompt regression");
  add(wrap, add(el("header", "topbar"),
    add(el("div", "brand"), logo, add(el("div"), el("div", "brand-name", "evalsmith"), el("div", "brand-sub", "Evaluation report · " + data.meta.name))),
    add(el("div", "meta"), el("div", null, "v" + data.meta.version), el("div", null, parts.join(" · ") || "no sections")),
    themeBtn));
  applyTheme();

  // ------------------------------------------------------------ verdict and gates
  var pass = data.meta.verdict === "pass";
  var hero = el("div", "hero");
  var verdict = add(el("div", "card verdict " + (pass ? "pass-c" : "fail-c")),
    el("div", "verdict-label", "Verdict"),
    el("div", "verdict-value", pass ? "PASS" : "FAIL"));
  if (pass) verdict.appendChild(el("p", "verdict-note", data.gates.length ? "Every gate passed and nothing regressed." : "No gates set and nothing regressed."));
  data.meta.reasons.forEach(function (r) { verdict.appendChild(el("p", "verdict-note", r)); });
  hero.appendChild(verdict);

  var gates = el("div", "gates");
  if (!data.gates.length) gates.appendChild(add(el("div", "card empty"), document.createTextNode("No gates. Add them under gates: in the suite file or with --fail-under metric=value.")));
  data.gates.forEach(function (g) {
    var c = add(el("div", "card gate " + (g.passed ? "pass-c" : "fail-c")),
      add(el("div", "gate-head"), el("span", "gate-metric", g.metric), pill(g.passed ? "pass" : "fail", g.passed)),
      el("div", "gate-value", f4(g.actual)),
      el("div", "gate-min", "min " + f4(g.threshold) + (g.actual === null ? " · no value: the section is missing" : "")));
    var gauge = el("div", "gauge");
    var fill = el("div", "fill"); fill.style.width = (100 * clamp01(g.actual)) + "%";
    var mark = el("div", "mark"); mark.style.left = (100 * clamp01(g.threshold)) + "%"; mark.title = "threshold " + f4(g.threshold);
    add(c, add(gauge, fill, mark));
    gates.appendChild(c);
  });
  hero.appendChild(gates);
  add(wrap, add(section("Verdict and gates", data.gates.length + " gate(s)"), hero));

  // ------------------------------------------------------------ retrieval
  function metricBar(name, iv) {
    var track = el("div", "track");
    var fill = el("div", "fill"); fill.style.width = (100 * clamp01(iv.value)) + "%";
    var ci = el("div", "ci");
    ci.style.left = (100 * clamp01(iv.low)) + "%";
    ci.style.width = (100 * (clamp01(iv.high) - clamp01(iv.low))) + "%";
    add(track, el("div", "rail"), fill, ci);
    var g = gateFor[name];
    if (g) {
      var m = el("div", "mark " + (g.passed ? "pass-c" : "fail-c"));
      m.style.left = (100 * clamp01(g.threshold)) + "%";
      m.title = "gate " + name + " >= " + f4(g.threshold);
      track.appendChild(m);
    }
    track.title = name + " " + f4(iv.value) + " [" + f4(iv.low) + ", " + f4(iv.high) + "]";
    var val = add(el("div", "val"), document.createTextNode(f4(iv.value)), el("small", null, "[" + f4(iv.low) + ", " + f4(iv.high) + "]"));
    return add(el("div", "bar"), track, val);
  }
  if (data.retrieval) {
    var r = data.retrieval;
    var conf = Math.round(r.confidence * 100);
    var sec = section("Retrieval", r.queries + " judged queries · " + conf + "% bootstrap intervals over queries (" + r.samples + " resamples)");
    var labels = { recall: "Recall", precision: "Precision", ndcg: "nDCG", hit_rate: "Hit rate" };
    var fams = Object.keys(r.families);
    var table = el("table", "metrics");
    var head = add(el("tr"), el("th", null, "k"));
    fams.forEach(function (f) { head.appendChild(el("th", null, labels[f] || f)); });
    add(table, add(el("thead"), head));
    var body = el("tbody");
    r.ks.forEach(function (k) {
      var tr = add(el("tr"), el("td", "k", "@" + k));
      fams.forEach(function (f) {
        var iv = r.families[f][String(k)];
        tr.appendChild(iv ? add(el("td"), metricBar(f + "@" + k, iv)) : el("td", null, "-"));
      });
      body.appendChild(tr);
    });
    if (r.mrr) {
      var mrrRow = add(el("tr"), el("td", "k", "MRR"));
      add(mrrRow, add(el("td"), metricBar("mrr", r.mrr)));
      for (var e = 1; e < fams.length; e++) mrrRow.appendChild(el("td"));
      body.appendChild(mrrRow);
    }
    var card = add(el("div", "card"), add(table, body));
    sec.appendChild(card);
    var legend = add(el("div", "legend"),
      add(el("span"), el("i", "sw-fill"), document.createTextNode("value")),
      add(el("span"), el("i", "sw-ci"), document.createTextNode(conf + "% interval")));
    if (data.gates.length) legend.appendChild(add(el("span"), el("i", "sw-mark"), document.createTextNode("gate threshold")));
    sec.appendChild(legend);
    var notes = [];
    if (r.missing.length) notes.push(r.missing.length + " judged quer" + (r.missing.length === 1 ? "y is" : "ies are") + " missing from the run and scored as empty: " + r.missing.join(", "));
    if (r.skipped.length) notes.push(r.skipped.length + " quer" + (r.skipped.length === 1 ? "y has" : "ies have") + " no relevant documents and " + (r.skipped.length === 1 ? "is" : "are") + " excluded: " + r.skipped.join(", "));
    notes.forEach(function (n) { sec.appendChild(el("p", "note", n)); });
    wrap.appendChild(sec);
  }

  // ------------------------------------------------------------ comparison
  if (data.comparison) {
    var c = data.comparison;
    var cpct = Math.round(c.confidence * 100);
    var csec = section("Configuration comparison", c.metric + " · paired bootstrap, " + c.samples + " resamples, seed " + c.seed + ", " + cpct + "% intervals");
    var lo = Math.min.apply(null, c.configs.map(function (x) { return x.low; }));
    var hi = Math.max.apply(null, c.configs.map(function (x) { return x.high; }));
    var min = Math.max(0, Math.floor(lo * 10) / 10), max = Math.min(1, Math.ceil(hi * 10) / 10);
    if (max - min < 0.1) { min = Math.max(0, min - 0.1); max = Math.min(1, max + 0.1); }
    function pos(v) { return (100 * (Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) + "%"; }
    var ccard = el("div", "card");
    var scale = el("div", "ticks");
    var steps = Math.round((max - min) * 10);
    var every = steps > 6 ? 2 : 1;
    for (var t = 0; t <= steps; t += every) {
      var v = min + t / 10;
      var tick = el("span", null, v.toFixed(1)); tick.style.left = pos(v); scale.appendChild(tick);
    }
    ccard.appendChild(add(el("div", "cmp-scale"), el("span"), el("span"), scale, el("span")));
    c.configs.forEach(function (row) {
      var win = row.name === c.winner;
      var plot = el("div", "plot");
      var ci = el("div", "ci"); ci.style.left = pos(row.low);
      ci.style.width = "calc(" + pos(row.high) + " - " + pos(row.low) + ")";
      var dot = el("div", "dot"); dot.style.left = pos(row.value);
      add(plot, el("div", "axis"), ci, dot);
      plot.title = row.name + ": " + f4(row.value) + " [" + f4(row.low) + ", " + f4(row.high) + "]";
      var name = add(el("div", "cfg"), document.createTextNode(row.name));
      if (win) name.appendChild(el("span", "badge", "winner"));
      ccard.appendChild(add(el("div", "cmp-row" + (win ? " winner" : "")),
        el("div", "rank", "#" + row.rank), name, plot,
        add(el("div", "val"), document.createTextNode(f4(row.value)), el("small", null, cpct + "% CI [" + f4(row.low) + ", " + f4(row.high) + "]"))));
    });
    var d = c.delta;
    var dmin = Math.min(0, d.low), dmax = Math.max(0, d.high);
    var span = (dmax - dmin) || 1;
    function dpos(x) { return (100 * (x - dmin) / span) + "%"; }
    var dplot = el("div", "plot");
    var dci = el("div", "ci"); dci.style.left = dpos(d.low); dci.style.width = (100 * (d.high - d.low) / span) + "%";
    var ddot = el("div", "dot"); ddot.style.left = dpos(d.value);
    var zero = el("div", "zero"); zero.style.left = dpos(0); zero.title = "zero";
    add(dplot, el("div", "axis"), dci, zero, ddot);
    dplot.title = "gap " + f4(d.value) + " [" + f4(d.low) + ", " + f4(d.high) + "]";
    var dtext = add(el("div", "delta-text"),
      add(el("div"), document.createTextNode("Gap "), el("b", "mono", c.winner), document.createTextNode(" − "), el("b", "mono", c.runnerUp), document.createTextNode(": "),
        el("b", null, (d.value >= 0 ? "+" : "") + f4(d.value)), document.createTextNode(" [" + f4(d.low) + ", " + f4(d.high) + "] "),
        pill(c.significant ? "significant" : "not significant", c.significant ? true : null)),
      el("p", "note", c.summary));
    ccard.appendChild(add(el("div", "delta"), dtext, dplot));
    add(wrap, add(csec, ccard));
  }

  // ------------------------------------------------------------ tool calls
  if (data.toolCalls) {
    var tc = data.toolCalls;
    var tsec = section("Agent tool calls", tc.order + " order · score " + f4(tc.score));
    var ROW = 50, MID = 20;
    var left = add(el("div", "seq-col left"), el("h3", null, "Expected"));
    var right = add(el("div", "seq-col right"), el("h3", null, "Actual trace"));
    tc.expected.forEach(function (s, i) {
      var n = add(el("div", "node " + (s.passed ? "pass-c" : "fail-c")), el("span", "idx", String(i + 1)), el("span", "tool", s.tool), pill(s.passed ? "match" : "miss", s.passed));
      n.title = s.passed ? s.tool + " matched call #" + (s.matchedIndex + 1) : s.reasons.join("; ");
      left.appendChild(n);
    });
    var callLabel = { matched: "match", mismatch: "wrong", unexpected: "extra", extra: "extra" };
    tc.calls.forEach(function (call, j) {
      var ok = call.status === "matched" ? true : call.status === "extra" ? null : false;
      var n = add(el("div", "node " + (ok === null ? "neutral-c" : ok ? "pass-c" : "fail-c")), el("span", "idx", "#" + (j + 1)), el("span", "tool", call.tool), pill(callLabel[call.status], ok));
      if (call.status === "extra") n.title = "Extra call, allowed in lax order";
      if (call.status === "unexpected") n.title = "Outside the expected sequence (strict order)";
      right.appendChild(n);
    });
    if (!tc.calls.length) right.appendChild(el("p", "note", "The trace has no calls."));
    var rows = Math.max(tc.expected.length, tc.calls.length, 1);
    var links = svg("svg", { class: "links", width: 150, height: rows * ROW, viewBox: "0 0 150 " + rows * ROW, "aria-hidden": "true" });
    tc.expected.forEach(function (s, i) {
      var j = s.matchedIndex;
      var bad = false;
      if (j === null && tc.order === "strict" && i < tc.calls.length) { j = i; bad = true; }
      if (j === null) return;
      var y1 = i * ROW + MID, y2 = j * ROW + MID;
      add(links, svg("line", { x1: 6, y1: y1, x2: 144, y2: y2, class: bad ? "bad" : "ok" }),
        svg("circle", { cx: 4, cy: y1, r: 4, fill: bad ? "var(--fail)" : "var(--pass)" }),
        svg("circle", { cx: 146, cy: y2, r: 4, fill: bad ? "var(--fail)" : "var(--pass)" }));
    });
    var tcard = add(el("div", "card"), add(el("div", "seq"), left, links, right));
    var misses = tc.expected.filter(function (s) { return !s.passed; });
    var extras = tc.calls.filter(function (x) { return x.status === "unexpected"; }).length;
    if (misses.length || extras) {
      var ul = el("ul", "reasons");
      tc.expected.forEach(function (s, i) {
        if (s.passed) return;
        ul.appendChild(add(el("li"), el("span", "mono", (i + 1) + ". " + s.tool), document.createTextNode(": " + s.reasons.join("; "))));
      });
      if (extras) ul.appendChild(el("li", null, extras + " call(s) after the expected sequence; strict order allows none."));
      tcard.appendChild(ul);
    }
    tsec.appendChild(tcard);
    tsec.appendChild(el("p", "note", tc.summary));
    wrap.appendChild(tsec);
  }

  // ------------------------------------------------------------ prompt regression
  if (data.regression) {
    var g = data.regression;
    var rsec = section("Prompt regression", g.cases + " golden case(s) · baseline vs. candidate");
    var regressed = g.perCase.filter(function (x) { return x.status === "regressed"; }).length;
    var improved = g.perCase.filter(function (x) { return x.status === "improved"; }).length;
    function rate(label, value, cls) {
      return add(el("div", "card rate " + (cls || "")), el("div", "rate-label", label), el("div", "rate-value", value));
    }
    var worse = g.candidatePassRate < g.baselinePassRate, better = g.candidatePassRate > g.baselinePassRate;
    add(rsec, add(el("div", "rates"),
      rate("Baseline pass rate", pct(g.baselinePassRate)),
      rate("Candidate pass rate", pct(g.candidatePassRate), worse ? "fail-c" : better ? "pass-c" : ""),
      rate("Regressions", String(regressed), regressed ? "fail-c" : "pass-c"),
      rate("Improvements", String(improved), improved ? "pass-c" : "")));
    var cases = add(el("div", "card cases"), add(el("div", "cases-head"),
      el("span", null, "Status"), el("span", null, "Case"), el("span", null, "Baseline"), el("span", null, "Candidate"), el("span", null, "Failed checks"), el("span")));
    var order = { regressed: 0, fail: 1, improved: 2, pass: 3 };
    var sorted = g.perCase.slice().sort(function (a, b) { return order[a.status] - order[b.status]; });
    var statusCls = { regressed: "fail-c", fail: "neutral-c", improved: "pass-c", pass: "pass-c" };
    sorted.forEach(function (row) {
      var det = el("details", "case " + statusCls[row.status]);
      det.setAttribute("data-case", row.id);
      var nfail = row.baseline.failures.length + row.candidate.failures.length;
      var bp = pill(row.baseline.passed ? "pass" : "fail", row.baseline.passed); bp.className += " side-pill";
      var cp = pill(row.candidate.passed ? "pass" : "fail", row.candidate.passed); cp.className += " side-pill";
      add(det, add(el("summary"),
        el("span", "pill " + statusCls[row.status], row.status),
        el("span", "case-id", row.id), bp, cp,
        el("span", "fails", nfail ? "baseline " + row.baseline.failures.length + " · candidate " + row.candidate.failures.length : "none"),
        el("span", "chev", ">")));
      var bodyEl = el("div", "case-body");
      [["Baseline", row.baseline], ["Candidate", row.candidate]].forEach(function (p) {
        var list = el("ul", "checks");
        if (!p[1].failures.length) list.appendChild(el("li", "ok", "All checks passed."));
        p[1].failures.forEach(function (f) { list.appendChild(el("li", null, f)); });
        bodyEl.appendChild(add(el("div", "side"), add(el("h4"), document.createTextNode(p[0]), pill(p[1].passed ? "pass" : "fail", p[1].passed)), list));
      });
      if (row.judge) bodyEl.appendChild(el("div", "judge", "LLM judge (informational): prefers " + row.judge.preferred + ". " + row.judge.reason));
      det.appendChild(bodyEl);
      cases.appendChild(det);
    });
    rsec.appendChild(cases);
    if (g.judge) rsec.appendChild(el("p", "note", "LLM judge " + g.judge.model + " (informational, never decides the verdict): baseline " + g.judge.baseline + ", candidate " + g.judge.candidate + ", tie " + g.judge.tie + "."));
    rsec.appendChild(el("p", "note", g.summary));
    wrap.appendChild(rsec);
  }

  if (!parts.length) wrap.appendChild(add(el("section"), el("div", "card empty", "The suite has no sections to show.")));

  var repo = el("a", null, "github.com/diegoperezg7/evalsmith-mcp");
  repo.href = "https://github.com/diegoperezg7/evalsmith-mcp"; repo.target = "_blank"; repo.rel = "noopener noreferrer";
  add(wrap, add(el("footer"), el("span", null, "Generated by evalsmith " + data.meta.version + ". Deterministic metrics; dataset text is shown as data."), repo));
})();
`;
