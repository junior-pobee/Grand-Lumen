import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Mic, Paperclip, Phone, Plus, Send, Settings, Trash2, UserPlus, Users, Video, X } from "lucide-react";
import Peer from "peerjs";
import { supabase } from "./auth";

type Connection = { id: string; user_low: string; user_high: string };
type Profile = { id: string; display_name: string | null; email: string | null; avatar_url: string | null };
type Group = { id: string; name: string; created_by: string; created_at: string };
type Member = { group_id: string; user_id: string; role: "admin" | "member"; joined_at: string; left_at: string | null };
type GroupMessage = { id: string; group_id: string; sender_id: string; body: string; created_at: string; deleted_for_everyone: boolean };
type Attachment = { name: string; path: string; mime: string; size: number; kind: "image" | "video" | "audio" | "file" };
type CallInvite = { id: string; session_id: string; group_id: string; caller_id: string; recipient_id: string; peer_id: string; media_type: "audio" | "video"; status: string };
type CallParticipant = { session_id: string; user_id: string; peer_id: string };

const prefix = "GLGROUPATTACH:";
const readAttachment = (body: string): Attachment | null => {
  if (!body.startsWith(prefix)) return null;
  try { return JSON.parse(body.slice(prefix.length)) as Attachment; } catch { return null; }
};

export default function GroupChatWorkspace({ userId, connections, profiles }: { userId: string; connections: Connection[]; profiles: Record<string, Profile> }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupProfiles, setGroupProfiles] = useState<Record<string, Profile>>({});
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [selected, setSelected] = useState<Group | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [messageMenu, setMessageMenu] = useState<GroupMessage | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallInvite | null>(null);
  const [activeCall, setActiveCall] = useState<{ id: string; groupId: string; mediaType: "audio" | "video"; hostId: string } | null>(null);
  const [callStatus, setCallStatus] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [callParticipants, setCallParticipants] = useState<CallParticipant[]>([]);
  const [callBusy, setCallBusy] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pressTimerRef = useRef<number | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callsRef = useRef<Record<string, any>>({});
  const peerUsersRef = useRef<Record<string, string>>({});
  const calledPeersRef = useRef<Set<string>>(new Set());

  const connectedIds = connections.map(item => item.user_low === userId ? item.user_high : item.user_low);
  const availableMembers = Array.from(new Set(connectedIds)).filter(id => id !== userId);
  const activeMembers = selected ? (members[selected.id] || []).filter(item => !item.left_at) : [];
  const isAdmin = activeMembers.some(item => item.user_id === userId && item.role === "admin");

  const loadGroups = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    const membershipResult = await supabase.from("grand_lumen_group_chat_members").select("group_id,user_id,role,joined_at,left_at").eq("user_id", userId).is("left_at", null).order("joined_at", { ascending: false });
    if (membershipResult.error) {
      setNotice(membershipResult.error.message);
      setLoading(false);
      return;
    }
    const mine = (membershipResult.data || []) as Member[];
    if (!mine.length) {
      setGroups([]);
      setMembers({});
      setLoading(false);
      return;
    }
    const ids = mine.map(item => item.group_id);
    const [groupResult, memberResult] = await Promise.all([
      supabase.from("grand_lumen_group_chats").select("id,name,created_by,created_at").in("id", ids).order("updated_at", { ascending: false }),
      supabase.from("grand_lumen_group_chat_members").select("group_id,user_id,role,joined_at,left_at").in("group_id", ids)
    ]);
    if (groupResult.error) setNotice(groupResult.error.message);
    if (memberResult.error) setNotice(memberResult.error.message);
    setGroups((groupResult.data || []) as Group[]);
    const grouped: Record<string, Member[]> = {};
    for (const member of (memberResult.data || []) as Member[]) grouped[member.group_id] = [...(grouped[member.group_id] || []), member];
    setMembers(grouped);
    const profileIds = Array.from(new Set((memberResult.data || []).map(item => String(item.user_id))));
    if (profileIds.length) {
      const profileResult = await supabase.from("grand_lumen_profiles").select("id,display_name,email,avatar_url").in("id", profileIds);
      if (!profileResult.error) setGroupProfiles(Object.fromEntries(((profileResult.data || []) as Profile[]).map(profile => [profile.id, profile])));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-group-memberships-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_group_chat_members", filter: "user_id=eq." + userId }, () => void loadGroups())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_group_chat_members" }, () => void loadGroups())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_group_chats" }, () => void loadGroups())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_group_call_invites", filter: "recipient_id=eq." + userId }, payload => {
        const invite = payload.new as CallInvite;
        if (invite.status === "pending") {
          setIncomingCall(invite);
          void supabase!.from("grand_lumen_group_chats").select("id,name,created_by,created_at").eq("id", invite.group_id).maybeSingle().then(result => {
            if (result.data) {
              setSelected(result.data as Group);
              setRenameValue(result.data.name);
            }
          });
        }
      })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [userId, loadGroups]);

  useEffect(() => {
    if (!selected || !supabase) {
      setMessages([]);
      setHiddenIds([]);
      return;
    }
    const client = supabase;
    let active = true;
    let channel: ReturnType<typeof client.channel> | null = null;
    const load = async () => {
      const [messageResult, hiddenResult] = await Promise.all([
        client.from("grand_lumen_group_chat_messages").select("*").eq("group_id", selected.id).order("created_at", { ascending: true }).limit(500),
        client.from("grand_lumen_group_message_hides").select("message_id").eq("user_id", userId)
      ]);
      if (!active) return;
      if (messageResult.error) { setNotice(messageResult.error.message); return; }
      if (hiddenResult.error) { setNotice(hiddenResult.error.message); return; }
      setMessages((messageResult.data || []) as GroupMessage[]);
      setHiddenIds((hiddenResult.data || []).map(item => String(item.message_id)));
      channel = client.channel("grand-lumen-group-chat-" + selected.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_group_chat_messages", filter: "group_id=eq." + selected.id }, payload => {
          const row = payload.new as GroupMessage;
          if (active) setMessages(current => current.some(item => item.id === row.id) ? current : [...current, row]);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grand_lumen_group_chat_messages", filter: "group_id=eq." + selected.id }, payload => {
          const row = payload.new as GroupMessage;
          if (active) setMessages(current => current.map(item => item.id === row.id ? row : item));
        })
        .subscribe();
    };
    void load();
    return () => { active = false; if (channel) void client.removeChannel(channel); };
  }, [selected?.id, userId]);

  useEffect(() => {
    if (!selected || !messageListRef.current) return;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [selected?.id, messages, hiddenIds]);

  useEffect(() => {
    if (!supabase || !messages.length) return;
    let active = true;
    const pending = messages.filter(message => !message.deleted_for_everyone && readAttachment(message.body) && !urls[message.id]);
    if (!pending.length) return;
    void Promise.all(pending.map(async message => {
      const attachment = readAttachment(message.body);
      if (!attachment) return null;
      const result = await supabase!.storage.from("grand-lumen-team-attachments").createSignedUrl(attachment.path, 3600);
      return result.data?.signedUrl ? [message.id, result.data.signedUrl] as const : null;
    })).then(results => {
      if (!active) return;
      const entries = results.filter((item): item is readonly [string, string] => Boolean(item));
      if (entries.length) setUrls(current => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => { active = false; };
  }, [messages, urls]);

  const sendText = async () => {
    if (!supabase || !selected || !draft.trim() || busy) return;
    setBusy(true);
    const body = draft.trim();
    setDraft("");
    const result = await supabase.from("grand_lumen_group_chat_messages").insert({ group_id: selected.id, sender_id: userId, body }).select("*").single();
    if (result.error) { setDraft(body); setNotice(result.error.message); }
    else setMessages(current => current.some(item => item.id === result.data.id) ? current : [...current, result.data as GroupMessage]);
    setBusy(false);
  };

  const uploadFile = async (file: File, forcedKind?: Attachment["kind"]) => {
    if (!supabase || !selected || uploading) return;
    if (file.size > 50 * 1024 * 1024) { setNotice("Each attachment must be 50 MB or smaller."); return; }
    const mime = file.type || "application/octet-stream";
    const kind = forcedKind || (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file");
    setUploading(true);
    setNotice("Uploading " + file.name + "…");
    try {
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "attachment";
      const path = selected.id + "/" + userId + "/" + crypto.randomUUID() + "-" + safeName;
      const upload = await supabase.storage.from("grand-lumen-team-attachments").upload(path, file, { contentType: mime, upsert: false });
      if (upload.error) throw upload.error;
      const attachment: Attachment = { name: file.name, path, mime, size: file.size, kind };
      const result = await supabase.from("grand_lumen_group_chat_messages").insert({ group_id: selected.id, sender_id: userId, body: prefix + JSON.stringify(attachment) }).select("*").single();
      if (result.error) {
        await supabase.storage.from("grand-lumen-team-attachments").remove([path]);
        throw result.error;
      }
      const signed = await supabase.storage.from("grand-lumen-team-attachments").createSignedUrl(path, 3600);
      if (signed.data?.signedUrl) setUrls(current => ({ ...current, [result.data.id]: signed.data.signedUrl }));
      setMessages(current => current.some(item => item.id === result.data.id) ? current : [...current, result.data as GroupMessage]);
      setNotice("Attachment sent.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The attachment could not be sent.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setNotice("Audio recording is not supported by this browser."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size) void uploadFile(new File([blob], "group-voice-" + Date.now() + ".webm", { type: blob.type }), "audio");
      };
      recorder.start();
      setRecording(true);
      setNotice("Recording voice message. Select Stop when finished.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Microphone access was not granted."); }
  };

  const deleteForMe = async (message: GroupMessage) => {
    if (!supabase) return;
    const result = await supabase.rpc("grand_lumen_hide_group_chat_message", { p_message_id: message.id });
    if (result.error) { setNotice(result.error.message); return; }
    setHiddenIds(current => current.includes(message.id) ? current : [...current, message.id]);
    setMessageMenu(null);
  };

  const deleteForEveryone = async (message: GroupMessage) => {
    if (!supabase || message.sender_id !== userId) return;
    const result = await supabase.rpc("grand_lumen_delete_group_chat_message_for_everyone", { p_message_id: message.id });
    if (result.error) { setNotice(result.error.message); return; }
    setMessageMenu(null);
  };

  const clearForMe = async () => {
    if (!supabase || !selected) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_clear_group_chat_for_me", { p_group_id: selected.id });
    if (result.error) setNotice(result.error.message);
    else {
      setHiddenIds(current => Array.from(new Set([...current, ...messages.map(item => item.id)])));
      setClearConfirm(false);
      setNotice("Group chat cleared from your view only.");
    }
    setBusy(false);
  };

  const createGroup = async () => {
    if (!supabase || !groupName.trim()) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_create_group_chat", { p_name: groupName.trim(), p_member_ids: selectedMembers });
    if (result.error) setNotice(result.error.message);
    else {
      setCreating(false);
      setGroupName("");
      setSelectedMembers([]);
      await loadGroups();
      const group = await supabase.from("grand_lumen_group_chats").select("id,name,created_by,created_at").eq("id", result.data).single();
      if (!group.error && group.data) setSelected(group.data as Group);
      setNotice("Group created. You are the admin and your selected connections have been added.");
    }
    setBusy(false);
  };

  const addMembers = async () => {
    if (!supabase || !selected || !selectedMembers.length) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_add_group_chat_members", { p_group_id: selected.id, p_member_ids: selectedMembers });
    if (result.error) setNotice(result.error.message);
    else {
      const names = selectedMembers.map(id => profiles[id]?.display_name || profiles[id]?.email || "a connected member");
      await supabase.from("grand_lumen_group_chat_messages").insert({ group_id: selected.id, sender_id: userId, body: "Added " + names.join(", ") + " to the group." });
      setSelectedMembers([]);
      setShowAdd(false);
      await loadGroups();
      setNotice("Selected members have been added and can now open this group on their devices.");
    }
    setBusy(false);
  };

  const renameGroup = async () => {
    if (!supabase || !selected || !renameValue.trim()) return;
    setBusy(true);
    const result = await supabase.rpc("grand_lumen_rename_group_chat", { p_group_id: selected.id, p_name: renameValue.trim() });
    if (result.error) setNotice(result.error.message);
    else {
      const next = { ...selected, name: renameValue.trim() };
      setSelected(next);
      setGroups(current => current.map(item => item.id === selected.id ? next : item));
      setNotice("Group name updated.");
    }
    setBusy(false);
  };

  const removeMember = async (memberId: string) => {
    if (!supabase || !selected) return;
    const name = profiles[memberId]?.display_name || "this member";
    if (!window.confirm("Remove " + name + " from this group?")) return;
    const result = await supabase.rpc("grand_lumen_remove_group_chat_member", { p_group_id: selected.id, p_member_id: memberId });
    if (result.error) setNotice(result.error.message);
    else { await loadGroups(); setNotice(name + " has been removed from the group."); }
  };

  const leaveGroup = async () => {
    if (!supabase || !selected) return;
    if (!window.confirm("Leave " + selected.name + "? You will no longer receive its messages.")) return;
    const result = await supabase.rpc("grand_lumen_leave_group_chat", { p_group_id: selected.id });
    if (result.error) setNotice(result.error.message);
    else { setSelected(null); await loadGroups(); setNotice("You have left the group."); }
  };

  const connectPeer = (peer: Peer, remote: CallParticipant, stream: MediaStream, mediaType: "audio" | "video") => {
    if (remote.user_id === userId || calledPeersRef.current.has(remote.peer_id)) return;
    calledPeersRef.current.add(remote.peer_id);
    peerUsersRef.current[remote.peer_id] = remote.user_id;
    const call = peer.call(remote.peer_id, stream, { metadata: { mediaType } });
    callsRef.current[remote.peer_id] = call;
    call.on("stream", (remoteStream: MediaStream) => setRemoteStreams(current => ({ ...current, [remote.peer_id]: remoteStream })));
    call.on("close", () => setRemoteStreams(current => { const next = { ...current }; delete next[remote.peer_id]; return next; }));
  };

  const setupPeer = async (sessionId: string, groupId: string, mediaType: "audio" | "video", initialPeerId?: string) => {
    if (!supabase || !navigator.mediaDevices?.getUserMedia) throw new Error("Group calls require HTTPS and browser microphone/camera support.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mediaType === "video" });
    localStreamRef.current = stream;
    setLocalStream(stream);
    const peer = new Peer();
    peerRef.current = peer;
    calledPeersRef.current = new Set();
    peer.on("error", error => setNotice("Group call connection error: " + error.message));
    peer.on("call", call => {
      const local = localStreamRef.current;
      if (!local) { call.close(); return; }
      call.answer(local);
      call.on("stream", (remoteStream: MediaStream) => setRemoteStreams(current => ({ ...current, [call.peer]: remoteStream })));
      call.on("close", () => setRemoteStreams(current => { const next = { ...current }; delete next[call.peer]; return next; }));
    });
    peer.on("open", async peerId => {
      const participant: CallParticipant = { session_id: sessionId, user_id: userId, peer_id: peerId };
      const inserted = await supabase!.from("grand_lumen_group_call_participants").upsert(participant, { onConflict: "session_id,user_id" });
      if (inserted.error) { setNotice(inserted.error.message); return; }
      const existing = await supabase!.from("grand_lumen_group_call_participants").select("session_id,user_id,peer_id").eq("session_id", sessionId);
      if (existing.error) { setNotice(existing.error.message); return; }
      const rows = (existing.data || []) as CallParticipant[];
      setCallParticipants(rows);
      for (const row of rows) connectPeer(peer, row, stream, mediaType);

    });
    if (initialPeerId) peer.on("open", () => { peerUsersRef.current[initialPeerId] = "group-host"; });
    return stream;
  };

  const startGroupCall = async (mediaType: "audio" | "video") => {
    if (!supabase || !selected || callBusy) return;
    setCallBusy(true);
    try {
      const session = await supabase.from("grand_lumen_group_call_sessions").insert({ group_id: selected.id, host_id: userId, media_type: mediaType }).select("id").single();
      if (session.error) throw session.error;
      const peer = new Peer();
      peerRef.current = peer;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mediaType === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      peer.on("error", error => setNotice("Group call connection error: " + error.message));
      peer.on("call", call => {
        const local = localStreamRef.current;
        if (!local) { call.close(); return; }
        call.answer(local);
        call.on("stream", (remoteStream: MediaStream) => setRemoteStreams(current => ({ ...current, [call.peer]: remoteStream })));
        call.on("close", () => setRemoteStreams(current => { const next = { ...current }; delete next[call.peer]; return next; }));
      });
      peer.on("open", async peerId => {
        const inserted = await supabase!.from("grand_lumen_group_call_participants").insert({ session_id: session.data.id, user_id: userId, peer_id: peerId });
        if (inserted.error) { setNotice(inserted.error.message); return; }
        const otherIds = activeMembers.filter(member => member.user_id !== userId).map(member => member.user_id);
        if (otherIds.length) {
          const invites = otherIds.map(recipientId => ({ session_id: session.data.id, group_id: selected.id, caller_id: userId, recipient_id: recipientId, peer_id: peerId, media_type: mediaType }));
          const inviteResult = await supabase!.from("grand_lumen_group_call_invites").insert(invites);
          if (inviteResult.error) setNotice(inviteResult.error.message);
        }
      });
      setActiveCall({ id: session.data.id, groupId: selected.id, mediaType, hostId: userId });
      setCallStatus("Calling group members…");
      const sessionChannel = supabase.channel("grand-lumen-group-call-session-" + session.data.id)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grand_lumen_group_call_sessions", filter: "id=eq." + session.data.id }, payload => {
          if ((payload.new as any).status === "ended") void endGroupCall(false);
        }).subscribe();
      (peer as any).__sessionChannel = sessionChannel;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The group call could not start.");
      await endGroupCall(false);
    } finally { setCallBusy(false); }
  };

  const acceptGroupCall = async () => {
    if (!supabase || !incomingCall || callBusy) return;
    const invite = incomingCall;
    setCallBusy(true);
    try {
      const sessionResult = await supabase.from("grand_lumen_group_call_sessions").select("id,group_id,host_id,media_type,status").eq("id", invite.session_id).single();
      if (sessionResult.error) throw sessionResult.error;
      if (sessionResult.data.status !== "active") throw new Error("This group call has already ended.");
      const setup = await setupPeer(invite.session_id, invite.group_id, invite.media_type, invite.peer_id);
      const update = await supabase.from("grand_lumen_group_call_invites").update({ status: "accepted" }).eq("id", invite.id).eq("recipient_id", userId);
      if (update.error) throw update.error;
      setActiveCall({ id: invite.session_id, groupId: invite.group_id, mediaType: invite.media_type, hostId: invite.caller_id });
      setIncomingCall(null);
      setCallStatus("Connected to group call");
      const channel = supabase.channel("grand-lumen-group-call-session-" + invite.session_id + "-" + userId)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grand_lumen_group_call_sessions", filter: "id=eq." + invite.session_id }, payload => {
          if ((payload.new as any).status === "ended") void endGroupCall(false);
        }).subscribe();
      (peerRef.current as any).__sessionChannel = channel;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not join the group call.");
      await endGroupCall(false);
    } finally { setCallBusy(false); }
  };

  const endGroupCall = async (updateServer = true) => {
    if (supabase && activeCall && updateServer && activeCall.hostId === userId) await supabase.from("grand_lumen_group_call_sessions").update({ status: "ended" }).eq("id", activeCall.id);
    if (supabase && activeCall) await supabase.from("grand_lumen_group_call_participants").delete().eq("session_id", activeCall.id).eq("user_id", userId);
    Object.values(callsRef.current).forEach(call => call.close());
    callsRef.current = {};
    peerRef.current?.destroy();
    const peer = peerRef.current as any;
    if (peer?.__sessionChannel) void supabase?.removeChannel(peer.__sessionChannel);
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setActiveCall(null);
    setCallParticipants([]);
    setCallStatus("");
  };

  useEffect(() => () => {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerRef.current?.destroy();
  }, []);

  const beginPress = (message: GroupMessage) => {
    if (message.deleted_for_everyone) return;
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => setMessageMenu(message), 550);
  };

  const cancelPress = () => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  const memberName = (id: string) => groupProfiles[id]?.display_name || groupProfiles[id]?.email || profiles[id]?.display_name || profiles[id]?.email || "Grand Lumen member";

  return <section className="group-chat-module">
    <button className="group-chat-launch" onClick={() => { setSelected(null); setCreating(false); setShowSettings(false); }}>
      <span className="group-chat-launch-icon"><Users size={28}/><i/><i/><i/></span>
      <span><b>Group Chat</b><small>Bring your connected people into one conversation</small></span>
      <span className="group-chat-launch-count">{groups.length} groups</span>
    </button>
    {!selected && !creating && <div className="group-chat-list-panel">
      <div className="group-chat-panel-heading"><div><span className="eyebrow">YOUR GROUPS</span><h3>Group conversations</h3></div><button className="team-primary" onClick={() => setCreating(true)}><Plus size={15}/> Create group</button></div>
      {notice && <div className="team-notice">{notice}</div>}
      {loading ? <p className="team-muted">Loading your groups…</p> : groups.length ? <div className="group-chat-list">{groups.map(group => {
        const groupMembers = (members[group.id] || []).filter(item => !item.left_at);
        return <button className="group-chat-list-item" key={group.id} onClick={() => { setSelected(group); setRenameValue(group.name); setNotice(""); }}>
          <span className="group-chat-avatar"><Users size={20}/></span><span><b>{group.name}</b><small>{groupMembers.length} members · {groupMembers.some(item => item.user_id === userId && item.role === "admin") ? "Admin" : "Member"}</small></span><ChevronDown size={16}/>
        </button>;
      })}</div> : <div className="group-chat-empty"><span className="group-chat-empty-icon"><Users size={28}/></span><b>No group chats yet</b><p>Create a group, choose people from your connections and start talking together.</p><button className="team-primary" onClick={() => setCreating(true)}><Plus size={15}/> Create your first group</button></div>}
    </div>}
    {creating && <div className="group-chat-create-panel">
      <div className="group-chat-panel-heading"><div><span className="eyebrow">NEW GROUP</span><h3>Create a group chat</h3></div><button className="team-secondary" onClick={() => setCreating(false)}><X size={16}/></button></div>
      <label>Group name<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} placeholder="e.g. Project 2.2 or Group of Ninjas"/></label>
      <div className="group-chat-member-picker"><div><b>Add connected people</b><small>{selectedMembers.length} selected</small></div>{availableMembers.length ? availableMembers.map(id => <label key={id}><input type="checkbox" checked={selectedMembers.includes(id)} onChange={event => setSelectedMembers(current => event.target.checked ? [...current,id] : current.filter(value => value !== id))}/><span className="group-chat-member-avatar">{memberName(id).slice(0,1).toUpperCase()}</span><span><b>{memberName(id)}</b><small>{profiles[id]?.email || "Connected member"}</small></span></label>) : <p className="team-muted">Connect with people first. Your connected accounts will appear here.</p>}</div>
      <button className="team-primary" disabled={busy || !groupName.trim()} onClick={() => void createGroup()}>{busy ? "Creating…" : "Create group"}</button>
    </div>}
    {selected && <section className="group-chat-fullscreen">
      <header className="group-chat-header"><div className="group-chat-header-title"><button className="team-secondary" onClick={() => { setSelected(null); setShowSettings(false); setNotice(""); }}><ArrowLeft size={16}/></button><span className="group-chat-avatar"><Users size={20}/></span><div><b>{selected.name}</b><small>{activeMembers.length} members · {isAdmin ? "Group admin" : "Group member"}</small></div></div>
        <div className="group-chat-header-actions"><button className="team-secondary" onClick={() => void startGroupCall("audio")} disabled={callBusy}><Phone size={15}/> Audio call</button><button className="team-secondary" onClick={() => void startGroupCall("video")} disabled={callBusy}><Video size={15}/> Video call</button><button className="team-secondary" onClick={() => setShowSettings(value => !value)}><Settings size={15}/></button></div>
      </header>
      {showSettings && <div className="group-chat-settings">
        <div className="group-chat-settings-top"><b>Group information</b><button onClick={() => setShowSettings(false)}><X size={15}/></button></div>
        {isAdmin && <div className="group-chat-rename"><input value={renameValue} onChange={event => setRenameValue(event.target.value)} maxLength={80}/><button className="team-secondary" onClick={() => void renameGroup()} disabled={busy || !renameValue.trim()}>Save name</button></div>}
        <div className="group-chat-settings-members"><div><b>Members</b>{isAdmin && <button className="team-secondary" onClick={() => setShowAdd(value => !value)}><UserPlus size={14}/> Add people</button>}</div>
          {activeMembers.map(member => <div key={member.user_id}><span className="group-chat-member-avatar">{memberName(member.user_id).slice(0,1).toUpperCase()}</span><span><b>{memberName(member.user_id)}{member.user_id === userId ? " (You)" : ""}</b><small>{member.role === "admin" ? "Admin" : "Member"}</small></span>{isAdmin && member.role !== "admin" && <button onClick={() => void removeMember(member.user_id)} aria-label="Remove member"><Trash2 size={14}/></button>}</div>)}
        </div>
        {showAdd && <div className="group-chat-member-picker group-chat-add-picker">{availableMembers.filter(id => !activeMembers.some(member => member.user_id === id)).map(id => <label key={id}><input type="checkbox" checked={selectedMembers.includes(id)} onChange={event => setSelectedMembers(current => event.target.checked ? [...current,id] : current.filter(value => value !== id))}/><span className="group-chat-member-avatar">{memberName(id).slice(0,1).toUpperCase()}</span><span><b>{memberName(id)}</b><small>{profiles[id]?.email || "Connected member"}</small></span></label>)}<button className="team-primary" disabled={busy || !selectedMembers.length} onClick={() => void addMembers()}>Add selected people</button></div>}
        <button className="group-chat-leave" onClick={() => void leaveGroup()}>Leave group</button>
      </div>}
      {notice && <div className="team-notice group-chat-notice" role="status">{notice}</div>}
      {incomingCall && incomingCall.group_id === selected.id && !activeCall && <div className="group-chat-call-invite"><div><b>Incoming group {incomingCall.media_type} call</b><small>{memberName(incomingCall.caller_id)} is inviting you to join.</small></div><button className="team-primary" disabled={callBusy} onClick={() => void acceptGroupCall()}>Join call</button><button className="team-secondary" onClick={() => { void supabase?.from("grand_lumen_group_call_invites").update({ status: "declined" }).eq("id", incomingCall.id); setIncomingCall(null); }}>Decline</button></div>}
      {activeCall && <div className="group-chat-call-panel"><div><b>{activeCall.mediaType === "video" ? "Video" : "Audio"} call · {callStatus}</b><small>{callParticipants.length || 1} connected participants</small></div><div className="group-chat-call-streams">{localStream && <video autoPlay muted playsInline ref={element => { if (element && element.srcObject !== localStream) element.srcObject = localStream; }}/>}{Object.entries(remoteStreams).map(([id,stream]) => activeCall.mediaType === "video" ? <video key={id} autoPlay playsInline ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream; }}/> : <audio key={id} autoPlay ref={element => { if (element && element.srcObject !== stream) element.srcObject = stream; }}/>)}</div><button className="team-danger" onClick={() => void endGroupCall()}>Leave call</button></div>}
      <div className="group-chat-messages" ref={messageListRef}>{messages.filter(message => !hiddenIds.includes(message.id)).map(message => {
        const own = message.sender_id === userId;
        const attachment = readAttachment(message.body);
        const url = urls[message.id];
        return <article key={message.id} className={"group-chat-message" + (own ? " own" : "") + (message.deleted_for_everyone ? " deleted" : "")} onContextMenu={event => { event.preventDefault(); if (!message.deleted_for_everyone) setMessageMenu(message); }} onTouchStart={() => beginPress(message)} onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}>
          {!own && !message.deleted_for_everyone && <b className="group-chat-sender">{memberName(message.sender_id)}</b>}
          {message.deleted_for_everyone ? <p>This message was deleted</p> : attachment ? <div className="team-attachment">
            {attachment.kind === "image" && (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.name}/></a> : <span>Loading image…</span>)}
            {attachment.kind === "video" && (url ? <video src={url} controls preload="metadata"/> : <span>Loading video…</span>)}
            {attachment.kind === "audio" && (url ? <audio src={url} controls preload="metadata"/> : <span>Loading audio…</span>)}
            {attachment.kind === "file" && <div className="team-attachment-file"><span>FILE</span><div><b>{attachment.name}</b><small>{(attachment.size / 1024 / 1024).toFixed(2)} MB</small></div>{url ? <a href={url} target="_blank" rel="noreferrer" download={attachment.name}>Open / download</a> : <span>Preparing…</span>}</div>}
          </div> : <p>{message.body}</p>}
          <small>{own ? "You" : memberName(message.sender_id)} · {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
        </article>;
      })}{!messages.filter(message => !hiddenIds.includes(message.id)).length && <div className="group-chat-first-message"><Users size={28}/><b>This is the beginning of {selected.name}</b><span>Send the first message to everyone in this group.</span></div>}</div>
      {messageMenu && <div className="team-message-menu-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMessageMenu(null); }}><section className="team-message-menu" role="dialog" aria-modal="true" aria-label="Group message options"><span>MESSAGE OPTIONS</span><button onClick={() => void deleteForMe(messageMenu)}>Delete for me</button>{messageMenu.sender_id === userId && <button className="delete-everyone" onClick={() => void deleteForEveryone(messageMenu)}>Delete for everyone</button>}<button className="cancel" onClick={() => setMessageMenu(null)}>Cancel</button></section></div>}
      {clearConfirm && <div className="team-message-menu-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setClearConfirm(false); }}><section className="team-message-menu"><span>CLEAR GROUP CHAT?</span><p>This removes messages from your view only. Other members keep their messages.</p><button onClick={() => void clearForMe()} disabled={busy}>{busy ? "Clearing…" : "Clear chat for me"}</button><button className="cancel" onClick={() => setClearConfirm(false)}>Cancel</button></section></div>}
      <form className="group-chat-compose" onSubmit={event => { event.preventDefault(); void sendText(); }}>
        <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={12000} placeholder="Message everyone…"/>
        <button className="team-primary" disabled={!draft.trim() || busy}><Send size={16}/></button>
        <input ref={fileInputRef} type="file" className="team-file-input" accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }}/>
        <button type="button" className="team-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}><Paperclip size={16}/></button>
        <button type="button" className="team-secondary" onClick={() => recording ? recorderRef.current?.stop() : void startRecording()} disabled={uploading}><Mic size={16}/></button>
        <button type="button" className="team-secondary" onClick={() => setClearConfirm(true)} title="Clear chat for me"><Trash2 size={16}/></button>
      </form>
      <div className="group-chat-footnote">Messages and attachments are shared with active group members. Long-press a message for deletion options.</div>
    </section>}
  </section>;
}
