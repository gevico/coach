SHELL := /bin/bash
export PATH := $(PATH):$(CURDIR)/.tools/node/bin
export TMPDIR := $(CURDIR)/.artifacts/runtime
NODE ?= node
NPM ?= npm
FILE ?= samples/getting-started.md
HOST ?= 127.0.0.1
PORT ?= 4173

.PHONY: all help environment setup setup-media build binary test check run run-binary dev clean
all: build

help:
	@printf '%s\n' 'make setup        Use system Node/npm and install dependencies' 'make setup-media  Install FFmpeg and Playwright Chromium' 'make build        Build the web application' 'make binary       Build build/coach with a dedicated Node runtime' 'make test         Run project tests' 'make check        Verify the compiled executable' 'make run FILE=... Run the course with system Node' 'make run HOST=0.0.0.0  Run for CNB WebIDE port preview' 'make run-binary   Build and run build/coach' 'make dev          Run the development server' 'make clean        Remove generated build output'

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
	bash scripts/install-environment.sh --binary
	./.tools/node/bin/node scripts/build-binary.mjs

test: setup
	$(NPM) test

check: binary
	$(NODE) scripts/check-binary.mjs

run: build
	$(NODE) bin/coach.mjs "$(FILE)" --host "$(HOST)" --port "$(PORT)" --presenter --no-open

run-binary: binary
	./build/coach "$(FILE)" --host "$(HOST)" --port "$(PORT)" --presenter --no-open

dev: setup
	$(NPM) run dev -- --host "$(HOST)" --port "$(PORT)"

clean:
	rm -rf build dist
