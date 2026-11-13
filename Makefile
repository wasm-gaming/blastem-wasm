# @wasm-gaming/blastem-wasm — build & preview
#
#   make build       The package: SDK + WASM → dist/
#   make build-sdk   TypeScript only (fast, no Docker) → dist/blastem/
#   make build-wasm  BlastEm → WebAssembly, in the pinned emsdk image (Docker)
#   make demo        The no-build demo page → dist/index.html
#   make test        Type-check, then the tests against the built package
#   make preview     Serve dist/ with COOP/COEP
#
# All build logic lives here (package.json has no scripts).

BIN := node_modules/.bin
PORT ?= 8027
SPECS := node_modules/@wasm-gaming/engine-specs

.PHONY: build build-sdk build-app build-legal build-lib build-specs build-wasm build-wasm-ci demo \
	typecheck test release-check preview i install clean help

i: install
install: ## Install dependencies
	npm install

node_modules: package.json
	npm install
	@touch node_modules

build: build-wasm build-sdk demo ## The package and the demo: WASM + SDK → dist/

build-sdk: build-lib build-specs build-app build-legal ## The published SDK: TypeScript → dist/blastem/ (no WASM)

build-legal: ## The licences travel with the binary: LICENSE + THIRD_PARTY_NOTICES.md → dist/blastem/
	# blastem.wasm is BlastEm (GPL-3.0-or-later) with SDL2, zlib, zstd, Nuklear and
	# Roboto inside; whatever ships it — the release archive, npm — carries both files.
	mkdir -p dist/blastem
	cp LICENSE THIRD_PARTY_NOTICES.md dist/blastem/

build-app: ## The engine's own app (suspend points + pause menu) → dist/blastem/app/
	# Plain JS + CSS, mounted by hosts as <engine>/app/app.js (EngineApp); it imports
	# the SDK next to it relatively.
	rm -rf dist/blastem/app
	mkdir -p dist/blastem/app
	cp src/app/app.js src/app/app.css dist/blastem/app/

build-lib: node_modules ## Compile SDK + options → dist/blastem/
	$(BIN)/tsc -p tsconfig.json

build-specs: build-lib ## Ship the contract runtime beside the SDK and import it relatively
	# The SDK extends the contract's base classes, so engine-specs is a runtime
	# import. Copied into dist/blastem/ (inside `files`) and the emitted imports
	# rewritten to it: the package loads from any static server, no import map.
	cp $(SPECS)/dist/engine-specs.js dist/blastem/engine-specs.js
	node scripts/localize-specs.mjs dist/blastem

build-wasm: ## BlastEm → WebAssembly via the pinned emsdk image (Docker) → dist/blastem/
	bash scripts/build-blastem-docker.sh

build-wasm-ci: ## Same build, run directly (CI runs inside the emsdk container)
	bash scripts/build-blastem.sh

demo: ## The no-build demo page → dist/index.html
	cp src/demo/index.html dist/index.html
	cp src/demo/favicon.ico dist/favicon.ico

typecheck: node_modules ## Type-check the SDK
	$(BIN)/tsc -p tsconfig.json --noEmit

test: typecheck build-sdk ## Type-check, then run tests/ against the built package
	node --test tests/*.test.mjs

release-check: build-sdk test ## npm pack preview
	npm config get registry
	npm pack --dry-run

preview: ## Serve dist/ with COOP/COEP headers
	@echo "Serving dist/ at http://localhost:$(PORT) (Ctrl+C to stop)"
	python3 scripts/preview-server.py --port $(PORT) --directory dist

clean: ## Remove build outputs
	@if [ -d dist ]; then find dist -mindepth 1 -delete; fi

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
