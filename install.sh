#!/bin/sh
# AI Headroom installer.
#   curl -fsSL https://raw.githubusercontent.com/Pug-03/AI-Headroom/main/install.sh | sh
# Environment:
#   AIHEADROOM_PKG   npm spec to install (default: "github:Pug-03/AI-Headroom")
#   AIHEADROOM_SETUP set to "0" to install the package but skip `aiheadroom install --wrap`
set -eu

PKG="${AIHEADROOM_PKG:-github:Pug-03/AI-Headroom}"

command -v node >/dev/null 2>&1 || { echo "AI Headroom: Node.js >= 22.18 is required." >&2; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "AI Headroom: npm is required." >&2; exit 1; }

node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 18)) {
  console.error("AI Headroom: Node.js >= 22.18 is required (found " + process.versions.node + ").");
  process.exit(1);
}'

echo "Installing $PKG ..."
npm install -g "$PKG"

if [ "${AIHEADROOM_SETUP:-1}" = "0" ]; then
  echo "Installed. Run: aiheadroom install --wrap --dry-run"
  exit 0
fi

# --wrap keeps an existing Claude statusLine (e.g. AFK Pug) in front. Nothing is
# overwritten, and `aiheadroom uninstall` restores the previous setup.
aiheadroom install --wrap
echo "Done. Run \`aiheadroom doctor\` to check your setup."
