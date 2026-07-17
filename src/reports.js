'use strict';

const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// Report generation: real .xlsx (ExcelJS) + printable HTML (browser -> PDF).
// All reports operate on the caller's SCOPED sensor list, so a user only ever
// exports their assigned locos (tender: export per assigned asset).
// ---------------------------------------------------------------------------

const TYPES = {
  readings: 'Live Readings Report',
  alarms: 'Alarm Report',
  'sensor-health': 'Sensor Health Report',
  'loco-health': 'LOCO Health Report',
  'shed-health': 'Shed Health Report',
};

function rowsFor(type, store, sensors, scope) {
  const cls = (s) => store.classify(s.status === 'offline' ? null : s.temperature);
  if (type === 'readings') {
    return {
      head: ['Sensor', 'TM', 'LOCO', 'Shed', 'Temp (C)', 'Status', 'Class', 'Last Update'],
      body: sensors.map((s) => [s.sensor_id, s.tm_id || '', s.loco_id || '', s.shed_id || '',
        s.temperature == null ? '' : s.temperature, s.status, cls(s), s.last_update]),
    };
  }
  if (type === 'alarms') {
    let alerts = store.alerts.filter((a) => scope.all || (a.loco_id && scope.locos.has(a.loco_id)));
    return {
      head: ['#', 'Severity', 'Shed', 'LOCO', 'TM', 'Message', 'Raised', 'State', 'Acknowledged By'],
      body: alerts.slice(0, 1000).map((a) => [a.id, a.severity, a.shed_id || '', a.loco_id || '',
        a.tm_id || '', a.message, a.at, a.state, a.acknowledged_by || '']),
    };
  }
  if (type === 'sensor-health') {
    const hi = healthIndex(store, sensors, scope);
    return {
      head: ['Sensor', 'LOCO', 'Shed', 'Temp (C)', 'Status', 'Health Score'],
      body: hi.sensors.map((s) => [s.sensor_id, s.loco_id || '', s.shed_id || '', s.temperature == null ? '' : s.temperature,
        s.status, s.score]),
    };
  }
  if (type === 'loco-health') {
    const hi = healthIndex(store, sensors, scope);
    return { head: ['LOCO', 'Shed', 'Sensors', 'Avg Temp (C)', 'Worst Class', 'Health Score'],
      body: hi.locos.map((c) => [c.loco_id, c.shed_id || '', c.count, c.avg_temp == null ? '' : c.avg_temp, c.worst, c.score]) };
  }
  if (type === 'shed-health') {
    const hi = healthIndex(store, sensors, scope);
    return { head: ['Shed', 'Locos', 'Sensors', 'Avg Temp (C)', 'Health Score'],
      body: hi.sheds.map((e) => [e.shed_id, e.locos, e.count, e.avg_temp == null ? '' : e.avg_temp, e.score]) };
  }
  return { head: ['(unknown report type)'], body: [] };
}

// ---- Health Index (0-100) --------------------------------------------------
function sensorScore(store, s) {
  if (s.status === 'offline' || s.temperature == null) return 40; // offline penalty
  const cls = store.classify(s.temperature);
  let score = 100;
  if (cls === 'warning') score = 75;
  else if (cls === 'high') score = 55;
  else if (cls === 'critical') score = 25;
  if (s.battery_health != null && s.battery_health <= 20) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function healthIndex(store, sensors, scope) {
  const sensorsOut = sensors.map((s) => Object.assign({}, s, { score: sensorScore(store, s) }));
  const byLoco = new Map(), byShed = new Map(), byDepot = new Map();
  for (const s of sensorsOut) {
    if (s.loco_id) { if (!byLoco.has(s.loco_id)) byLoco.set(s.loco_id, []); byLoco.get(s.loco_id).push(s); }
  }
  const rank = { normal: 0, offline: 1, warning: 2, high: 3, critical: 4 };
  const rankName = ['normal', 'offline', 'warning', 'high', 'critical'];
  const locos = [...byLoco.entries()].map(([loco_id, arr]) => {
    const shed_id = arr[0].shed_id || null;
    const temps = arr.filter((s) => s.temperature != null && s.status !== 'offline').map((s) => s.temperature);
    const avg = temps.length ? +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;
    const worst = rankName[Math.max.apply(null, arr.map((s) => rank[store.classify(s.status === 'offline' ? null : s.temperature)] || 0))];
    const score = Math.round(arr.reduce((a, s) => a + s.score, 0) / arr.length);
    if (shed_id) { if (!byShed.has(shed_id)) byShed.set(shed_id, []); byShed.get(shed_id).push({ score, avg, count: arr.length }); }
    return { loco_id, shed_id, count: arr.length, avg_temp: avg, worst, score };
  }).sort((a, b) => a.score - b.score);
  const sheds = [...byShed.entries()].map(([shed_id, arr]) => {
    const score = Math.round(arr.reduce((a, c) => a + c.score, 0) / arr.length);
    const temps = arr.filter((c) => c.avg != null).map((c) => c.avg);
    const avg = temps.length ? +(temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;
    return { shed_id, locos: arr.length, count: arr.reduce((a, c) => a + c.count, 0), avg_temp: avg, score };
  }).sort((a, b) => a.score - b.score);
  const fleet = sheds.length ? Math.round(sheds.reduce((a, e) => a + e.score, 0) / sheds.length)
    : (locos.length ? Math.round(locos.reduce((a, c) => a + c.score, 0) / locos.length) : 100);
  return { sensors: sensorsOut, locos, sheds, fleet };
}

async function toXlsx(type, store, sensors, scope) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIMNISH Loco Traction Motor Monitoring';
  const ws = wb.addWorksheet((TYPES[type] || 'Report').slice(0, 30));
  ws.mergeCells('A1', 'E1');
  ws.getCell('A1').value = 'Loco Traction Motor Temperature Monitoring System';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = (TYPES[type] || 'Report') + ' — generated ' + new Date().toLocaleString('en-GB');
  ws.getCell('A2').font = { italic: true, size: 10 };
  const { head, body } = rowsFor(type, store, sensors, scope);
  const headerRow = ws.addRow([]);
  const hr = ws.addRow(head);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }; });
  body.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => { let m = 10; col.eachCell({ includeEmpty: true }, (c) => { m = Math.max(m, String(c.value == null ? '' : c.value).length + 2); }); col.width = Math.min(40, m); });
  return wb.xlsx.writeBuffer();
}

function esc(v) { return String(v == null ? '' : v).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function toHtml(type, store, sensors, scope) {
  const { head, body } = rowsFor(type, store, sensors, scope);
  const title = TYPES[type] || 'Report';
  const rows = body.map((r) => '<tr>' + r.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}
.sub{color:#555;font-size:12px;margin:4px 0 16px}table{border-collapse:collapse;width:100%;font-size:12px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#0e7490;color:#fff}
tr:nth-child(even) td{background:#f4f7fa}.foot{margin-top:16px;font-size:11px;color:#777}
@media print{.noprint{display:none}}</style></head><body>
<h1>Loco Traction Motor Temperature Monitoring System</h1>
<div class="sub">${esc(title)} · generated ${new Date().toLocaleString('en-GB')} · ${body.length} rows</div>
<button class="noprint" onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;background:#0e7490;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
<table><thead><tr>${head.map((h) => '<th>' + esc(h) + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table>
<div class="foot">HIMNISH LIMITED · Confidential · Railway asset monitoring report</div>
<script>setTimeout(function(){window.print&&window.print();},400)</script></body></html>`;
}

module.exports = { TYPES, toXlsx, toHtml, healthIndex, buildHistory, toHistoryXlsx, toHistoryHtml };

// ---- Historical (date-range, per-loco) reports ---------------------------
function buildHistory(rows) {
  // Pivot by timestamp: each push writes all TMs with the same ts.
  const tmCols = [...new Set(rows.map((r) => r.tm_id || r.sensor_id))].sort();
  const byTs = new Map();
  for (const r of rows) {
    const k = new Date(r.ts).toISOString().slice(0, 19); // group by second (one push = one row)
    if (!byTs.has(k)) byTs.set(k, {});
    byTs.get(k)[r.tm_id || r.sensor_id] = r.temperature == null ? null : Number(r.temperature);
  }
  const table = [...byTs.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ts, o]) => ({ ts, values: tmCols.map((c) => (o[c] == null ? null : o[c])) }));
  // Summary per TM
  const summary = tmCols.map((c, i) => {
    const vals = table.map((r) => r.values[i]).filter((v) => v != null);
    const min = vals.length ? Math.min(...vals) : null;
    const max = vals.length ? Math.max(...vals) : null;
    const avg = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
    return { tm: c, samples: vals.length, min, max, avg };
  });
  return { tmCols, table, summary };
}

async function toHistoryXlsx(loco, from, to, rows) {
  const { tmCols, table, summary } = buildHistory(rows);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIMNISH Loco Traction Motor Monitoring';
  const info = wb.addWorksheet('Summary');
  info.getCell('A1').value = 'Loco TM — Historical Report';
  info.getCell('A1').font = { bold: true, size: 14 };
  info.getCell('A2').value = `Loco: ${loco}    Period: ${from.toLocaleString('en-GB')} → ${to.toLocaleString('en-GB')}`;
  info.getCell('A3').value = `Samples: ${table.length}    Generated: ${new Date().toLocaleString('en-GB')}`;
  info.addRow([]);
  const sh = info.addRow(['Traction Motor', 'Samples', 'Min °C', 'Max °C', 'Avg °C']);
  sh.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sh.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }; });
  summary.forEach((s) => info.addRow([s.tm, s.samples, s.min, s.max, s.avg]));
  info.columns.forEach((col) => { col.width = 16; });

  const ws = wb.addWorksheet('Readings');
  const head = ['Timestamp', ...tmCols];
  const hr = ws.addRow(head);
  hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }; });
  table.forEach((r) => ws.addRow([new Date(r.ts).toLocaleString('en-GB'), ...r.values.map((v) => (v == null ? '' : v))]));
  ws.columns.forEach((col) => { col.width = 20; });
  return wb.xlsx.writeBuffer();
}

function toHistoryHtml(loco, from, to, rows) {
  const { tmCols, table, summary } = buildHistory(rows);
  const sumRows = summary.map((s) => `<tr><td>${esc(s.tm)}</td><td>${s.samples}</td><td>${s.min == null ? '—' : s.min}</td><td>${s.max == null ? '—' : s.max}</td><td>${s.avg == null ? '—' : s.avg}</td></tr>`).join('');
  const dataRows = table.map((r) => `<tr><td>${esc(new Date(r.ts).toLocaleString('en-GB'))}</td>${r.values.map((v) => '<td>' + (v == null ? '—' : esc(v)) + '</td>').join('')}</tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historical Report ${esc(loco)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0}
.sub{color:#555;font-size:12px;margin:4px 0 16px}table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:20px}
th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#0e7490;color:#fff}
tr:nth-child(even) td{background:#f4f7fa}@media print{.noprint{display:none}}</style></head><body>
<h1>Loco TM — Historical Report</h1>
<div class="sub">Loco <b>${esc(loco)}</b> · ${esc(from.toLocaleString('en-GB'))} → ${esc(to.toLocaleString('en-GB'))} · ${table.length} samples · generated ${new Date().toLocaleString('en-GB')}</div>
<button class="noprint" onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;background:#0e7490;color:#fff;border:none;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
<h3>Summary</h3><table><thead><tr><th>Traction Motor</th><th>Samples</th><th>Min °C</th><th>Max °C</th><th>Avg °C</th></tr></thead><tbody>${sumRows}</tbody></table>
<h3>Readings</h3><table><thead><tr><th>Timestamp</th>${tmCols.map((c) => '<th>' + esc(c) + '</th>').join('')}</tr></thead><tbody>${dataRows}</tbody></table>
<div style="font-size:11px;color:#777">HIMNISH LIMITED · Confidential</div>
<script>setTimeout(function(){window.print&&window.print();},400)</script></body></html>`;
}
