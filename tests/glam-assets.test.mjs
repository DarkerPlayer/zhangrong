import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  LOOKS,
  LOOK_COUNT,
  CHARACTER_COUNT,
  DEFAULT_LOOK_ID,
  getLook,
} from "../src/looks.mjs";

test("every selectable original outfit ships its own RGBA artwork and calibrated face rig", async () => {
  assert.equal(LOOKS.length, LOOK_COUNT);
  assert.equal(
    new Set(LOOKS.map((look) => look.character)).size,
    CHARACTER_COUNT,
  );
  assert.equal(getLook("unknown").id, DEFAULT_LOOK_ID);
  const hashes = new Set();
  for (const look of LOOKS) {
    const image = await readFile(
      new URL(`../public${look.asset}`, import.meta.url),
    );
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.readUInt32BE(16), 1024);
    assert.equal(image.readUInt32BE(20), 1536);
    assert.equal(image[25], 6, `${look.id} must retain an alpha channel`);
    hashes.add(createHash("sha256").update(image).digest("hex"));
    const rig = JSON.parse(
      await readFile(
        new URL(`../public/looks/${look.id}/rig.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(rig.eyes.length, 2);
    assert.ok(rig.eyes[0].x < rig.eyes[1].x);
    for (const feature of [...rig.eyes, rig.mouth]) {
      assert.ok(feature.x > rig.bounds.left && feature.x < rig.bounds.right);
      assert.ok(feature.y > rig.bounds.top && feature.y < rig.head.neckY);
      assert.ok(feature.rx > 0 && feature.ry > 0);
      assert.ok(feature.skin.every((channel) => channel >= 0 && channel <= 1));
    }
    assert.ok(rig.mouth.y > Math.max(...rig.eyes.map((eye) => eye.y)));
    assert.ok(look.age >= 25);
  }
  assert.equal(
    hashes.size,
    LOOK_COUNT,
    "outfits must contain distinct artwork",
  );
});
