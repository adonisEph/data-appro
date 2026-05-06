-- SMS inbox for Airtel confirmations (webhook from Android)
CREATE TABLE IF NOT EXISTS sms_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  body TEXT NOT NULL,
  received_at TEXT,
  device_id TEXT,
  raw_payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_inbox_sender_created_at ON sms_inbox(sender, created_at);
