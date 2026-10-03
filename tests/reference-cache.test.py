"""Reference switching tests without importing MLX or loading model weights."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / "server" / "reference_cache.py"


class ReferenceCacheTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SOURCE.exists(), "the bounded reference cache is not implemented")
        spec = importlib.util.spec_from_file_location("reference_cache", SOURCE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.roots = {}
        for name in ("a", "b", "c"):
            root = Path(self.temp.name) / name
            root.mkdir()
            (root / "profile.json").write_text(json.dumps({"referenceText": name}))
            (root / "reference.wav").write_bytes(name.encode())
            self.roots[name] = root
        self.loads = []
        self.model = SimpleNamespace(_icl_cache={})

        def load(root):
            self.loads.append(root.name)
            return root.name, (root / "reference.wav").read_bytes()

        self.cache = module.ReferenceCache(self.model, load, capacity=2)

    def test_switching_reference_restores_its_own_encoding_cache(self):
        self.assertEqual(self.cache.select(self.roots["a"]), ("a", b"a"))
        self.model._icl_cache["codes"] = "encoded-a"
        self.assertEqual(self.cache.select(self.roots["b"]), ("b", b"b"))
        self.assertEqual(self.model._icl_cache, {})
        self.model._icl_cache["codes"] = "encoded-b"
        self.cache.select(self.roots["a"])
        self.assertEqual(self.model._icl_cache, {"codes": "encoded-a"})
        self.assertEqual(self.loads, ["a", "b"])

    def test_least_recently_used_reference_is_released(self):
        for name in ("a", "b", "a", "c", "a", "b"):
            self.cache.select(self.roots[name])
        self.assertEqual(self.loads, ["a", "b", "c", "b"])

    def test_changed_or_deleted_recording_cannot_reuse_stale_reference(self):
        root = self.roots["a"]
        self.cache.select(root)
        self.model._icl_cache["old"] = "old"
        (root / "reference.wav").write_bytes(b"new-audio")
        self.assertEqual(self.cache.select(root), ("a", b"new-audio"))
        self.assertEqual(self.model._icl_cache, {})
        (root / "reference.wav").unlink()
        with self.assertRaises(FileNotFoundError):
            self.cache.select(root)

    def test_renaming_card_preserves_its_reference_encoding(self):
        root = self.roots["a"]
        self.cache.select(root)
        self.model._icl_cache["codes"] = "encoded-a"
        (root / "profile.json").write_text(json.dumps({"referenceText": "a", "name": "renamed"}))
        self.cache.select(root)
        self.assertEqual(self.loads, ["a"])
        self.assertEqual(self.model._icl_cache, {"codes": "encoded-a"})


if __name__ == "__main__":
    unittest.main()
