'use strict';

const express = require('express');
const config = require('./config');

// ---------------------------------------------------------------------------
// Himnish-controlled ingestion API. One LTE module / RUT200 per motor loco
// POSTs its loco's readings here, authenticated with X-API-Key (RAIP family).
// Accepts a single reading or a loco batch (recommended).
// ---------------------------------------------------------------------------

function ingestRouter(store) {
  const router = express.Router();

  const apiKeyGate = (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key !== config.DATA_API_KEY) return res.status(401).json({ ok: false, error: 'Invalid API key' });
    next();
  };

  // A field RUT pulls its own config from here (self-update). Auth with the
  // shared bootstrap key so the ingest key can be rotated centrally later.
  router.get('/device-config', (req, res) => {
    const key = req.headers['x-bootstrap-key'] || req.query.key;
    if (key !== config.BOOTSTRAP_KEY) return res.status(401).json({ ok: false, error: 'Invalid bootstrap key' });
    const deviceId = req.query.device || req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ ok: false, error: 'device id required' });
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const cfg = store.deviceConfig(deviceId, ip);
    if (!cfg) return res.status(404).json({ ok: false, error: 'Device not registered — add it in Admin → Field Devices', device_id: deviceId });
    res.json(cfg);
  });

  function validateReading(r, ctx) {
    if (!r || typeof r !== 'object') return 'reading must be an object';
    if (!r.sensor_id) return 'sensor_id required';
    if (!(r.loco_id || ctx.loco_id)) return `loco_id required (sensor ${r.sensor_id})`;
    const t = Number(r.temperature);
    if (r.temperature == null || !Number.isFinite(t)) return `temperature must be numeric (sensor ${r.sensor_id})`;
    // Reject clearly faulty readings (disconnected/short RTD). Tender range 0–120 °C;
    // a generous window is allowed, anything outside is treated as a sensor fault.
    if (t < -40 || t > 250) return `temperature out of range: ${t} (sensor ${r.sensor_id})`;
    return null;
  }

  router.post('/ingest', apiKeyGate, (req, res) => {
    const body = req.body || {};
    const ctx = { loco_id: body.loco_id, shed_id: body.shed_id };
    let readings;
    if (Array.isArray(body.readings)) readings = body.readings;
    else if (body.sensor_id) readings = [body];
    else return res.status(400).json({ ok: false, error: 'Send a single reading or a readings[] batch' });

    const accepted = [], errors = [];
    for (const raw of readings) {
      const merged = Object.assign({ loco_id: ctx.loco_id, shed_id: ctx.shed_id, position: body.position, sensor_type: 'wireless', ts: body.ts || body.timestamp }, raw);
      const err = validateReading(merged, ctx);
      if (err) { errors.push(err); continue; }
      accepted.push(store.ingestReading(merged).sensor_id);
    }
    const status = errors.length && !accepted.length ? 400 : 200;
    // Optional device/comm telemetry from the LTE module / concentrator.
    if (ctx.loco_id && (body.rssi != null || body.packet_loss != null || body.lte_signal != null ||
        body.network != null || body.data_usage != null || body.ip != null ||
        body.latency != null || body.retry_count != null || body.checksum_failures != null)) {
      store.updateComm(ctx.loco_id, { rssi: body.rssi, packet_loss: body.packet_loss,
        lte_signal: body.lte_signal, network: body.network, data_usage: body.data_usage, ip: body.ip,
        latency: body.latency, retry_count: body.retry_count, checksum_failures: body.checksum_failures });
    }
    return res.status(status).json({ ok: accepted.length > 0, accepted: accepted.length,
      sensor_ids: accepted, errors, server_time: new Date().toISOString() });
  });

  router.get('/ping', apiKeyGate, (req, res) => res.json({ ok: true, server_time: new Date().toISOString() }));

  // ---------------------------------------------------------------------
  // Legacy-compatible push route for the existing himnish_push.lua RUT200
  // script. That script is NOT modified — it POSTs exactly this shape:
  //   { "apiKey": "...", "coachId": "WAP7-30211", "motors": [12 values], "ts": "..." }
  // motors[] order (fixed, matches the lua register mapping):
  //   [TM1-DE, TM1-NDE, TM2-DE, TM2-NDE, TM3-DE, TM3-NDE,
  //    TM4-DE, TM4-NDE, TM5-DE, TM5-NDE, TM6-DE, TM6-NDE]
  // ---------------------------------------------------------------------
  const TM_LABELS = ['TM1-DE', 'TM1-NDE', 'TM2-DE', 'TM2-NDE', 'TM3-DE', 'TM3-NDE',
    'TM4-DE', 'TM4-NDE', 'TM5-DE', 'TM5-NDE', 'TM6-DE', 'TM6-NDE'];

  router.post('/push', (req, res) => {
    const body = req.body || {};
    if (body.apiKey !== config.PUSH_API_KEY) {
      return res.status(401).json({ ok: false, error: 'Invalid API key' });
    }
    const locoId = body.coachId; // field name kept exactly as the lua script sends it
    if (!locoId) return res.status(400).json({ ok: false, error: 'coachId required' });
    if (!Array.isArray(body.motors) || body.motors.length === 0) {
      return res.status(400).json({ ok: false, error: 'motors[] required' });
    }

    // Auto-register the loco on first push so a new WAP-7/WAG-9/etc. locomotive
    // starts appearing on the dashboard the moment its RUT200 script goes live —
    // no manual Admin step required (matches how field devices behave today).
    if (!store.locos.has(locoId)) {
      store.upsertLoco({ loco_id: locoId, name: locoId, shed_id: body.shed_id || null });
    }

    const ts = body.ts || new Date().toISOString();
    const accepted = [], errors = [];
    body.motors.forEach((val, i) => {
      const label = TM_LABELS[i] || `TM${Math.floor(i / 2) + 1}-${i % 2 === 0 ? 'DE' : 'NDE'}`;
      const t = Number(val);
      if (!Number.isFinite(t) || t < -40 || t > 250) { errors.push(`bad value at index ${i}: ${val}`); return; }
      const reading = {
        sensor_id: `${locoId}_${label}`, loco_id: locoId, tm_id: label,
        temperature: t, sensor_type: 'wired', ts,
      };
      accepted.push(store.ingestReading(reading).sensor_id);
    });

    return res.status(accepted.length ? 200 : 400).json({
      ok: accepted.length > 0, accepted: accepted.length, sensor_ids: accepted, errors,
      server_time: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = { ingestRouter };
