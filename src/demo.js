'use strict';

// DEMO_MODE: seeds demo users (with scoped asset assignments to show per-user
// visibility) and generates synthetic readings so the dashboard is populated
// without live hardware.

function seedDemoUsers(store) {
  const demo = [
    { username: 'hq', password: 'hq@2025', role: 'railway_hq' },
    { username: 'depot', password: 'depot@2025', role: 'depot_admin', depot_id: 'DEP-MMCT' },
    { username: 'engineer', password: 'eng@2025', role: 'maintenance_eng', depot_id: 'DEP-MMCT' },
    { username: 'viewer', password: 'view@2025', role: 'observer' },
  ];
  demo.forEach((u) => { if (!store.getUser(u.username)) store.seedUser(u); });
}

function startDemo(store) {
  const shedCount = Number(process.env.DEMO_SHEDS || 2);
  const shedNames = ['Ghaziabad Loco Shed', 'Tughlakabad Loco Shed', 'Kanpur Loco Shed', 'Mughalsarai Loco Shed'];
  const types = ['WAP-7', 'WAG-9', 'WAM-4'];

  const sensors = [];
  let locoSeq = 30201;
  for (let e = 1; e <= shedCount; e++) {
    const shed_id = `SHED-${String(e).padStart(2, '0')}`;
    store.upsertShed({ shed_id, name: shedNames[e - 1] || shed_id, depot_id: 'DEP-NR' });
    for (let n = 1; n <= 3; n++) {
      const type = types[(e + n) % types.length];
      const loco_id = `${type}-${locoSeq++}`;
      store.upsertLoco({ loco_id, name: loco_id, architecture: 'wired_modbus', data_source: 'rest_push' });
      store.assignLoco({ loco_id, shed_id, position: n, user: 'demo-seed', reason: 'initial' });
      // 6 traction motors x DE/NDE = 12 fixed points per loco, same layout as the real RUT200 push.
      for (let tm = 1; tm <= 6; tm++) {
        for (const end of ['DE', 'NDE']) {
          const tm_id = `TM${tm}-${end}`;
          sensors.push({ sensor_id: `${loco_id}_${tm_id}`, tm_id, loco_id,
            base: 62 + Math.random() * 18, drift: 0, hot: Math.random() < 0.05,
            ramp: (e === 1 && n === 1 && tm === 1 && end === 'DE') ? 0 : undefined });
        }
      }
    }
  }

  // Demonstrate scoping: engineer assigned only shed 2; viewer assigned one loco.
  seedDemoUsers(store);
  const secondShed = shedCount >= 2 ? `SHED-02` : null;
  if (secondShed) store.setUserAssets('engineer', { sheds: [secondShed], locos: [] }, 'demo-seed');
  const firstLoco = sensors[0] ? sensors[0].loco_id : null;
  if (firstLoco) store.setUserAssets('viewer', { sheds: [], locos: [firstLoco] }, 'demo-seed');

  function tick() {
    for (const s of sensors) {
      s.drift += (Math.random() - 0.48) * 1.5;
      s.drift = Math.max(-6, Math.min(8, s.drift));
      let temp = s.base + s.drift;
      if (s.hot) temp += 55 + Math.random() * 25; // crosses warn(120)/high(140)/crit(160)
      // one sensor ramps up steadily then resets — demonstrates predictive warning
      if (s.ramp !== undefined) { s.ramp += 2.5 + Math.random() * 2; if (s.ramp > 100) s.ramp = 0; temp = 60 + s.ramp; }
      store.ingestReading({ sensor_id: s.sensor_id, tm_id: s.tm_id, loco_id: s.loco_id,
        temperature: +temp.toFixed(1), sensor_type: 'wired' });
    }
    // device/comm telemetry per loco
    for (const c of store.locos.values()) {
      store.updateComm(c.loco_id, {
        rssi: -(60 + Math.floor(Math.random() * 30)),
        packet_loss: +(Math.random() * 2).toFixed(1),
        latency: 40 + Math.floor(Math.random() * 120),
        retry_count: Math.floor(Math.random() * 3),
        checksum_failures: Math.floor(Math.random() * 2),
        lte_signal: 65 + Math.floor(Math.random() * 35),
        network: '4G LTE',
        data_usage: (10 + Math.random() * 40).toFixed(1) + ' MB',
      });
    }
  }
  tick();
  const interval = setInterval(tick, 5000);
  console.log(`[DEMO_MODE] ${sensors.length} sensors across ${shedCount} shed(s); scoped demo users seeded`);
  return () => clearInterval(interval);
}

module.exports = { startDemo };
