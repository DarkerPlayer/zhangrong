export const LIVE2D_MODEL_URL = "/live2d/haru/haru_greeter_t03.model3.json";

const ACTIONS = Object.freeze({
  idle: { group: "Idle", index: 0, expression: null, duration: 11000 },
  pat: { group: "Tap", index: 0, expression: "f04", duration: 3600 },
  wave: { group: "Idle", index: 1, expression: "f00", duration: 4500 },
  happy: { group: "Idle", index: 2, expression: "f04", duration: 5900 },
  shy: { group: "Tap", index: 1, expression: "f06", duration: 2800 },
});

export function actionPlan(kind) {
  return ACTIONS[kind] || ACTIONS.idle;
}

export function moodExpression(mood) {
  const value = String(mood || "").toLowerCase();
  if (/shy|blush|害羞|心动/.test(value)) return "f06";
  if (/happy|joy|excited|开心|高兴/.test(value)) return "f04";
  if (/sad|sorry|担心|难过/.test(value)) return "f03";
  if (/surprise|惊讶/.test(value)) return "f05";
  return null;
}

export async function applyExpression(model, expression) {
  const manager = model.internalModel?.motionManager.expressionManager;
  if (!manager || manager.destroyed) return false;
  const applied = await model.expression(expression);
  if (manager.destroyed) return false;
  if (applied) return true;
  const index =
    typeof expression === "number"
      ? expression
      : manager.getExpressionIndex(expression);
  const loaded = manager.expressions?.[index];
  // resetExpression() displays the default expression but retains the previous
  // currentExpression. setExpression(sameId) then returns false without playing.
  // Restore only that verified, loaded identity; a failed load is never success.
  if (loaded && loaded === manager.currentExpression) {
    manager.restoreExpression();
    return true;
  }
  return false;
}

export function lipSyncIds(manifest) {
  const ids = manifest?.Groups?.find((group) => group.Name === "LipSync")?.Ids;
  return Array.isArray(ids) && ids.length
    ? ids.filter((id) => typeof id === "string")
    : ["ParamMouthOpenY"];
}

/** Full-body desktop pet; closer portrait framing in the conversation window. */
export function fitModel(
  viewWidth,
  viewHeight,
  modelWidth,
  modelHeight,
  petMode = false,
) {
  const width = Math.max(1, Number(viewWidth) || 1);
  const height = Math.max(1, Number(viewHeight) || 1);
  const padding = petMode ? 0.035 : 0.045;
  const availableWidth = width * (1 - padding * 2);
  const availableHeight = height * (1 - padding * 2);
  const rigHeight = Math.max(1, Number(modelHeight) || 1);
  const scale = Math.min(
    availableWidth / Math.max(1, Number(modelWidth) || 1),
    (availableHeight * (petMode ? 1 : 1.48)) / rigHeight,
  );
  return {
    scale,
    x: width / 2,
    // The renderer uses a bottom-center anchor. Moving that anchor below the
    // portrait viewport keeps the same top margin while cropping the lower legs.
    y: petMode
      ? height - height * padding
      : height * padding + rigHeight * scale,
  };
}

/** Fast opening / relaxed closing, independent of the display refresh rate. */
export function smoothMouth(current, signal, deltaMs) {
  const target = Number.isFinite(signal) ? Math.min(1, Math.max(0, signal)) : 0;
  const previous = Number.isFinite(current)
    ? Math.min(1, Math.max(0, current))
    : 0;
  const dt = Number.isFinite(deltaMs) ? Math.min(100, Math.max(0, deltaMs)) : 0;
  const timeConstant = target > previous ? 45 : 90;
  const value =
    previous + (target - previous) * (1 - Math.exp(-dt / timeConstant));
  return value < 0.002 && target === 0 ? 0 : value;
}

export function pointerFocus(clientX, clientY, bounds) {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  return {
    x: Math.max(
      -0.8,
      Math.min(0.8, ((clientX - bounds.left) / width - 0.5) * 1.6),
    ),
    y: Math.max(
      -0.65,
      Math.min(0.65, (0.42 - (clientY - bounds.top) / height) * 1.25),
    ),
  };
}
