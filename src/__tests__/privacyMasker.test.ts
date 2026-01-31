import test from "node:test";
import assert from "node:assert/strict";
import { maskContent } from "../privacyMasker";
import { PrivacyModeConfig } from "../types";

const baseConfig: PrivacyModeConfig = {
  enabled: true,
  maskEmails: true,
  maskTokens: true,
  maskApiKeys: true,
  placeholder: "[REDACTED]",
  customPatterns: []
};

test("maskContent masks emails, tokens, and api keys with counts", () => {
  const content = [
    "email: test@example.com",
    "apiKey: abcdefghijkl",
    "Authorization: Bearer abc.def.ghi",
    "jwt=eyJabc.def.ghi",
    "ghp1234567890",
    "password=supersecret"
  ].join("\n");

  const config: PrivacyModeConfig = {
    ...baseConfig,
    customPatterns: ["password\\s*[:=]\\s*\\S+"]
  };

  const result = maskContent(content, config);

  assert.match(result.maskedContent, /\[REDACTED\]_EMAIL/);
  assert.match(result.maskedContent, /\[REDACTED\]_API_KEY/);
  assert.match(result.maskedContent, /Bearer \[REDACTED\]_TOKEN/);
  assert.match(result.maskedContent, /\[REDACTED\]_TOKEN/);
  assert.match(result.maskedContent, /\[REDACTED\]_CUSTOM/);

  assert.equal(result.byType.email, 1);
  assert.equal(result.byType.apiKey, 1);
  assert.ok((result.byType.token || 0) >= 2);
  assert.equal(result.byType.custom, 1);
  assert.ok(result.totalMasked >= 5);
});

test("maskContent returns original content when disabled", () => {
  const content = "email: test@example.com";
  const result = maskContent(content, { ...baseConfig, enabled: false });
  assert.equal(result.maskedContent, content);
  assert.equal(result.totalMasked, 0);
  assert.deepEqual(result.byType, {});
});
