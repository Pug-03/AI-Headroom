#!/bin/sh
# termbar installer.
#   curl -fsSL https://raw.githubusercontent.com/<you>/termbar/main/install.sh | sh
# Environment:
#   TERMBAR_PKG   npm spec to install (default: "termbar"; e.g. "github:<you>/termbar")
#   TERMBAR_SETUP set to "0" to install the package but skip `termbar install`
set -eu

PKG="${TERMBAR_PKG:-termbar}"

command -v node >/dev/null 2>&1 || { echo "termbar: Node.js >= 22.18 is required." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "termbar: npm is required." >&2; exit 1; }

node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 18)) {
  console.error("termbar: Node.js >= 22.18 is required (found " + process.versions.node + ").");
  process.exit(1);
}'

echo "Installing $PKG ..."
npm install -g "$PKG"

if [ "${TERMBAR_SETUP:-1}" = "0" ]; then
  echo "Installed. Run: termbar install --dry-run"
  exit 0
fi

# Never overwrites an existing Claude statusLine without --force.
termbar install
echo "Done. Run \`termbar doctor\` to check your setup."
