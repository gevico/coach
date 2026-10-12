#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="${COACH_NODE_VERSION:-26.0.0}"
tools_directory="$project_root/.tools"
export PATH="$PATH:$tools_directory/node/bin"

if [[ ! "$node_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'COACH_NODE_VERSION must have the form 26.0.0.' >&2
  exit 1
fi

as_root() {
  if [[ "$(id -u)" == 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Installing system packages requires root or sudo: $*" >&2
    exit 1
  fi
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y "$@"
  elif command -v brew >/dev/null 2>&1; then
    brew install "$@"
  else
    echo "Install these system packages with your package manager: $*" >&2
    exit 1
  fi
}

verify_runtime() {
  local executable="$1" result
  if result=$("$executable" --version 2>&1); then
    return 0
  fi
  if [[ "$(uname -s)" == Linux && "$result" == *libatomic.so.1* ]]; then
    if command -v apt-get >/dev/null 2>&1; then
      install_packages libatomic1
    else
      install_packages libatomic
    fi
    "$executable" --version
  else
    echo "$result" >&2
    return 1
  fi
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    install_packages node
  else
    install_packages nodejs npm
  fi
fi
verify_runtime "$(command -v node)"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 12)) { console.error("Coach requires Node >=22.12. Upgrade Node with your system package manager."); process.exit(1); }'
echo "Using Node $(node --version) and npm $(npm --version)"

if [[ "${1:-}" == --binary ]]; then
  binary_node="$tools_directory/node/bin/node"
  if [[ "${COACH_FORCE_NODE_INSTALL:-0}" != 1 ]] && [[ -x "$binary_node" ]]; then
    verify_runtime "$binary_node"
    if "$binary_node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 25 || (major === 25 && minor >= 5) ? 0 : 1)'; then
      echo "Using binary build runtime $binary_node"
      exit 0
    fi
  fi
  download_packages=()
  for utility in curl tar; do
    if ! command -v "$utility" >/dev/null 2>&1; then
      download_packages+=("$utility")
    fi
  done
  if [[ ${#download_packages[@]} -gt 0 ]]; then
    install_packages "${download_packages[@]}"
  fi
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
  verify_runtime "$binary_node"
  "$binary_node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 25 || (major === 25 && minor >= 5) ? 0 : 1)'
  echo "Installed binary build runtime $binary_node"
fi

if [[ "${1:-}" == --media ]] && ! command -v ffmpeg >/dev/null 2>&1; then
  install_packages ffmpeg
fi
