#!/usr/bin/env bash
# Authorize Stellar accounts to attest/countersign for a TUGMA organization.
# Run by the contract admin, whose key is in the Stellar CLI identity store.
#
#   ./contracts/scripts/authorize-signers.sh G... [G... ...]
#
# Overrides: CONTRACT_ID, ORG, SOURCE (admin identity), NETWORK.
# Admins can copy the exact command, pre-filled with every pending wallet, from
# Settings → Stellar Signers in the app.
set -euo pipefail

CONTRACT_ID="${CONTRACT_ID:-CC734HZAIWGKKFFD5CZNY73EC3YJJZYDK6IJQQLCZUOSD34U3SY33ZTH}"
ORG="${ORG:-org-tugma-demo-psp}"
SOURCE="${SOURCE:-tugma-admin}"
NETWORK="${NETWORK:-testnet}"

if [ "$#" -eq 0 ]; then
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

command -v stellar >/dev/null || { echo "Stellar CLI not found: https://developers.stellar.org/docs/tools/cli" >&2; exit 1; }

echo "Contract: $CONTRACT_ID ($NETWORK)"
echo "Org:      $ORG"
if [[ "$SOURCE" == S* ]]; then
  echo "Admin:    (secret key from SOURCE)"
else
  echo "Admin:    $SOURCE ($(stellar keys address "$SOURCE"))"
fi
echo

status=0
for signer in "$@"; do
  if ! [[ "$signer" =~ ^G[A-Z2-7]{55}$ ]]; then
    echo "✗ $signer is not a Stellar account id (G...)"; status=1; continue
  fi
  already=$(stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" -- \
    is_signer --org "$ORG" --signer "$signer" 2>/dev/null)
  if [ "$already" = "true" ]; then
    echo "• $signer is already authorized"; continue
  fi
  if stellar contract invoke --id "$CONTRACT_ID" --source "$SOURCE" --network "$NETWORK" -- \
      add_signer --org "$ORG" --signer "$signer" >/dev/null; then
    echo "✓ authorized $signer"
  else
    echo "✗ failed to authorize $signer"; status=1
  fi
done
exit $status
