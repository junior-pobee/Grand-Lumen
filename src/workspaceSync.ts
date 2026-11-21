import type { SupabaseClient } from "@supabase/supabase-js";

type WorkspaceSnapshot = {
  version: 1;
  data: Record<string, string>;
};

const excludedKeys = new Set([
  "grandLumenLocalAccounts",
  "grandLumenLocalSession",
  "grandLumenProfileImages",
  "grandLumenProfileImage"
]);

export function isSyncableWorkspaceKey(key: string): boolean {
  if (excludedKeys.has(key)) return false;
  return key.startsWith("grandLumen") || key === "lumenReminders";
}

function readWorkspaceSnapshot(): WorkspaceSnapshot {
  const data: Record<string, string> = {};
  let totalBytes = 0;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSyncableWorkspaceKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    totalBytes += new Blob([key, value]).size;
    if (totalBytes > 4 * 1024 * 1024) throw new Error("Your workspace is larger than the current cloud-sync limit. Export a backup before syncing.");
    data[key] = value;
  }
  return { version: 1, data };
}

function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  if (!snapshot || snapshot.version !== 1 || !snapshot.data || typeof snapshot.data !== "object") {
    throw new Error("The cloud workspace format is not supported.");
  }
  const existingKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && isSyncableWorkspaceKey(key)) existingKeys.push(key);
  }
  existingKeys.forEach(key => localStorage.removeItem(key));
  Object.entries(snapshot.data).forEach(([key, value]) => {
    if (isSyncableWorkspaceKey(key) && typeof value === "string") localStorage.setItem(key, value);
  });
  window.dispatchEvent(new CustomEvent("grand-lumen-workspace-restored"));
  window.dispatchEvent(new CustomEvent("lumen-reminders-updated"));
}

export async function startWorkspaceCloudSync(
  client: SupabaseClient,
  userId: string,
  onStatus: (message: string) => void
): Promise<() => void> {
  const { data: cloudRecord, error: loadError } = await client
    .from("grand_lumen_workspaces")
    .select("workspace_data")
    .eq("user_id", userId)
    .maybeSingle();

  if (loadError) throw loadError;

  if (cloudRecord?.workspace_data) {
    applyWorkspaceSnapshot(cloudRecord.workspace_data as WorkspaceSnapshot);
    localStorage.setItem("grandLumenCloudOwner", userId);
    onStatus("Cloud workspace restored");
  } else {
    const previousOwner = localStorage.getItem("grandLumenCloudOwner");
    const initialSnapshot = previousOwner && previousOwner !== userId
      ? { version: 1 as const, data: {} }
      : readWorkspaceSnapshot();
    if (previousOwner && previousOwner !== userId) applyWorkspaceSnapshot(initialSnapshot);
    const { error: createError } = await client
      .from("grand_lumen_workspaces")
      .upsert({ user_id: userId, workspace_data: initialSnapshot }, { onConflict: "user_id" });
    if (createError) throw createError;
    localStorage.setItem("grandLumenCloudOwner", userId);
    onStatus("This device's workspace was backed up");
  }

  let disposed = false;
  let applyingRemote = false;
  let saveTimer: number | undefined;
  let saveQueue = Promise.resolve();
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  const persist = () => {
    if (disposed) return;
    let snapshot: WorkspaceSnapshot;
    try {
      snapshot = readWorkspaceSnapshot();
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Workspace is too large to sync");
      return;
    }
    saveQueue = saveQueue.then(async () => {
      if (disposed) return;
      const { error } = await client
        .from("grand_lumen_workspaces")
        .upsert({ user_id: userId, workspace_data: snapshot }, { onConflict: "user_id" });
      if (error) throw error;
      onStatus("All changes saved");
    }).catch(error => {
      onStatus(error instanceof Error ? error.message : "Cloud sync is temporarily unavailable");
    });
  };

  const schedulePersist = () => {
    if (disposed || applyingRemote) return;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 900);
  };

  Storage.prototype.setItem = function(key: string, value: string): void {
    const previous = this === window.localStorage ? this.getItem(key) : null;
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && isSyncableWorkspaceKey(key) && previous !== value) schedulePersist();
  };

  Storage.prototype.removeItem = function(key: string): void {
    const existed = this === window.localStorage && this.getItem(key) !== null;
    originalRemoveItem.call(this, key);
    if (this === window.localStorage && isSyncableWorkspaceKey(key) && existed) schedulePersist();
  };

  const channel = client
    .channel("grand-lumen-workspace-" + userId)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "grand_lumen_workspaces",
      filter: "user_id=eq." + userId
    }, payload => {
      if (disposed || !payload.new?.workspace_data) return;
      applyingRemote = true;
      try {
        applyWorkspaceSnapshot(payload.new.workspace_data as WorkspaceSnapshot);
        window.dispatchEvent(new Event("storage"));
        onStatus("Workspace updated from another device");
      } catch (error) {
        onStatus(error instanceof Error ? error.message : "A cloud update could not be applied");
      } finally {
        applyingRemote = false;
      }
    })
    .subscribe(status => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus("Live sync reconnecting");
    });

  const flush = () => {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
      persist();
    }
  };

  window.addEventListener("pagehide", flush);

  return () => {
    disposed = true;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    window.removeEventListener("pagehide", flush);
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    void client.removeChannel(channel);
  };
}
