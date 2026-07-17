'use strict';

// End-to-end test: simulate one LTE module pushing a loco batch over HTTP
// to the running server. Usage:
//   BASE=http://localhost:8080 KEY=himnish_shed_key_2025 node scripts/demo_push.js

const BASE = process.env.BASE || 'http://localhost:8080';
const KEY = process.env.KEY || 'himnish_shed_key_2025';
const LOCO = process.env.LOCO || 'MC-201';
const SHED = process.env.SHED || 'SHED-02';

async function pushOnce() {
  const readings = [1, 2, 3, 4].map((n) => ({
    sensor_id: `${LOCO}-TM${n}`,
    tm_id: `TM${n}`,
    temperature: +(50 + Math.random() * 45).toFixed(1), // some will breach thresholds
    battery_health: 90 + Math.round(Math.random() * 10),
    signal_strength: 70 + Math.round(Math.random() * 30),
  }));
  const res = await fetch(`${BASE}/api/v1/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY },
    body: JSON.stringify({ loco_id: LOCO, shed_id: SHED, position: 1, readings }),
  });
  console.log(res.status, await res.json());
}

pushOnce().catch((e) => { console.error(e); process.exit(1); });
