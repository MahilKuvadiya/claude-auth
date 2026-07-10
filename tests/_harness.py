"""Load the extensionless single-file CLI (`bin/claudex`) as an importable module.

The script has no `.py` suffix, so `import` can't find it normally; we load it by
path with SourceFileLoader. Import is side-effect-free — the CLI guards execution
behind `if __name__ == "__main__"`, and network calls only happen inside commands.
"""
import os
import importlib.util
from importlib.machinery import SourceFileLoader

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PATH = os.path.join(_ROOT, "bin", "claudex")


def load():
    loader = SourceFileLoader("claudex", _PATH)
    spec = importlib.util.spec_from_loader("claudex", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)
    return mod


cx = load()
