#!/usr/bin/env bash
# Writes the SOPS-encrypted Secret tailscale/operator-oauth for the Cyso overlay
# from a local env file, without printing the values.
#
#   deploy/scripts/tailscale-oauth-secret.sh [~/.config/tailscale/operator-oauth.env]
#
# The env file holds CLIENT_ID=… and CLIENT_SECRET=… (TS_ prefixes work too).
# Needs sops; encryption uses the age recipient from .sops.yaml.
set -euo pipefail

env_file="${1:-$HOME/.config/tailscale/operator-oauth.env}"
out="deploy/infrastructure/tailscale-operator/cyso/operator-oauth.sops.yaml"

[[ -r "$env_file" ]] || { echo "missing $env_file" >&2; exit 1; }

value() {
  # First match of KEY= or TS_KEY=, quotes stripped.
  sed -nE "s/^(export[[:space:]]+)?(TS_)?$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\3/p" "$env_file" | head -n1
}
id="$(value CLIENT_ID)"
secret="$(value CLIENT_SECRET)"
[[ -n "$id" && -n "$secret" ]] || { echo "CLIENT_ID or CLIENT_SECRET missing in $env_file" >&2; exit 1; }

umask 077
tmp="$(mktemp "${out%.yaml}.XXXXXX.sops.yaml")"
trap 'rm -f "$tmp"' EXIT
cat >"$tmp" <<YAML
apiVersion: v1
kind: Secret
metadata:
  name: operator-oauth
  namespace: tailscale
stringData:
  client_id: "$id"
  client_secret: "$secret"
YAML
sops --encrypt --filename-override "$out" "$tmp" >"$out"
echo "wrote $out (encrypted)"
