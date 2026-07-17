'use strict';

// ---------------------------------------------------------------------------
// HIMNISH RAIP D5-LOCO - Central configuration
// RAIP env-var family: JWT_SECRET, DATA_API_KEY, DEMO_MODE, CFG_*
// ---------------------------------------------------------------------------

const path = require('path');

function num(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const config = {
  PORT: num('PORT', 8080),

  // Persistent state file location. On Railway, attach a Volume and set
  // DATA_DIR to its mount path (e.g. /data) so users/SHEDS/locos survive
  // redeploys. Locally it defaults to ./data.
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Optional PostgreSQL/TimescaleDB archive. When set, every reading is stored
  // durably and history survives restarts. Unset = in-memory + JSON only.
  DATABASE_URL: process.env.DATABASE_URL || '',
  BACKFILL_HOURS: num('BACKFILL_HOURS', 6),
  // Data retention: purge readings older than N days (0 = keep forever).
  RETENTION_DAYS: num('RETENTION_DAYS', 0),

  JWT_SECRET: process.env.JWT_SECRET || 'himnish-raip-loco-dev-secret-change-me',
  JWT_TTL: process.env.JWT_TTL || '12h',

  // Ingestion key used by the generic /api/ingest route (readings[] batch format).
  DATA_API_KEY: process.env.DATA_API_KEY || 'himnish_loco_key_2026',
  // Dedicated key for the existing RUT200 himnish_push.lua script, which POSTs
  // {apiKey, coachId, motors:[12], ts} to /api/push. Matches the script's
  // hardcoded K value exactly — the lua script itself is NOT modified.
  PUSH_API_KEY: process.env.PUSH_API_KEY || 'himnish_rut200_key_2024',
  // Shared key a field RUT uses to pull its own config (self-update).
  BOOTSTRAP_KEY: process.env.BOOTSTRAP_KEY || 'himnish_bootstrap_2025',

  DEMO_MODE: String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true',

  // RUT200 pull poller interval (seconds). 0 disables polling.
  POLL_INTERVAL: num('POLL_INTERVAL', 20),

  // Default thresholds (deg C) — matches HIMNISH-v3 manual: Warning 120C, Alarm 160C.
  // Admin overrides at runtime are persisted and win.
  CFG_WARN_TEMP: num('CFG_WARN_TEMP', 120),
  CFG_HIGH_TEMP: num('CFG_HIGH_TEMP', 140),
  CFG_CRIT_TEMP: num('CFG_CRIT_TEMP', 160),
  CFG_OFFLINE_SECONDS: num('CFG_OFFLINE_SECONDS', 300),
  CFG_LOW_BATTERY: num('CFG_LOW_BATTERY', 20),
  CFG_RETENTION_DAYS: num('CFG_RETENTION_DAYS', 1825),

  // Email (SMTP) transport for email alerts. If unset, email runs dry-run.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: num('SMTP_PORT', 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
  SMTP_FROM: process.env.SMTP_FROM || '',

  // SMS provider for SMS alerts: 'log' (dry-run, default), 'fast2sms', 'msg91',
  // or 'generic' (uses SMS_URL with {to} {message} {key} placeholders).
  SMS_PROVIDER: process.env.SMS_PROVIDER || 'log',
  SMS_API_KEY: process.env.SMS_API_KEY || '',
  SMS_SENDER: process.env.SMS_SENDER || 'HMNISH',
  SMS_URL: process.env.SMS_URL || '',

  // Escalation scan interval (seconds).
  ESCALATION_INTERVAL: num('ESCALATION_INTERVAL', 60),

  // Optional MQTT ingestion (activated only when MQTT_URL is set).
  MQTT_URL: process.env.MQTT_URL || '',
  MQTT_TOPIC: process.env.MQTT_TOPIC || 'himnish/loco/+/readings',
  MQTT_USERNAME: process.env.MQTT_USERNAME || '',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || '',

  // Optional AI Copilot (activated only when LLM_API_KEY + LLM_URL are set).
  // OpenAI-compatible chat-completions endpoint.
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  LLM_URL: process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions',
  LLM_MODEL: process.env.LLM_MODEL || 'gpt-4o-mini',

  // Public base URL for emailed report links (e.g. https://app.up.railway.app).
  // Can also be set per-config in the Notify tab.
  REPORT_BASE_URL: process.env.REPORT_BASE_URL || '',
};

config.ROLES = ['super_admin', 'railway_hq', 'depot_admin', 'maintenance_eng', 'observer'];
config.ROLE_LABELS = {
  super_admin: 'Super Admin', railway_hq: 'Railway HQ', depot_admin: 'Depot Admin',
  maintenance_eng: 'Maintenance Engineer', observer: 'Observer',
};
config.GLOBAL_ROLES = ['super_admin', 'railway_hq'];
config.ADMIN_ROLES = ['super_admin'];

config.defaultThresholds = function () {
  return {
    CFG_WARN_TEMP: config.CFG_WARN_TEMP, CFG_HIGH_TEMP: config.CFG_HIGH_TEMP,
    CFG_CRIT_TEMP: config.CFG_CRIT_TEMP, CFG_OFFLINE_SECONDS: config.CFG_OFFLINE_SECONDS,
    CFG_LOW_BATTERY: config.CFG_LOW_BATTERY,
    CFG_RISE_RATE: num('CFG_RISE_RATE', 3), // deg C per minute -> rapid-rise alert
  };
};

module.exports = config;
