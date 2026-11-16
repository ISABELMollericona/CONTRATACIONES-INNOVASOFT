import assert from "node:assert/strict";
import { getAdminNotificationStatus } from "../src/lib/admin-notifications";

const keys = ["ADMIN_EMAILS", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

try {
  for (const key of keys) delete process.env[key];
  assert.deepEqual(getAdminNotificationStatus(), {
    configured: false,
    recipientCount: 0,
    missing: ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "ADMIN_EMAILS"],
  });

  process.env.ADMIN_EMAILS = "admin@example.com, ADMIN@example.com, other@example.com";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USER = "sender@example.com";
  process.env.SMTP_PASSWORD = "test-password";
  assert.deepEqual(getAdminNotificationStatus(), {
    configured: true,
    recipientCount: 2,
    missing: [],
  });

  process.env.SMTP_PORT = "70000";
  assert.equal(getAdminNotificationStatus().configured, false);
} finally {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("Admin notification checks passed.");
