import { isLookId, ORIGINAL_LOOK } from './looks.mjs';
import {
  GARMENT_SLOT_IDS,
  GARMENT_SLOT_LABELS,
  getWardrobeItem,
  getWardrobeSelectionStatus,
  normalizeWardrobeSelection,
  resolveWardrobeAppearance,
} from './wardrobe.mjs';

// A fit is a whole illustration. Commit only the exact combination the user sees.
export function planWardrobeSelection({ lookId, selection, slotId, itemId }) {
  if (!isLookId(lookId) || lookId === ORIGINAL_LOOK.id || !GARMENT_SLOT_IDS.includes(slotId))
    return { status: 'invalid', message: '当前造型不支持这类单品。' };
  const item = itemId ? getWardrobeItem(itemId) : null;
  if (itemId && (!item || item.slot !== slotId))
    return { status: 'invalid', message: '单品与所选分类不匹配。' };
  const current = resolveWardrobeAppearance(lookId, selection);
  const requested = { ...(current.wardrobeSelection || {}) };
  if (item) requested[slotId] = item.id;
  else delete requested[slotId];
  const nextSelection = normalizeWardrobeSelection(requested, { lookId });
  const status = getWardrobeSelectionStatus(lookId, nextSelection);
  if (status.status !== 'ready') return { ...status, selection: nextSelection };
  return {
    status: 'ready',
    selection: nextSelection,
    appearance: resolveWardrobeAppearance(lookId, nextSelection),
    message: nextSelection[slotId]
      ? `已换上「${item.name}」，并保存当前角色的搭配。`
      : `已恢复原造型的${GARMENT_SLOT_LABELS[slotId]}。`,
  };
}

export function importedWardrobeSelection(job) {
  if (job?.kind !== 'fit') return null;
  const lookId = job.input?.baseLookId || job.baseLookId;
  if (!isLookId(lookId) || lookId === ORIGINAL_LOOK.id) return null;
  let requested = job.importedSelection;
  if (requested === undefined) {
    const item = getWardrobeItem(job.importedItemId);
    if (!item) return null;
    requested = { [item.slot]: item.id };
  }
  try {
    const selection = normalizeWardrobeSelection(requested, { strict: true, lookId });
    if (getWardrobeSelectionStatus(lookId, selection).status !== 'ready') return null;
    return { lookId, selection };
  } catch {
    return null;
  }
}
