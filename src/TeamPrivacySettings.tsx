import { useEffect, useState } from "react";
import { supabase } from "./auth";
import "./team-social.css";

type SettingsProfile = {
  username: string | null;
  display_name: string | null;
  discoverable: boolean;
  profile_viewable: boolean;
  allow_requests: boolean;
  show_online: boolean;
  show_avatar: boolean;
  account_status: "active" | "deactivated" | "deleted";
};

export default function TeamPrivacySettings({ userId }: { userId: string }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [chatDisplayName, setChatDisplayName] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [profileViewable, setProfileViewable] = useState(true);
  const [allowRequests, setAllowRequests] = useState(true);
  const [showOnline, setShowOnline] = useState(true);
  const [showAvatar, setShowAvatar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [accountStatus, setAccountStatus] = useState<"active" | "deactivated" | "deleted">("active");

  useEffect(() => {
    if (!supabase || !userId) return;
    let active = true;
    supabase.from("grand_lumen_profiles").select("username,display_name,discoverable,profile_viewable,allow_requests,show_online,show_avatar,account_status").eq("id", userId).maybeSingle().then(result => {
      if (!active) return;
      if (result.error) {
        setNotice(result.error.message);
        return;
      }
      const value = result.data as SettingsProfile | null;
      setUsername(value?.username || "");
      setDisplayName(value?.display_name || "");
      supabase.from("grand_lumen_profiles").select("chat_display_name").eq("id", userId).maybeSingle().then(chatResult => {
        if (active && !chatResult.error) setChatDisplayName(chatResult.data?.chat_display_name || "");
      });
      setDiscoverable(value?.discoverable ?? true);
      setProfileViewable(value?.profile_viewable ?? true);
      setAllowRequests(value?.allow_requests ?? true);
      setShowOnline(value?.show_online ?? true);
      setShowAvatar(value?.show_avatar ?? true);
      setAccountStatus(value?.account_status || "active");
    });
    return () => { active = false; };
  }, [userId]);

  const save = async () => {
    if (!supabase || !userId || busy) return;
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
      setNotice("Username must be 3–24 characters and use only letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    const result = await supabase.from("grand_lumen_profiles").update({
      username: normalized,
      display_name: displayName.trim(),
      discoverable,
      profile_viewable: profileViewable,
      allow_requests: allowRequests,
      show_online: showOnline,
      show_avatar: showAvatar
    }).eq("id", userId);
    setNotice(result.error ? result.error.code === "23505" ? "That username is already taken." : result.error.message : "Lumen Connect privacy settings saved.");
    setBusy(false);
  };

  const saveChatName = async () => {
    if (!supabase || !userId || busy) return;
    const normalized = chatDisplayName.trim();
    if (!normalized || normalized.length > 80) { setNotice("Enter a chat name between 1 and 80 characters."); return; }
    setBusy(true);
    const result = await supabase.from("grand_lumen_profiles").update({ chat_display_name: normalized }).eq("id", userId);
    setNotice(result.error ? result.error.message : "Chat display name saved. Your account name remains unchanged.");
    setBusy(false);
  };

  const manageAccount = async (action: "deactivate" | "reactivate" | "delete") => {
    if (!supabase || busy) return;
    if (action === "deactivate" && !window.confirm("Deactivate your Grand-Lumen account? Your profile will be hidden, and your connections and groups will be notified.")) return;
    if (action === "reactivate" && !window.confirm("Reactivate your Grand-Lumen account and restore the privacy settings you had before deactivation?")) return;
    let confirmation = "";
    if (action === "delete") {
      if (!window.confirm("Permanently delete your account? Your connections and groups will be notified. Your existing posts and messages will remain blurred and labelled Account Deleted. This cannot be undone.")) return;
      confirmation = window.prompt("Type DELETE to confirm permanent account deletion.") || "";
      if (confirmation !== "DELETE") {
        setNotice("Account deletion was not confirmed.");
        return;
      }
    }
    setBusy(true);
    setNotice("");
    const result = await supabase.functions.invoke("account-lifecycle", { body: { action, confirmation } });
    if (result.error) {
      setNotice(result.error.message || "The account action could not be completed.");
      setBusy(false);
      return;
    }
    const nextStatus = result.data?.status || (action === "deactivate" ? "deactivated" : action === "delete" ? "deleted" : "active");
    setAccountStatus(nextStatus);
    setNotice(action === "delete" ? "Your account has been anonymised and sign-in disabled. Your connections and groups have been notified." : action === "deactivate" ? "Your account is deactivated. Your connections and groups have been notified. You can reactivate it here." : "Your account has been reactivated.");
    setBusy(false);
    if (action === "delete") await supabase.auth.signOut();
  };

  if (!supabase || !userId) return <div className="team-social"><div className="team-social-panel"><h3>Lumen Connect privacy</h3><p>Sign in with a Grand-Lumen cloud account to manage your public profile and connection privacy.</p></div></div>;

  return <div className="team-social"><div className="team-social-panel"><div><span className="team-social-eyebrow">TEAM ACCOUNT CONTROLS</span><h3>Lumen Connect privacy</h3><p>Control whether people can discover your account, open your profile and send connection requests. These settings also apply to your profile inside Team.</p></div><div className="team-social-form-grid"><label>Unique username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></label><label>Account display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your account name"/></label></div><div className="team-social-form-grid"><label className="wide">Chat display name<input value={chatDisplayName} onChange={event => setChatDisplayName(event.target.value)} maxLength={80} placeholder="Name shown to connections in chats"/></label></div><p className="team-social-help">This chat name is separate from your account display name. It appears beside your messages in private and group conversations only.</p><button type="button" className="primary" disabled={busy || accountStatus !== "active"} onClick={() => void saveChatName()}>{busy ? "Saving…" : "Save chat display name"}</button><div className="team-social-toggles">{[{value:discoverable,setter:setDiscoverable,label:"Appear in Lumen Connect searches"},{value:profileViewable,setter:setProfileViewable,label:"Allow people with your profile link to view your profile"},{value:allowRequests,setter:setAllowRequests,label:"Allow connection requests"},{value:showOnline,setter:setShowOnline,label:"Show online status"},{value:showAvatar,setter:setShowAvatar,label:"Show your profile picture"}].map(item => <label key={item.label}><span>{item.label}</span><input type="checkbox" checked={item.value} onChange={event => item.setter(event.target.checked)}/></label>)}</div><button type="button" className="primary" disabled={busy || accountStatus !== "active"} onClick={() => void save()}>{busy ? "Saving…" : "Save privacy settings"}</button>{notice && <div className="team-social-message" role="status">{notice}</div>}<p className="team-social-help">Disabling discovery hides you from new searches. Existing connections and conversations are not removed.</p><section className="team-account-management"><div><span className="team-social-eyebrow">ACCOUNT MANAGEMENT</span><h3>Account status: {accountStatus === "active" ? "Active" : accountStatus === "deactivated" ? "Deactivated" : "Deleted"}</h3><p>{accountStatus === "deactivated" ? "Your profile is hidden from searches and shared links. Your existing content remains available." : accountStatus === "deleted" ? "This account has been deleted and cannot be restored." : "Temporarily deactivate your account or permanently delete it."}</p></div>{accountStatus === "active" && <><button type="button" className="team-account-deactivate" disabled={busy} onClick={() => void manageAccount("deactivate")}>{busy ? "Please wait…" : "Deactivate account"}</button><button type="button" className="team-account-delete" disabled={busy} onClick={() => void manageAccount("delete")}>Permanently delete account</button></>}{accountStatus === "deactivated" && <button type="button" className="primary" disabled={busy} onClick={() => void manageAccount("reactivate")}>{busy ? "Please wait…" : "Reactivate account"}</button>}</section></div></div>;
}
