import { LOOKS, filterLooks as filterCatalogLooks } from "../server/looks.mjs";
import { withModelName } from "./model-names.mjs";

// Keep browser and packaged local dialogue on the same appearance catalog.
export {
  LOOKS,
  ORIGINAL_LOOK,
  DEFAULT_LOOK_ID,
  getLook,
  isLookId,
  cleanRemovedLookIds,
  getAvailableLooks,
  getRemovedLooks,
  getAvailableLookId,
  isLookAvailable,
  summarizeLooks,
  LOOK_FILTERS,
  LOOK_COUNT,
  CHARACTER_NAMES,
  CHARACTER_COUNT,
  WARDROBE_SUMMARY,
  matchLookAlias,
  setLocalLooks,
} from "../server/looks.mjs";

export function filterLooks(options = {}) {
  return filterCatalogLooks({
    ...options,
    looks: LOOKS.map((look) => withModelName(look, options.modelNames)),
  });
}
