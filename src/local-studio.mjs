import { setLocalLooks } from "./looks.mjs";
import { setLocalWardrobe } from "./wardrobe.mjs";

const CATALOG_CACHE_KEY = "muyu-local-catalog-v1";

export function applyStudioCatalog(catalog, persist = true) {
  if (
    !catalog ||
    !Array.isArray(catalog.looks) ||
    !Array.isArray(catalog.items) ||
    !Array.isArray(catalog.fits)
  )
    return false;
  setLocalLooks(catalog.looks);
  setLocalWardrobe({ items: catalog.items, fits: catalog.fits });
  if (persist) {
    try {
      localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(catalog));
    } catch {}
  }
  return true;
}

export function restoreCachedStudioCatalog() {
  try {
    return applyStudioCatalog(
      JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY)),
      false,
    );
  } catch {
    return false;
  }
}

export async function studioRequest(path = "", payload, signal) {
  const response = await fetch(`/api/studio${path}`, {
    ...(payload === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
    ...(signal ? { signal } : {}),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("本地生成服务没有返回有效结果，请重新连接。");
  }
  if (response.ok === false)
    throw new Error(
      result.error || result.message || "本地生成请求失败，请重试。",
    );
  return result;
}

// Keep large source photos out of request bodies and release decoded pixels
// immediately after producing the small reference used by the generator.
export async function prepareStudioReference(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("参考图片支持 JPEG、PNG 或 WebP。");
  if (file.size > 12 * 1024 * 1024)
    throw new Error(`「${file.name}」超过 12 MB，请先缩小图片。`);
  let decoded, temporaryUrl;
  try {
    if (typeof createImageBitmap === "function")
      decoded = await createImageBitmap(file);
    else {
      temporaryUrl = URL.createObjectURL(file);
      decoded = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error("这张图片无法读取，请换一张参考图。"));
        image.src = temporaryUrl;
      });
    }
    const width = decoded.width || decoded.naturalWidth;
    const height = decoded.height || decoded.naturalHeight;
    if (!width || !height)
      throw new Error("这张图片没有有效尺寸，请换一张参考图。");
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("图片缩小失败，请重新打开工作台。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const previewUrl = URL.createObjectURL(file);
    canvas.width = canvas.height = 1;
    return {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      name: file.name,
      dataUrl,
      previewUrl,
    };
  } finally {
    decoded?.close?.();
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
  }
}
