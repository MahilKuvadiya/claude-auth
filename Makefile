.PHONY: check test lint install uninstall clean all

BIN := bin/claudex

all: check test lint

## check: syntax gate — the same validation `claudex update` runs before installing
check:
	python3 -m py_compile $(BIN)

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

## clean: remove Python bytecode caches
clean:
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -f bin/*.pyc
