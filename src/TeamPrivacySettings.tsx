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
};

export default function TeamPrivacySettings({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [profileViewable, setProfileViewable] = useState(true);
  const [allowRequests, setAllowRequests] = useState(true);
  const [showOnline, setShowOnline] = useState(true);
  const [showAvatar, setShowAvatar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase || !userId) return;
    let active = true;
    supabase.from("grand_lumen_profiles").select("username,display_name,discoverable,profile_viewable,allow_requests,show_online,show_avatar").eq("id", userId).maybeSingle().then(result => {
      if (!active) return;
      if (result.error) {
        setNotice(result.error.message);
        return;
      }
      const value = result.data as SettingsProfile | null;
      setProfile(value);
      setUsername(value?.username || "");
      setDisplayName(value?.display_name || "");
      setDiscoverable(value?.discoverable ?? true);
      setProfileViewable(value?.profile_viewable ?? true);
      setAllowRequests(value?.allow_requests ?? true);
      setShowOnline(value?.show_online ?? true);
      setShowAvatar(value?.show_avatar ?? true);
    });
    return () => { active = false; };
  }, [userId]);

  const save = async () => {
    if (!supabase || !userId) return;
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

  if (!supabase || !userId) return <div className="team-social"><div className="team-social-panel"><h3>Lumen Connect privacy</h3><p>Sign in with a Grand-Lumen cloud account to manage your public profile and connection privacy.</p></div></div>;

  return <div className="team-social"><div className="team-social-panel"><div><span className="team-social-eyebrow">TEAM ACCOUNT CONTROLS</span><h3>Lumen Connect privacy</h3><p>Control whether people can discover your account, open your profile and send connection requests. These settings also apply to your profile inside Team.</p></div><div className="team-social-form-grid"><label>Unique username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></label><label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your display name"/></label></div><div className="team-social-toggles">{[{value:discoverable,setter:setDiscoverable,label:"Appear in Lumen Connect searches"},{value:profileViewable,setter:setProfileViewable,label:"Allow people with your profile link to view your profile"},{value:allowRequests,setter:setAllowRequests,label:"Allow connection requests"},{value:showOnline,setter:setShowOnline,label:"Show online status"},{value:showAvatar,setter:setShowAvatar,label:"Show your profile picture"}].map(item => <label key={item.label}><span>{item.label}</span><input type="checkbox" checked={item.value} onChange={event => item.setter(event.target.checked)}/></label>)}</div><button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save privacy settings"}</button>{notice && <div className="team-social-message" role="status">{notice}</div>}<p className="team-social-help">Disabling discovery hides you from new searches. Existing connections and conversations are not removed.</p></div></div>;
}
