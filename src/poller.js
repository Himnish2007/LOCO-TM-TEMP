'use strict';

const config = require('./config');

// ---------------------------------------------------------------------------
// RUT200 pull poller.
//
// For every loco that has poll_enabled = true and a rut200_ip configured, the
// server periodically GETs the RUT200's local data endpoint and ingests the
// readings. This is the "data through RUT200 via IP address" path, an
// alternative to the RUT200 pushing to /api/v1/ingest.
//
// Expected RUT200 JSON response (any of these shapes):
//   { "readings": [ { "sensor_id": "...", "tm_id": "TM1", "temperature": 58.4,
//                      "battery_health": 96, "signal_strength": 82 }, ... ] }
//   or a bare array of the same reading objects.
//
// NETWORKING NOTE: the server must be able to reach rut200_ip. On a cloud host
// (Railway) that means a public/static IP, DDNS or VPN/tunnel to the router.
// On an on-prem/LAN server the private 192.168.x.x address works directly.
// ---------------------------------------------------------------------------

function startPoller(store) {
  if (!config.POLL_INTERVAL) { console.log('[poller] disabled (POLL_INTERVAL=0)'); return () => {}; }

  async function pollLoco(c) {
    const url = `http://${c.rut200_ip}:${c.rut200_port || 80}${c.rut200_path || '/readings'}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const readings = Array.isArray(data) ? data : (data.readings || []);
      let n = 0;
      for (const r of readings) {
        if (!r.sensor_id || r.temperature == null) continue;
        store.ingestReading(Object.assign({ loco_id: c.loco_id, sensor_type: 'wireless' }, r));
        n++;
      }
      if (n) console.log(`[poller] ${c.loco_id} @ ${c.rut200_ip}: ${n} readings`);
    } catch (e) {
      console.warn(`[poller] ${c.loco_id} @ ${c.rut200_ip} failed: ${e.message}`);
    } finally {
      clearTimeout(t);
    }
  }

  async function tick() {
    const locos = store.pollableLocos();
    for (const c of locos) await pollLoco(c);
  }

  const interval = setInterval(tick, config.POLL_INTERVAL * 1000);
  console.log(`[poller] polling RUT200-configured locos every ${config.POLL_INTERVAL}s`);
  return () => clearInterval(interval);
}

module.exports = { startPoller };
