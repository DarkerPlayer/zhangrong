"""Bound reference waveforms and per-voice encoder state within one TTS model."""
from collections import OrderedDict
import json
from pathlib import Path


class ReferenceCache:
    def __init__(self, model, load_reference, capacity=3):
        self.model = model
        self.load_reference = load_reference
        self.capacity = capacity
        self.entries = OrderedDict()

    def select(self, directory):
        root = Path(directory).resolve()
        audio_stat = (root / "reference.wav").stat()
        profile = json.loads((root / "profile.json").read_text())
        # Card names are metadata, while transcript or waveform changes need a
        # new acoustic encoding. Separate dictionaries also prevent collisions
        # in the model's approximate waveform fingerprint across voices.
        signature = (audio_stat.st_mtime_ns, audio_stat.st_size, profile["referenceText"])
        entry = self.entries.pop(root, None)
        if entry is None or entry[0] != signature:
            profile, audio = self.load_reference(root)
            entry = (signature, profile, audio, {})
        self.entries[root] = entry
        while len(self.entries) > self.capacity:
            self.entries.popitem(last=False)
        self.model._icl_cache = entry[3]
        return entry[1], entry[2]
