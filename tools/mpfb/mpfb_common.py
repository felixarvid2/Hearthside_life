"""Shared helpers for the MPFB (MakeHuman Plugin for Blender) body prototype. Run inside Blender: see tools/mpfb/README.md."""
import importlib
import os
import sys

import bpy

# MPFB is a Blender extension: the package name depends on the repository it was installed from.
_EXT_NAMES = ("bl_ext.user_default.mpfb", "bl_ext.blender_org.mpfb", "mpfb")


def enable_mpfb():
    """Enables the MPFB extension in a --factory-startup session (preferences are not loaded there)."""
    for name in _EXT_NAMES:
        try:
            bpy.ops.preferences.addon_enable(module=name)
        except Exception:
            continue
        if name in sys.modules:
            return name
    raise RuntimeError("MPFB extension is not installed (see tools/mpfb/README.md)")


def mp(module, key):
    """Gets `key` from the MPFB module whose dotted name ends in `module` (extensions have no fixed package name)."""
    for amod in list(sys.modules):
        if amod.endswith(module):
            m = importlib.import_module(amod)
            if hasattr(m, key):
                return getattr(m, key)
    raise ValueError("no MPFB module %s with %s" % (module, key))


def out_dir():
    root = os.environ.get("MPFB_OUT") or os.path.join(os.getcwd(), "dev", "mpfb", "out")
    os.makedirs(root, exist_ok=True)
    return root


def script_args():
    """Arguments after `--` on the Blender command line."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
