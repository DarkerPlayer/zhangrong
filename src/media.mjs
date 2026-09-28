function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("muyu-media", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("assets");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function readMedia() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("assets", "readonly");
    const r = t.objectStore("assets").get("custom");
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
    t.oncomplete = () => d.close();
  });
}
export async function saveMedia(file) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("assets", "readwrite");
    if (file)
      t.objectStore("assets").put(
        { blob: file, type: file.type, name: file.name },
        "custom",
      );
    else t.objectStore("assets").delete("custom");
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onerror = () => {
      d.close();
      reject(t.error);
    };
  });
}
