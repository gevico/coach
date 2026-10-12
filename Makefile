SHELL := /bin/bash
export PATH := $(CURDIR)/.tools/node/bin:$(PATH)
export TMPDIR := $(CURDIR)/.artifacts/runtime
NODE ?= $(CURDIR)/.tools/node/bin/node
NPM ?= $(NODE) $(CURDIR)/.tools/node/lib/node_modules/npm/bin/npm-cli.js
FILE ?= samples/getting-started.md
HOST ?= 127.0.0.1
PORT ?= 4173

.PHONY: all help environment setup setup-media build binary test check run dev clean
all: binary

help:
	@printf '%s\n' 'make setup        Install Node and npm dependencies' 'make setup-media  Install FFmpeg and Playwright Chromium' 'make build        Build the web application' 'make binary       Build build/coach for this platform' 'make test         Run project tests' 'make check        Verify the compiled executable' 'make run FILE=... Run build/coach' 'make run HOST=0.0.0.0  Run for CNB WebIDE port preview' 'make dev          Run the development server' 'make clean        Remove generated build output'

environment:
	mkdir -p "$(TMPDIR)"
	bash scripts/install-environment.sh

node_modules/.coach-installed: package.json package-lock.json | environment
	$(NPM) ci
	touch $@

setup: node_modules/.coach-installed

setup-media: setup
	bash scripts/install-environment.sh --media
	$(NODE) node_modules/@playwright/test/cli.js install --with-deps chromium

build: setup
	$(NPM) run build

binary: build
	$(NODE) scripts/build-binary.mjs

test: setup
	$(NPM) test

check: binary
	$(NODE) scripts/check-binary.mjs

run: binary
	./build/coach "$(FILE)" --host "$(HOST)" --port "$(PORT)" --presenter --no-open

dev: setup
	$(NPM) run dev -- --host "$(HOST)" --port "$(PORT)"

clean:
	rm -rf build dist
