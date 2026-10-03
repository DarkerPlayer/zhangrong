import { getAvailableLookId, isLookId } from "./looks.mjs";
import {
  getCharacterForLook,
  getWardrobeItem,
  GARMENT_SLOT_IDS,
  isBackgroundId,
} from "./wardrobe.mjs";

const sceneIds = ["home", "date", "cozy", "wedding"];
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function normalizePersonaAppearance(value) {
  if (!value || typeof value.lookId !== "string" || value.lookId.length > 100)
    return null;
  const wardrobeSelections = Object.fromEntries(
    Object.entries(object(value.wardrobeSelections))
      .slice(0, 100)
      .map(([id, items]) => [
        id,
        Object.fromEntries(
          GARMENT_SLOT_IDS.flatMap((slot) => {
            const selected = object(items)[slot];
            return selected === null || getWardrobeItem(selected)?.slot === slot
              ? [[slot, selected]]
              : [];
          }),
        ),
      ]),
  );
  return {
    lookId: value.lookId,
    avatarMode: value.avatarMode === "photo" ? "photo" : "live2d",
    scene: sceneIds.includes(value.scene) ? value.scene : "home",
    backgroundId: isBackgroundId(value.backgroundId)
      ? value.backgroundId
      : "moon-room",
    customEnabled: value.customEnabled === true,
    wardrobeSelections,
    lastLookByCharacter: Object.fromEntries(
      Object.entries(object(value.lastLookByCharacter))
        .slice(0, 100)
        .filter(
          ([id, look]) => isLookId(look) && getCharacterForLook(look).id === id,
        ),
    ),
  };
}

export function capturePersonaAppearance(state) {
  return normalizePersonaAppearance(state);
}

// Returns appearance and profile changes. Persona aliases are synchronized by setActivePersona.
export function switchPersonaAppearance(state, personaId) {
  if (!state.personas?.[personaId] || personaId === state.activePersonaId)
    return state;
  const captured = capturePersonaAppearance(state);
  const selected =
    normalizePersonaAppearance(state.personas[personaId].appearance) ||
    captured;
  const lookId = getAvailableLookId(state.removedLookIds, selected.lookId);
  return {
    ...state,
    ...selected,
    lookId,
    activePersonaId: personaId,
    personas: {
      ...state.personas,
      [state.activePersonaId]: {
        ...state.personas[state.activePersonaId],
        appearance: captured,
      },
      [personaId]: { ...state.personas[personaId], appearance: selected },
    },
  };
}
