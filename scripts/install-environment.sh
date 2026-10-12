#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="${COACH_NODE_VERSION:-26.0.0}"
tools_directory="$project_root/.tools"
export PATH="$tools_directory/node/bin:$PATH"

if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'COACH_NODE_VERSION must have the form 26.0.0.' >&2
  exit 1
fi

compatible_node() {
  command -v node >/dev/null 2>&1 && node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 25 || (major === 25 && minor >= 5) ? 0 : 1)'
}

if [[ "${COACH_FORCE_NODE_INSTALL:-0}" != 1 ]] && [[ -x "$tools_directory/node/bin/node" ]] && compatible_node; then
  echo "Using Node $(node --version)"
else
  case "$(uname -s)" in
    Darwin) node_platform=darwin ;;
    Linux) node_platform=linux ;;
    *) echo 'Supported build platforms: macOS and Linux.' >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) node_arch=arm64 ;;
    x86_64) node_arch=x64 ;;
    *) echo 'Supported architectures: arm64 and x64.' >&2; exit 1 ;;
  esac
  archive="node-v${node_version}-${node_platform}-${node_arch}.tar.gz"
  download_directory="$tools_directory/downloads/v$node_version"
  mkdir -p "$download_directory" "$tools_directory/node"
  curl --fail --location --retry 2 "https://nodejs.org/dist/v$node_version/$archive" --output "$download_directory/$archive"
  curl --fail --location --retry 2 "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" --output "$download_directory/SHASUMS256.txt"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$download_directory" && sha256sum --check --ignore-missing SHASUMS256.txt)
  else
    (cd "$download_directory" && shasum --algorithm 256 --check --ignore-missing SHASUMS256.txt)
  fi
  tar -xzf "$download_directory/$archive" --strip-components=1 -C "$tools_directory/node"
  export PATH="$tools_directory/node/bin:$PATH"
  compatible_node
  echo "Installed Node $(node --version) in .tools/node"
fi

if [[ "${1:-}" == --media ]] && ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    if [[ "$(id -u)" == 0 ]]; then
      apt-get update
      apt-get install -y ffmpeg
    else
      sudo apt-get update
      sudo apt-get install -y ffmpeg
    fi
  else
    echo 'FFmpeg installation requires Homebrew or apt-get.' >&2
    exit 1
  fi
fi
