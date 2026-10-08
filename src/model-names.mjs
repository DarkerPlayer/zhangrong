const MODEL_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

const cleanName = (value) =>
  typeof value === "string" ? Array.from(value.trim()).slice(0, 24).join("") : "";

// Keep IDs that are not in the current catalog: local models can load later.
export function normalizeModelNames(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, value]) => {
      const name = cleanName(value);
      return MODEL_ID.test(id) && name ? [[id, name]] : [];
    }),
  );
}

export function getModelName(characterId, fallback, modelNames = {}) {
  const name = modelNames && Object.hasOwn(modelNames, characterId)
    ? cleanName(modelNames[characterId])
    : "";
  return name || fallback;
}

export function withModelName(look, modelNames = {}) {
  if (!look) return look;
  const character = getModelName(look.characterId, look.character, modelNames);
  if (character === look.character) return look;
  return {
    ...look,
    character,
    name: typeof look.name === "string" && look.name.startsWith(look.character)
      ? character + look.name.slice(look.character.length)
      : `${character} · ${look.outfit}`,
    aliases: [...new Set([...(look.aliases || []), look.character, look.name].filter(Boolean))],
  };
}
