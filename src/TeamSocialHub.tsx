import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./auth";
import "./team-social.css";

type SocialProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  interests: string[] | null;
  discoverable: boolean;
  profile_viewable: boolean;
  allow_requests: boolean;
  show_online: boolean;
  show_avatar: boolean;
  connection_count?: number;
};
type SocialRequest = { id: string; requester_id: string; recipient_id: string; created_at: string };
type Moment = { id: string; author_id: string; body: string; kind: string; visibility: string; media_path: string | null; media_type: string | null; created_at: string; expires_at: string };
type Notice = { id: string; title: string; body: string; kind: string; created_at: string; read_at: string | null };
type Broadcast = { id: string; title: string; body: string; kind: string; created_at: string };
type ConnectionRow = { id: string; user_low: string; user_high: string };
type Props = { userId: string; email: string; onOpenChat: (connection: ConnectionRow) => void };

const ADMIN_EMAIL = "emmanuelpobee112@gmail.com";
const momentBucket = "grand-lumen-moments";

export default function TeamSocialHub({ userId, email, onOpenChat }: Props) {
  const [tab, setTab] = useState("Discover");
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [directory, setDirectory] = useState<SocialProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<SocialProfile | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [connectionProfiles, setConnectionProfiles] = useState<SocialProfile[]>([]);
  const [requests, setRequests] = useState<SocialRequest[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [query, setQuery] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [profileViewable, setProfileViewable] = useState(true);
  const [allowRequests, setAllowRequests] = useState(true);
  const [showOnline, setShowOnline] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [momentBody, setMomentBody] = useState("");
  const [momentKind, setMomentKind] = useState("idea");
  const [momentVisibility, setMomentVisibility] = useState("connections");
  const [momentFile, setMomentFile] = useState<File | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, { id: string; user_id: string; body: string; created_at: string }[]>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastKind, setBroadcastKind] = useState("normal");
  const [broadcastPassword, setBroadcastPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL;

  const loadProfile = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_profiles").select("id,display_name,email,avatar_url,username,bio,cover_url,interests,discoverable,profile_viewable,allow_requests,show_online,show_avatar").eq("id", userId).maybeSingle();
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    const value = result.data as SocialProfile | null;
    setProfile(value);
    if (!value?.username) setTab("Privacy");
    setUsername(value?.username || "");
    setDisplayName(value?.display_name || "");
    setBio(value?.bio || "");
    setInterests((value?.interests || []).join(", "));
    setDiscoverable(value?.discoverable ?? true);
    setProfileViewable(value?.profile_viewable ?? true);
    setAllowRequests(value?.allow_requests ?? true);
    setShowOnline(value?.show_online ?? true);
    setShowAvatar(value?.show_avatar ?? true);
  }, [userId]);

  const loadConnections = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_team_connections").select("id,user_low,user_high").order("created_at", { ascending: false });
    if (result.error) return;
    const rows = (result.data || []) as ConnectionRow[];
    setConnections(rows);
    const ids = Array.from(new Set(rows.map(row => row.user_low === userId ? row.user_high : row.user_low)));
    if (!ids.length) {
      setConnectionProfiles([]);
      return;
    }
    const people = await supabase.rpc("grand_lumen_get_profiles_by_ids", { p_user_ids: ids });
    if (!people.error) setConnectionProfiles((people.data || []) as SocialProfile[]);
  }, [userId]);

  const loadMoments = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_moments").select("*").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100);
    if (!result.error) {
      const rows = (result.data || []) as Moment[];
      setMoments(rows);
      const ids = rows.map(item => item.id);
      if (ids.length) {
        const reactions = await supabase.from("grand_lumen_moment_reactions").select("moment_id,user_id").in("moment_id", ids);
        if (!reactions.error) {
          const counts: Record<string, number> = {};
          const currentLikes: Record<string, boolean> = {};
          for (const reaction of reactions.data || []) {
            counts[reaction.moment_id] = (counts[reaction.moment_id] || 0) + 1;
            if (reaction.user_id === userId) currentLikes[reaction.moment_id] = true;
          }
          setReactionCounts(counts);
          setLiked(currentLikes);
        }
      } else {
        setReactionCounts({});
        setLiked({});
      }
    }
  }, [userId]);

  const loadNotices = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_notifications").select("id,title,body,kind,created_at,read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (!result.error) setNotices((result.data || []) as Notice[]);
  }, [userId]);

  const loadBroadcasts = useCallback(async () => {
    if (!supabase || !isAdmin) return;
    const result = await supabase.from("grand_lumen_broadcasts").select("id,title,body,kind,created_at").order("created_at", { ascending: false }).limit(100);
    if (!result.error) setBroadcasts((result.data || []) as Broadcast[]);
  }, [isAdmin]);

  const loadRequests = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_connection_requests").select("id,requester_id,recipient_id,created_at").eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false });
    if (!result.error) setRequests((result.data || []) as SocialRequest[]);
  }, [userId]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadProfile(), loadConnections(), loadMoments(), loadNotices(), loadRequests(), loadBroadcasts()]);
  }, [loadProfile, loadConnections, loadMoments, loadNotices, loadRequests, loadBroadcasts]);

  useEffect(() => {
    void loadAll();
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-social-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_moments" }, () => void loadMoments())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_notifications", filter: "user_id=eq." + userId }, () => void loadNotices())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_connection_requests", filter: "recipient_id=eq." + userId }, () => void loadRequests())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadAll, loadMoments, loadNotices, loadRequests, userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel("grand-lumen-presence", { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => setOnlineIds(Object.keys(channel.presenceState())))
      .subscribe(async status => {
        if (status === "SUBSCRIBED" && showOnline) await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      });
    return () => { void supabase?.removeChannel(channel); };
  }, [userId, showOnline]);

  const filteredDirectory = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/^@/, "");
    if (!term) return directory;
    return directory.filter(person => (person.username || "").toLowerCase().includes(term) || (person.display_name || "").toLowerCase().includes(term));
  }, [directory, query]);

  const searchPeople = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const result = await supabase.rpc("grand_lumen_search_profiles", { p_query: query.trim() });
    if (result.error) setMessage(result.error.message);
    else setDirectory((result.data || []) as SocialProfile[]);
    setBusy(false);
  };

  const openProfile = async (person: SocialProfile) => {
    if (!supabase) return;
    const result = await supabase.rpc("grand_lumen_get_profile", { p_user_id: person.id });
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    setSelectedProfile((result.data?.[0] || result.data || person) as SocialProfile);
  };

  useEffect(() => {
    const sharedUsername = new URLSearchParams(window.location.search).get("lumen-profile");
    if (!sharedUsername || !supabase) return;
    let active = true;
    supabase.rpc("grand_lumen_get_shared_profile", { p_username: sharedUsername }).then(result => {
      if (!active) return;
      if (result.error) setMessage(result.error.message);
      else if (result.data?.[0]) {
        setSelectedProfile(result.data[0] as SocialProfile);
        setTab("Discover");
      } else setMessage("This profile is unavailable or its owner has disabled profile viewing.");
    });
    return () => { active = false; };
  }, []);

  const sendRequest = async (personId: string) => {
    if (!supabase) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_send_connection_request", { p_recipient_id: personId });
    setMessage(result.error ? result.error.message : "Connection request sent.");
    setBusy(false);
    await loadRequests();
  };

  const respondRequest = async (requestId: string, accept: boolean) => {
    if (!supabase) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_handle_connection_request", { p_request_id: requestId, p_accept: accept });
    setMessage(result.error ? result.error.message : accept ? "Connection accepted. You can open their chat whenever you want." : "Request declined.");
    setBusy(false);
    await Promise.all([loadRequests(), loadConnections()]);
  };

  const removeConnection = async (personId: string) => {
    if (!supabase || !window.confirm("Remove this connection? Their chat will no longer be available in your network.")) return;
    const result = await supabase.rpc("grand_lumen_remove_connection", { p_user_id: personId });
    setMessage(result.error ? result.error.message : "Connection removed.");
    setSelectedProfile(null);
    await loadConnections();
  };

  const blockPerson = async (personId: string) => {
    if (!supabase || !window.confirm("Block this member? They will no longer be able to find or contact you.")) return;
    const result = await supabase.rpc("grand_lumen_block_profile", { p_user_id: personId });
    setMessage(result.error ? result.error.message : "Member blocked.");
    setSelectedProfile(null);
    await Promise.all([loadConnections(), searchPeople()]);
  };

  const savePrivacy = async () => {
    if (!supabase) return;
    const normalized = username.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
      setMessage("Username must be 3–24 characters and use only letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    const result = await supabase.from("grand_lumen_profiles").update({
      username: normalized,
      display_name: displayName.trim(),
      bio: bio.trim(),
      interests: interests.split(",").map(item => item.trim()).filter(Boolean).slice(0, 12),
      discoverable,
      profile_viewable: profileViewable,
      allow_requests: allowRequests,
      show_online: showOnline,
      show_avatar: showAvatar
    }).eq("id", userId);
    setMessage(result.error ? result.error.code === "23505" ? "That username is already taken. Choose another one." : result.error.message : "Your profile and privacy settings have been saved.");
    setBusy(false);
    await loadProfile();
  };

  const createMoment = async () => {
    if (!supabase || (!momentBody.trim() && !momentFile)) return;
    setBusy(true);
    setMessage("");
    try {
      let mediaPath: string | null = null;
      let mediaType: string | null = null;
      if (momentFile) {
        if (momentFile.size > 50 * 1024 * 1024) throw new Error("Moment media must be 50 MB or smaller.");
        mediaType = momentFile.type.startsWith("video/") ? "video" : "image";
        mediaPath = userId + "/" + crypto.randomUUID() + "-" + momentFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const upload = await supabase.storage.from(momentBucket).upload(mediaPath, momentFile, { contentType: momentFile.type, upsert: false });
        if (upload.error) throw upload.error;
      }
      const result = await supabase.rpc("grand_lumen_create_moment", {
        p_body: momentBody.trim(),
        p_kind: momentKind,
        p_visibility: momentVisibility,
        p_media_path: mediaPath,
        p_media_type: mediaType,
        p_tagged_users: taggedUsers
      });
      if (result.error) {
        if (mediaPath) await supabase.storage.from(momentBucket).remove([mediaPath]);
        throw result.error;
      }
      setMomentBody("");
      setMomentFile(null);
      setTaggedUsers([]);
      setMessage("Your moment is live for 24 hours.");
      await loadMoments();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your moment could not be published.");
    } finally {
      setBusy(false);
    }
  };

  const reactToMoment = async (momentId: string) => {
    if (!supabase) return;
    const existing = await supabase.from("grand_lumen_moment_reactions").select("moment_id").eq("moment_id", momentId).eq("user_id", userId).maybeSingle();
    if (existing.data) {
      const removed = await supabase.from("grand_lumen_moment_reactions").delete().eq("moment_id", momentId).eq("user_id", userId);
      if (!removed.error) {
        setLiked(current => ({ ...current, [momentId]: false }));
        setReactionCounts(current => ({ ...current, [momentId]: Math.max(0, (current[momentId] || 0) - 1) }));
      }
    } else {
      const result = await supabase.from("grand_lumen_moment_reactions").insert({ moment_id: momentId, user_id: userId });
      if (!result.error) {
        setLiked(current => ({ ...current, [momentId]: true }));
        setReactionCounts(current => ({ ...current, [momentId]: (current[momentId] || 0) + 1 }));
      }
    }
  };

  const loadComments = async (momentId: string) => {
    if (!supabase) return;
    const result = await supabase.from("grand_lumen_moment_comments").select("id,user_id,body,created_at").eq("moment_id", momentId).order("created_at", { ascending: true });
    if (!result.error) setComments(current => ({ ...current, [momentId]: result.data || [] }));
  };

  const addComment = async (momentId: string) => {
    if (!supabase || !commentDrafts[momentId]?.trim()) return;
    const result = await supabase.from("grand_lumen_moment_comments").insert({ moment_id: momentId, user_id: userId, body: commentDrafts[momentId].trim() });
    if (result.error) setMessage(result.error.message);
    else {
      setCommentDrafts(current => ({ ...current, [momentId]: "" }));
      await loadComments(momentId);
    }
  };

  const deleteMoment = async (moment: Moment) => {
    if (!supabase || moment.author_id !== userId) return;
    if (!window.confirm("Delete this moment for everyone?")) return;
    const result = await supabase.from("grand_lumen_moments").delete().eq("id", moment.id).eq("author_id", userId);
    if (!result.error && moment.media_path) {
      const removed = await supabase.storage.from(momentBucket).remove([moment.media_path]);
      if (removed.error) setMessage("Moment deleted, but its media file could not be removed from storage: " + removed.error.message);
    }
    setMessage(result.error ? result.error.message : "Moment deleted.");
    await loadMoments();
  };

  const markRead = async (notice: Notice) => {
    if (!supabase || notice.read_at) return;
    await supabase.from("grand_lumen_notifications").update({ read_at: new Date().toISOString() }).eq("id", notice.id).eq("user_id", userId);
    await loadNotices();
  };

  const publishBroadcast = async () => {
    if (!supabase || !broadcastTitle.trim() || !broadcastBody.trim() || !broadcastPassword) return;
    setBusy(true);
    setMessage("");
    try {
      const auth = await supabase.auth.signInWithPassword({ email, password: broadcastPassword });
      if (auth.error) throw new Error("Password verification failed. Check your account password.");
      if (auth.data.user?.id !== userId) throw new Error("The verified account does not match the active administrator.");
      const result = await supabase.rpc("grand_lumen_publish_broadcast", {
        p_title: broadcastTitle.trim(),
        p_body: broadcastBody.trim(),
        p_kind: broadcastKind
      });
      if (result.error) throw result.error;
      setBroadcastTitle("");
      setBroadcastBody("");
      setBroadcastPassword("");
      setMessage("Official Grand-Lumen announcement published.");
      await Promise.all([loadNotices(), loadBroadcasts()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The announcement could not be published.");
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    if (!supabase) return;
    await supabase.from("grand_lumen_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    await loadNotices();
  };

  const openConnectionChat = (personId: string) => {
    const connection = connections.find(row => row.user_low === personId || row.user_high === personId);
    if (connection) onOpenChat(connection);
  };

  const remainingTime = (expiresAt: string) => {
    const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return hours + "h " + minutes + "m left";
  };
  const privacyToggles = [
    { value: discoverable, setter: setDiscoverable, label: "Appear in Lumen Connect" },
    { value: profileViewable, setter: setProfileViewable, label: "Allow people to open your profile" },
    { value: allowRequests, setter: setAllowRequests, label: "Allow connection requests" },
    { value: showOnline, setter: setShowOnline, label: "Show online status" },
    { value: showAvatar, setter: setShowAvatar, label: "Show profile picture" }
  ];

  return <section className="team-social">
    <header className="team-social-heading"><div><span className="team-social-eyebrow">THE GRAND-LUMEN NETWORK</span><h2>Connect, share and stay in the loop.</h2><p>Discover people, share moments and manage how others see your profile.</p></div><span className="team-social-mark">GL</span></header>
    <nav className="team-social-tabs">{["Discover","Moments","Notifications","Privacy",...(isAdmin ? ["Administrator"] : [])].map(item => <button type="button" className={tab === item ? "active" : ""} key={item} disabled={!profile?.username && ["Discover","Moments"].includes(item)} onClick={() => { setTab(item); setSelectedProfile(null); }}>{item}{item === "Notifications" && notices.some(notice => !notice.read_at) ? <i/> : null}</button>)}</nav>
    {message && <div className="team-social-message" role="status">{message}</div>}
    {tab === "Discover" && <div className="team-social-panel">
      <div className="team-social-search"><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchPeople(); }} placeholder="Search by name or @username"/><button type="button" disabled={busy} onClick={() => void searchPeople()}>Search members</button></div>
      {requests.length > 0 && <section className="team-social-subpanel"><h3>Connection requests <span>{requests.length}</span></h3>{requests.map(request => <article className="team-social-person" key={request.id}><div><b>New connection request</b><small>Review the request to connect.</small></div><div className="team-social-actions"><button type="button" onClick={() => void respondRequest(request.id, false)} disabled={busy}>Decline</button><button type="button" className="primary" onClick={() => void respondRequest(request.id, true)} disabled={busy}>Accept</button></div></article>)}</section>}
      {selectedProfile && <section className="team-social-profile"><button type="button" className="team-social-back" onClick={() => setSelectedProfile(null)}>← Back to discovery</button><div className="team-social-profile-cover" style={selectedProfile.cover_url ? { backgroundImage: "url(" + selectedProfile.cover_url + ")" } : {}}/><div className="team-social-profile-main"><div className="team-social-avatar">{selectedProfile.show_avatar && selectedProfile.avatar_url ? <img src={selectedProfile.avatar_url} alt=""/> : (selectedProfile.display_name || "G").slice(0,1).toUpperCase()}</div><div><h3>{selectedProfile.display_name || "Grand-Lumen member"}</h3><b>@{selectedProfile.username}</b><p>{selectedProfile.bio || "No biography added yet."}</p>{(selectedProfile.interests || []).length > 0 && <small>{selectedProfile.interests?.join(" · ")}</small>}</div></div><div className="team-social-actions"><button type="button" onClick={() => void sendRequest(selectedProfile.id)} disabled={busy || !selectedProfile.allow_requests}>Send connection request</button><button type="button" onClick={() => void navigator.clipboard?.writeText(window.location.origin + window.location.pathname + "?lumen-profile=" + encodeURIComponent(selectedProfile.username || "")).then(() => setMessage("Profile link copied.")).catch(() => setMessage("Clipboard access is unavailable on this device."))}>Copy profile link</button><button type="button" onClick={() => void blockPerson(selectedProfile.id)}>Block</button>{connections.some(row => row.user_low === selectedProfile.id || row.user_high === selectedProfile.id) && <><button type="button" className="primary" onClick={() => openConnectionChat(selectedProfile.id)}>Open chat</button><button type="button" onClick={() => void removeConnection(selectedProfile.id)}>Remove connection</button></>}</div></section>}
      <div className="team-social-directory">{filteredDirectory.map(person => <article className="team-social-person" key={person.id}><div className="team-social-avatar small">{person.show_avatar && person.avatar_url ? <img src={person.avatar_url} alt=""/> : (person.display_name || "G").slice(0,1).toUpperCase()}</div><div className="team-social-person-copy"><b>{person.display_name || "Grand-Lumen member"}</b><small>@{person.username} · {person.connection_count || 0} connections{person.show_online && onlineIds.includes(person.id) ? " · Online" : ""}</small></div><div className="team-social-actions"><button type="button" disabled={!person.profile_viewable} onClick={() => void openProfile(person)}>{person.profile_viewable ? "View profile" : "Profile private"}</button><button type="button" className="primary" disabled={busy || !person.allow_requests} onClick={() => void sendRequest(person.id)}>Connect</button></div></article>)}</div>
      {!directory.length && <p className="team-social-empty">Search for people who have chosen to appear in Lumen Connect.</p>}
    </div>}
    {tab === "Moments" && <div className="team-social-panel">
      <section className="team-social-composer"><div className="team-social-composer-title"><h3>Share a Lumen Moment</h3><span>EXPIRES AFTER 24 HOURS</span></div><textarea value={momentBody} onChange={event => setMomentBody(event.target.value)} rows={3} placeholder="Share an idea, thought or update…"/><div className="team-social-compose-options"><select value={momentKind} onChange={event => setMomentKind(event.target.value)}><option value="idea">Idea</option><option value="text">Text update</option><option value="photo">Photo</option><option value="video">Video</option></select><select value={momentVisibility} onChange={event => setMomentVisibility(event.target.value)}><option value="connections">My connections</option><option value="tagged">Tagged people only</option><option value="public">Everyone discoverable</option></select><select multiple value={taggedUsers} onChange={event => setTaggedUsers(Array.from(event.target.selectedOptions).map(option => option.value))}>{connectionProfiles.map(person => <option key={person.id} value={person.id}>{person.display_name || person.username || "Member"}</option>)}</select><label className="team-social-file">Add photo/video<input type="file" accept="image/*,video/*" onChange={event => setMomentFile(event.target.files?.[0] || null)}/></label><button type="button" className="primary" onClick={() => void createMoment()} disabled={busy || (!momentBody.trim() && !momentFile)}>Publish moment</button></div>{momentFile && <small>{momentFile.name}</small>}</section>
      <div className="team-social-moments">{moments.map(moment => <article className="team-social-moment" key={moment.id}><div className="team-social-moment-meta"><b>{moment.author_id === userId ? displayName || "You" : connectionProfiles.find(person => person.id === moment.author_id)?.display_name || "Grand-Lumen member"}</b><span>{remainingTime(moment.expires_at)}</span></div>{moment.body && <p>{moment.body}</p>}{moment.media_path && <MomentMedia path={moment.media_path} type={moment.media_type || "image"}/>}<div className="team-social-actions"><button type="button" onClick={() => void reactToMoment(moment.id)}>{liked[moment.id] ? "♥ Liked" : "♡ Like"} · {reactionCounts[moment.id] || 0}</button><button type="button" onClick={() => void loadComments(moment.id)}>View replies</button>{moment.author_id === userId && <button type="button" onClick={() => void deleteMoment(moment)}>Delete</button>}</div>{comments[moment.id] && <div className="team-social-comments">{comments[moment.id].map(comment => <p key={comment.id}>{comment.body}</p>)}<div><input value={commentDrafts[moment.id] || ""} onChange={event => setCommentDrafts(current => ({ ...current, [moment.id]: event.target.value }))} placeholder="Write a reply"/><button type="button" onClick={() => void addComment(moment.id)}>Reply</button></div></div>}</article>)}</div>
      {!moments.length && <p className="team-social-empty">No active moments yet. Share the first one with your connections.</p>}
    </div>}
    {tab === "Notifications" && <div className="team-social-panel"><div className="team-social-panel-title"><h3>Your notifications</h3><button type="button" onClick={() => void markAllRead()}>Mark all read</button></div>{notices.map(notice => <article className={"team-social-notice " + notice.kind + (!notice.read_at ? " unread" : "")} key={notice.id} onClick={() => void markRead(notice)}><div className="team-social-notice-badge">{notice.kind === "important" ? "!" : notice.kind === "broadcast" ? "GL" : "•"}</div><div><b>{notice.title}</b><p>{notice.body}</p><small>{new Date(notice.created_at).toLocaleString()}</small></div>{!notice.read_at && <i/>}</article>)}{!notices.length && <p className="team-social-empty">You are all caught up.</p>}</div>}
    {tab === "Privacy" && <div className="team-social-panel"><h3>Your public identity</h3><div className="team-social-form-grid"><label>Unique username<input value={username} onChange={event => setUsername(event.target.value)} placeholder="your_username"/></label><label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your display name"/></label><label className="wide">Biography<textarea value={bio} onChange={event => setBio(event.target.value)} rows={3}/></label><label className="wide">Interests and skills<input value={interests} onChange={event => setInterests(event.target.value)} placeholder="Design, coding, science"/></label></div><div className="team-social-toggles">{privacyToggles.map(item => <label key={item.label}><span>{item.label}</span><input type="checkbox" checked={item.value} onChange={event => item.setter(event.target.checked)}/></label>)}</div><button type="button" className="primary" onClick={() => void savePrivacy()} disabled={busy}>Save profile and privacy</button><p className="team-social-help">Turning off discovery hides you from new searches. Existing connections and conversations remain intact.</p></div>}
    {tab === "Administrator" && isAdmin && <div className="team-social-panel"><div className="team-social-admin-mark">✓ <span>GRAND-LUMEN OFFICIAL</span></div><h3>Broadcast centre</h3><p>Publish official updates to the in-app notification centre of every registered member.</p><label>Announcement title<input value={broadcastTitle} onChange={event => setBroadcastTitle(event.target.value)} placeholder="A message from Grand-Lumen"/></label><label>Announcement message<textarea value={broadcastBody} onChange={event => setBroadcastBody(event.target.value)} rows={4} placeholder="Write your announcement…"/></label><label>Announcement type<select value={broadcastKind} onChange={event => setBroadcastKind(event.target.value)}><option value="normal">Normal announcement</option><option value="important">Important announcement</option></select></label><label>Confirm your account password<input type="password" autoComplete="current-password" value={broadcastPassword} onChange={event => setBroadcastPassword(event.target.value)} placeholder="Re-enter your account password"/></label><button type="button" className="primary" disabled={busy || !broadcastTitle.trim() || !broadcastBody.trim() || !broadcastPassword} onClick={() => void publishBroadcast()}>{busy ? "Verifying and publishing…" : "Verify and publish to everyone"}</button><p className="team-social-help">Your password is used only for sign-in verification and is not saved by this feature. Every broadcast is recorded in the official announcement history.</p><section className="team-social-subpanel"><h3>Announcement history <span>{broadcasts.length}</span></h3>{broadcasts.map(item => <article className="team-social-notice" key={item.id}><div className="team-social-notice-badge">{item.kind === "important" ? "!" : "GL"}</div><div><b>{item.title}</b><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article>)}{!broadcasts.length && <p className="team-social-empty">No announcements have been published yet.</p>}</section></div>}
  </section>;
}

function MomentMedia({ path, type }: { path: string; type: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.storage.from(momentBucket).createSignedUrl(path, 900).then(result => {
      if (active && result.data?.signedUrl) setUrl(result.data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="team-social-media-loading">Loading media…</div>;
  return type === "video" ? <video className="team-social-media" src={url} controls preload="metadata"/> : <img className="team-social-media" src={url} alt="Moment attachment"/>;
}
