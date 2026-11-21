import type { SupabaseClient } from "@supabase/supabase-js";

type ScanRecord = {
  id: string;
  title: string;
  text: string;
  createdAt: number;
  pageCount: number;
  kind: "document" | "object";
  image?: string;
  images?: string[];
};

type WorkspaceSnapshot = {
  version: 2;
  data: Record<string, string>;
  scanRecords: ScanRecord[];
};

const excludedKeys = new Set([
  "grandLumenLocalAccounts",
  "grandLumenLocalSession",
  "grandLumenCloudOwner"
]);

const DB_NAME = "grandLumenScanDB";
const STORE_NAME = "documents";
const MAX_SNAPSHOT_BYTES = 12 * 1024 * 1024;

export function isSyncableWorkspaceKey(key: string): boolean {
  if (excludedKeys.has(key)) return false;
  return key.startsWith("grandLumen") || key.startsWith("lumen");
}

function openScanDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available in this browser."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Scanner storage could not be opened."));
  });
}

async function readScanRecords(): Promise<ScanRecord[]> {
  const database = await openScanDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as ScanRecord[]);
    request.onerror = () => reject(request.error || new Error("Scanner documents could not be read."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Scanner documents could not be read."));
    };
  });
}

async function replaceScanRecords(records: ScanRecord[]): Promise<void> {
  const database = await openScanDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    records.forEach(record => store.put(record));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Scanner documents could not be restored."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Scanner document restore was cancelled."));
    };
  });
}

function profileImagesForUser(raw: string | null, email: string): string {
  if (!raw || !email) return "{}";
  try {
    const images = JSON.parse(raw) as Record<string, string>;
    const image = images[email.trim().toLowerCase()];
    return JSON.stringify(image ? { [email.trim().toLowerCase()]: image } : {});
  } catch {
    return "{}";
  }
}

async function readWorkspaceSnapshot(email: string): Promise<WorkspaceSnapshot> {
  const data: Record<string, string> = {};
  let totalBytes = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSyncableWorkspaceKey(key)) continue;
    let value = localStorage.getItem(key);
    if (value === null) continue;
    if (key === "grandLumenProfileImages") value = profileImagesForUser(value, email);
    totalBytes += new Blob([key, value]).size;
    if (totalBytes > MAX_SNAPSHOT_BYTES) throw new Error("Your workspace is larger than the 12 MB cloud-sync limit. Export a backup before syncing.");
    data[key] = value;
  }
  const scanRecords = await readScanRecords();
  totalBytes += new Blob([JSON.stringify(scanRecords)]).size;
  if (totalBytes > MAX_SNAPSHOT_BYTES) throw new Error("Your workspace and scanner documents exceed the 12 MB cloud-sync limit. Export a backup before syncing.");
  return { version: 2, data, scanRecords };
}

async function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot | { version: 1; data: Record<string, string> }, preserveLocalData = false): Promise<void> {
  if (!snapshot || (snapshot.version !== 1 && snapshot.version !== 2) || !snapshot.data || typeof snapshot.data !== "object") {
    throw new Error("The cloud workspace format is not supported.");
  }
  if (!preserveLocalData || snapshot.version === 2) {
    const existingKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isSyncableWorkspaceKey(key)) existingKeys.push(key);
    }
    existingKeys.forEach(key => localStorage.removeItem(key));
  }
  Object.entries(snapshot.data).forEach(([key, value]) => {
    if (isSyncableWorkspaceKey(key) && typeof value === "string") localStorage.setItem(key, value);
  });
  if (snapshot.version === 2) await replaceScanRecords(Array.isArray(snapshot.scanRecords) ? snapshot.scanRecords : []);
  window.dispatchEvent(new CustomEvent("grand-lumen-workspace-restored"));
  window.dispatchEvent(new Event("storage"));
  window.dispatchEvent(new CustomEvent("lumen-reminders-updated"));
}

export async function startWorkspaceCloudSync(
  client: SupabaseClient,
  userId: string,
  email: string,
  onStatus: (message: string) => void
): Promise<() => void> {
  onStatus("Checking cloud workspace");
  const { data: cloudRecord, error: loadError } = await client
    .from("grand_lumen_workspaces")
    .select("workspace_data")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) throw loadError;

  let migrateLegacySnapshot = false;
  if (cloudRecord?.workspace_data) {
    onStatus("Restoring workspace");
    const previousOwner = localStorage.getItem("grandLumenCloudOwner");
    const cloudSnapshot = cloudRecord.workspace_data as WorkspaceSnapshot | { version: 1; data: Record<string, string> };
    migrateLegacySnapshot = cloudSnapshot.version === 1 && previousOwner === userId;
    await applyWorkspaceSnapshot(cloudSnapshot, migrateLegacySnapshot);
    localStorage.setItem("grandLumenCloudOwner", userId);
    onStatus("Workspace restored · syncing changes");
  } else {
    onStatus("Backing up this device");
    const previousOwner = localStorage.getItem("grandLumenCloudOwner");
    const initialSnapshot = previousOwner && previousOwner !== userId
      ? { version: 2 as const, data: {}, scanRecords: [] as ScanRecord[] }
      : await readWorkspaceSnapshot(email);
    if (previousOwner && previousOwner !== userId) await applyWorkspaceSnapshot(initialSnapshot);
    const { error: createError } = await client
      .from("grand_lumen_workspaces")
      .upsert({ user_id: userId, workspace_data: initialSnapshot }, { onConflict: "user_id" });
    if (createError) throw createError;
    localStorage.setItem("grandLumenCloudOwner", userId);
    onStatus("First workspace backup complete");
  }

  let disposed = false;
  let applyingRemote = false;
  let saveTimer: number | undefined;
  let saveQueue = Promise.resolve();
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;

  const persist = () => {
    if (disposed) return;
    onStatus("Saving workspace to cloud");
    saveQueue = saveQueue.then(async () => {
      if (disposed) return;
      const snapshot = await readWorkspaceSnapshot(email);
      const { error } = await client
        .from("grand_lumen_workspaces")
        .upsert({ user_id: userId, workspace_data: snapshot }, { onConflict: "user_id" });
      if (error) throw error;
      onStatus("All changes synced");
    }).catch(error => {
      onStatus(error instanceof Error ? error.message : "Cloud sync failed. Your device data remains available.");
    });
  };

  const schedulePersist = () => {
    if (disposed || applyingRemote) return;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      persist();
    }, 900);
  };

  Storage.prototype.setItem = function(key: string, value: string): void {
    const isLocal = this === window.localStorage;
    const previous = isLocal ? this.getItem(key) : null;
    originalSetItem.call(this, key, value);
    if (isLocal && isSyncableWorkspaceKey(key) && previous !== value) schedulePersist();
  };

  Storage.prototype.removeItem = function(key: string): void {
    const isLocal = this === window.localStorage;
    const existed = isLocal && this.getItem(key) !== null;
    originalRemoveItem.call(this, key);
    if (isLocal && isSyncableWorkspaceKey(key) && existed) schedulePersist();
  };

  Storage.prototype.clear = function(): void {
    const isLocal = this === window.localStorage;
    originalClear.call(this);
    if (isLocal) schedulePersist();
  };

  if (migrateLegacySnapshot) schedulePersist();

  const channel = client
    .channel("grand-lumen-workspace-" + userId)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "grand_lumen_workspaces",
      filter: "user_id=eq." + userId
    }, payload => {
      if (disposed || !payload.new?.workspace_data || saveTimer !== undefined) return;
      applyingRemote = true;
      void applyWorkspaceSnapshot(payload.new.workspace_data as WorkspaceSnapshot | { version: 1; data: Record<string, string> })
        .then(() => onStatus("Workspace updated from another device"))
        .catch(error => onStatus(error instanceof Error ? error.message : "A cloud update could not be applied"))
        .finally(() => {
          applyingRemote = false;
        });
    })
    .subscribe(status => {
      if (status === "SUBSCRIBED") onStatus("Cloud sync connected");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus("Live sync reconnecting");
    });

  const flush = () => {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
      persist();
    }
  };

  const handleScanRecordsUpdated = () => schedulePersist();
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", persist);
  window.addEventListener("grand-lumen-scan-records-updated", handleScanRecordsUpdated);

  return () => {
    disposed = true;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("online", persist);
    window.removeEventListener("grand-lumen-scan-records-updated", handleScanRecordsUpdated);
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    Storage.prototype.clear = originalClear;
    void client.removeChannel(channel);
  };
}
