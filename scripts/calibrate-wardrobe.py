"""Write rig coordinates from Vision landmarks; never alter the source PNGs.

Development-only: run face-landmarks.swift first, then this script with Pillow.
Shoulders are visually reviewed normalized image coordinates for these assets.
"""
import json
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHOULDERS = {
    "sakura": (0.356, 0.638, 0.184),
    "yuki": (0.359, 0.638, 0.184),
    "zhixia": (0.361, 0.637, 0.188),
    "lingyue": (0.362, 0.632, 0.189),
    "elise": (0.364, 0.641, 0.182),
    "mia": (0.362, 0.645, 0.191),
    "amara": (0.351, 0.629, 0.202),
    "zuri": (0.351, 0.640, 0.186),
}

for line in (ROOT / "docs/wardrobe-landmarks.jsonl").read_text().splitlines():
    detected = json.loads(line)
    path = ROOT / detected["path"]
    look_id = path.parent.name
    prefix = look_id.split("-")[0]
    if prefix not in SHOULDERS:
        continue
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    pixels = image.load()

    def sample(x, y, radius=3):
        points = [pixels[max(0, min(width - 1, round(x * width) + dx)),
                         max(0, min(height - 1, round(y * height) + dy))]
                  for dx in range(-radius, radius + 1)
                  for dy in range(-radius, radius + 1)]
        return [round(median(p[i] for p in points) / 255, 4) for i in range(3)]

    face = detected["face"]
    eyes = []
    for eye in detected["eyes"]:
        eye = dict(eye)
        eye["rx"] *= 1.65
        eye["ry"] = max(eye["ry"] * 1.55, 0.0037)
        eye["skin"] = sample(eye["x"], eye["y"] + eye["ry"] * 2.3)
        eye["lid"] = [0.12, 0.065, 0.065] if prefix in {"amara", "zuri"} else [0.19, 0.105, 0.12]
        eyes.append(eye)
    mouth = dict(detected["mouth"])
    mouth["skin"] = sample(mouth["x"], mouth["y"] + mouth["ry"] * 2.1)
    mouth["lip"] = sample(mouth["x"], mouth["y"] + mouth["ry"] * 0.65, 1)
    mouth["inner"] = [0.16, 0.045, 0.055] if prefix in {"amara", "zuri"} else [0.22, 0.05, 0.075]
    mouth["rx"] *= 1.02
    mouth["ry"] = max(mouth["ry"], 0.0047)
    bounds = image.getchannel("A").point(lambda value: 255 if value > 127 else 0).getbbox()
    shoulder_left, shoulder_right, shoulder_y = SHOULDERS[prefix]
    rig = {
        "armMobility": 0,
        "head": {"x": (face["left"] + face["right"]) / 2,
                 "y": (face["top"] + face["bottom"]) / 2,
                 "neckY": face["bottom"] + 0.022,
                 "radiusX": 0.15, "radiusY": 0.085},
        "eyes": eyes, "mouth": mouth,
        "shoulders": {"left": [shoulder_left, shoulder_y], "right": [shoulder_right, shoulder_y]},
        "bounds": dict(zip(["left", "top", "right", "bottom"],
                           [bounds[0] / width, bounds[1] / height, bounds[2] / width, bounds[3] / height])),
    }
    (path.parent / "rig.json").write_text(json.dumps(rig, ensure_ascii=False, indent=2) + "\n")
    print(look_id, "face confidence", detected["confidence"], "bounds", bounds)
