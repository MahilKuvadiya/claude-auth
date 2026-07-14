.PHONY: check test lint build sign dist install uninstall clean all

BIN := bin/claudex
DIST := dist
ARCH := $(shell uname -m)
BASEVER := $(shell grep -m1 '__version__' $(BIN) | sed -E 's/.*"([0-9.]+)".*/\1/')

# Distribution channel this build belongs to (prod | uat). The prod build (from `main`)
# publishes to latest/ and defaults to the prod API; the uat build (from the `uat`
# branch) publishes to uat/ and defaults to the uat API. CHANNEL is baked into the
# binary before compiling. BUILD makes uat versions monotonic (<base>.<build>) so
# `claudex update` on a uat binary detects newer uat builds.
CHANNEL ?= prod
BUILD   ?= 0
VER := $(if $(filter prod,$(CHANNEL)),$(BASEVER),$(BASEVER).$(BUILD))

all: check test lint

## check: syntax gate — the same validation the release build runs first
check:then 
	python3 -m py_compile $(BIN)

## build: compile the single-file source into a native binary via Nuitka (arm64)
##        Produces $(DIST)/claudex — machine code, no readable .py/.pyc inside.
##        The onefile payload is extracted ONCE to a version-keyed cache dir and
##        reused, so startup is ~0.1s after the first run (not ~3s every run).
build: check
	@# Bake the channel (and, for non-prod, the monotonic version) into a restorable
	@# copy of the source so the working tree stays clean after the build.
	@cp $(BIN) $(BIN).bak
	@sed -i '' -E 's/^(_CHANNEL = )"[^"]*"/\1"$(CHANNEL)"/' $(BIN)
	@if [ "$(CHANNEL)" != "prod" ]; then \
		sed -i '' -E 's/^(__version__ = )"[0-9.]+"/\1"$(VER)"/' $(BIN); \
	fi
	@echo "building channel=$(CHANNEL) version=$(VER)"
	python3 -m nuitka --onefile --assume-yes-for-downloads --static-libpython=no \
		--product-version="$(VER)" --onefile-tempdir-spec='{CACHE_DIR}/claudex/{VERSION}' \
		--output-dir=$(DIST) --output-filename=claudex --remove-output $(BIN); \
		status=$$?; mv $(BIN).bak $(BIN); exit $$status
	@$(MAKE) sign

## sign: ad-hoc codesign so Apple Silicon Gatekeeper doesn't reject the binary
sign:
	codesign -s - --force --timestamp=none $(DIST)/claudex
	@echo "built $(DIST)/claudex ($(ARCH))"

## dist: build + emit SHA256SUMS + VERSION next to the binary (what CI uploads to GCS)
dist: build
	cd $(DIST) && cp claudex claudex-arm64 && shasum -a 256 claudex-arm64 > SHA256SUMS
	printf '%s\n' "$(VER)" > $(DIST)/VERSION
	@echo "dist ready: $(DIST)/claudex-arm64 + $(DIST)/SHA256SUMS + $(DIST)/VERSION ($(VER))"

## test: run the stdlib unittest suite
test:
	python3 -m unittest discover -s tests -v

## lint: shellcheck the install scripts
lint:
	shellcheck install.sh uninstall.sh

## install: install into ~/.local/bin
install:
	./install.sh

## uninstall: remove from ~/.local/bin (add --purge to also delete saved accounts)
uninstall:
	./uninstall.sh

## clean: remove Python bytecode caches + build output
clean:
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -f bin/*.pyc
	rm -rf $(DIST)
