#!/usr/bin/env node
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://localhost:5000";
const email = `e2e-${Date.now()}@example.com`;
const password = "password123";

async function api(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

const register = await api("/api/auth/register", {
  method: "POST",
  body: JSON.stringify({ name: "E2E User", email, password }),
});
assert.equal(register.res.status, 201, "register should succeed");
assert.equal(register.json.status, "success");

const loginBlocked = await api("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});
assert.equal(loginBlocked.res.status, 403, "login should be blocked before verification");

const verifyReq = await api("/api/auth/verification/request", {
  method: "POST",
  body: JSON.stringify({ email }),
});
assert.equal(verifyReq.res.status, 200);

console.log("E2E API checks passed (register + verification gate + verification request).");
