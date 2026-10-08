import { LOOKS } from "./looks.mjs";
import { WARDROBE_ITEMS } from "./wardrobe.mjs";

// Ownership follows the source. Explicit collection assignments may also add
// shared items; merely having a fit never changes collection membership.
export function isCharacterWardrobeItem(item, characterId, looks = LOOKS) {
  if (!item || !characterId) return false;
  if (Array.isArray(item.collectionCharacterIds) && item.collectionCharacterIds.includes(characterId)) return true;
  if (item.sourceCharacterId) return item.sourceCharacterId === characterId;
  const characterForLook = (lookId) => looks.find((look) => look.id === lookId)?.characterId;
  if (item.sourceLookId) return characterForLook(item.sourceLookId) === characterId;
  return item.embeddedLookIds?.some((lookId) => characterForLook(lookId) === characterId) || false;
}

export function getWardrobeInventory(characterId, {
  scope = "character", slotId, items = WARDROBE_ITEMS, looks = LOOKS,
} = {}) {
  return items.filter((item) => (!slotId || item.slot === slotId) &&
    (scope === "all" || isCharacterWardrobeItem(item, characterId, looks)));
}
