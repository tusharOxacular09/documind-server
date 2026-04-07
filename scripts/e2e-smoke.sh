#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
EMAIL="${E2E_EMAIL:-smoke-$(date +%s)@example.com}"
PASSWORD="${E2E_PASSWORD:-password123}"
NAME="${E2E_NAME:-Smoke User}"

echo "== Register =="
REGISTER_JSON=$(curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
ACCESS_TOKEN=$(echo "$REGISTER_JSON" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Register failed: $REGISTER_JSON"
  exit 1
fi

echo "== Upload small PDF-like payload =="
CONTENT_BASE64=$(printf "Tiny test content for smoke flow." | base64 -w0)
UPLOAD_JSON=$(curl -sS -X POST "$BASE_URL/api/documents/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"name\":\"smoke.pdf\",\"type\":\"pdf\",\"sizeBytes\":31,\"contentBase64\":\"$CONTENT_BASE64\"}")
DOC_ID=$(echo "$UPLOAD_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
echo "Uploaded document: ${DOC_ID:-unknown}"

echo "== Poll documents =="
for _ in {1..8}; do
  LIST_JSON=$(curl -sS -X GET "$BASE_URL/api/documents" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  if echo "$LIST_JSON" | grep -q '"status":"ready"'; then
    break
  fi
  sleep 1
done

echo "== Ask grounded question =="
ASK_JSON=$(curl -sS -X POST "$BASE_URL/api/chats/ask" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"message":"Summarize the uploaded file."}')

if echo "$ASK_JSON" | grep -q '"assistantMessage"'; then
  echo "Smoke e2e passed."
else
  echo "Ask flow failed: $ASK_JSON"
  exit 1
fi
