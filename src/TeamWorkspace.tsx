import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Peer from "peerjs";
import { supabase } from "./auth";

type Profile = { id: string; display_name: string | null; email: string | null; avatar_url: string | null };
type Connection = { id: string; user_low: string; user_high: string };
type RequestRow = { id: string; requester_id: string; recipient_id: string; status: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string; deleted_for_everyone?: boolean };
type ReadReceipt = { message_id: string; user_id: string; read_at: string };
const TEAM_PUSH_PUBLIC_KEY = "BIpkBiN0sKiQB1w7yOT5ll72nP9NfJ006vZddc4jKAhIe9rPtA_63upOO0lIv792BA-vT0tQRD3Wef3DLGLBaTw";
type MessageAttachment = { name: string; path: string; mime: string; size: number; kind: "image" | "video" | "audio" | "file" };
type Project = { id: string; user_id: string; name: string; description: string; status: string };
type CallInvite = { id: string; connection_id: string; caller_id: string; recipient_id: string; peer_id: string; media_type: "audio" | "video"; status: string; expires_at: string };

const attachmentPrefix = "GLATTACH:";
const readAttachment = (body: string): MessageAttachment | null => {
  if (!body.startsWith(attachmentPrefix)) return null;
  try { return JSON.parse(body.slice(attachmentPrefix.length)) as MessageAttachment; } catch { return null; }
};

export default function TeamWorkspace({ userId, email }: { userId: string; email: string }) {
  const [invite, setInvite] = useState("");
  const [accountName, setAccountName] = useState("");
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteInput, setInviteInput] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [sentRequests, setSentRequests] = useState<RequestRow[]>([]);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [notificationReady, setNotificationReady] = useState(false);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<string[]>([]);
  const [messageMenu, setMessageMenu] = useState<Message | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const messagePressTimer = useRef<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectMember, setProjectMember] = useState("");
  const [projectRole, setProjectRole] = useState<"viewer" | "editor" | "manager">("editor");
  const [incomingCall, setIncomingCall] = useState<CallInvite | null>(null);
  const [activeCallId, setActiveCallId] = useState("");
  const [callStatus, setCallStatus] = useState("");
  const [activeMediaType, setActiveMediaType] = useState<"audio" | "video">("audio");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const callRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refreshUnreadCounts = useCallback(async () => {
    if (!supabase || !userId || !connections.length) {
      setUnreadCounts({});
      return;
    }
    const connectionIds = connections.map(item => item.id);
    const conversations = await supabase.from("grand_lumen_team_conversations").select("id,connection_id").in("connection_id", connectionIds);
    if (conversations.error || !conversations.data?.length) {
      setUnreadCounts({});
      return;
    }
    const conversationIds = conversations.data.map(item => item.id);
    const [messageResult, receiptResult] = await Promise.all([
      supabase.from("grand_lumen_team_messages").select("id,conversation_id,sender_id").in("conversation_id", conversationIds).neq("sender_id", userId).eq("deleted_for_everyone", false),
      supabase.from("grand_lumen_team_message_reads").select("message_id").eq("user_id", userId)
    ]);
    if (messageResult.error || receiptResult.error) return;
    const readIds = new Set((receiptResult.data || []).map(item => item.message_id));
    const conversationById = new Map(conversations.data.map(item => [item.id, item.connection_id]));
    const counts: Record<string, number> = {};
    for (const message of messageResult.data || []) {
      if (readIds.has(message.id)) continue;
      const connectionId = conversationById.get(message.conversation_id);
      if (connectionId) counts[connectionId] = (counts[connectionId] || 0) + 1;
    }
    setUnreadCounts(counts);
  }, [userId, connections]);

  const enableMessageNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setNotice("Phone notifications are not supported by this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotice("Notifications are blocked. Enable them in your phone's browser or app settings.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      if (!registration.pushManager) {
        setNotice("This browser does not support background push notifications.");
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(TEAM_PUSH_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0))
      });
      const value = subscription.toJSON();
      const keys = value.keys || {};
      const saved = await supabase?.from("grand_lumen_team_push_subscriptions").upsert({
        user_id: userId,
        endpoint: value.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date().toISOString()
      }, { onConflict: "endpoint" });
      if (saved?.error) throw saved.error;
      setNotificationReady(true);
      setNotice("Phone notifications are enabled for Team messages.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not enable phone notifications.");
    }
  };

  const markConversationRead = async (conversationId: string, rows: Message[]) => {
    if (!supabase) return;
    const unread = rows.filter(message => message.sender_id !== userId && !message.deleted_for_everyone);
    if (!unread.length) return;
    const result = await supabase.from("grand_lumen_team_message_reads").upsert(
      unread.map(message => ({ message_id: message.id, user_id: userId })),
      { onConflict: "message_id,user_id", ignoreDuplicates: true }
    );
    if (result.error) setNotice(result.error.message);
    else void refreshUnreadCounts();
  };

  const loadTeam = useCallback(async () => {
    if (!supabase) return;
    const [connectionResult, requestResult, sentRequestResult, projectResult] = await Promise.all([
      supabase.from("grand_lumen_team_connections").select("*").order("created_at", { ascending: false }),
      supabase.from("grand_lumen_connection_requests").select("*").eq("recipient_id", userId).eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("grand_lumen_connection_requests").select("*").eq("requester_id", userId).eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("grand_lumen_projects").select("*").order("updated_at", { ascending: false })
    ]);
    if (connectionResult.error) setNotice(connectionResult.error.message);
    if (requestResult.error) setNotice(requestResult.error.message);
    if (sentRequestResult.error) setNotice(sentRequestResult.error.message);
    if (projectResult.error) setNotice(projectResult.error.message);
    setProjects((projectResult.data || []) as Project[]);
    const nextConnections = (connectionResult.data || []) as Connection[];
    const incomingRequests = (requestResult.data || []) as RequestRow[];
    const outgoingRequests = (sentRequestResult.data || []) as RequestRow[];
    setConnections(nextConnections);
    setRequests(incomingRequests);
    setSentRequests(outgoingRequests);
    const ids = Array.from(new Set([
      ...nextConnections.flatMap(item => [item.user_low, item.user_high]),
      ...incomingRequests.map(item => item.requester_id),
      ...outgoingRequests.map(item => item.recipient_id)
    ].filter(id => id !== userId)));
    if (ids.length) {
      const result = await supabase.from("grand_lumen_profiles").select("id,display_name,email,avatar_url").in("id", ids);
      if (!result.error) setProfiles(Object.fromEntries(((result.data || []) as Profile[]).map(profile => [profile.id, profile])));
    } else {
      setProfiles({});
    }
  }, [userId, email]);

  useEffect(() => {
    void loadTeam();
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-team-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_team_connections" }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_connection_requests", filter: "recipient_id=eq." + userId }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_connection_requests", filter: "requester_id=eq." + userId }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_projects" }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_project_members", filter: "member_id=eq." + userId }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_project_members", filter: "owner_id=eq." + userId }, () => void loadTeam())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadTeam, userId]);

  useEffect(() => {
    void refreshUnreadCounts();
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-message-counts-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_team_messages" }, () => void refreshUnreadCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_team_message_reads", filter: "user_id=eq." + userId }, () => void refreshUnreadCounts())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [refreshUnreadCounts, userId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    void navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription()).then(subscription => {
      if (active) setNotificationReady(Boolean(subscription));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-call-invites-" + userId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_team_call_invites", filter: "recipient_id=eq." + userId }, payload => {
        const invitation = payload.new as CallInvite;
        if (invitation.status === "pending" && new Date(invitation.expires_at).getTime() > Date.now()) setIncomingCall(invitation);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grand_lumen_team_call_invites", filter: "recipient_id=eq." + userId }, payload => {
        const invitation = payload.new as CallInvite;
        if (invitation.status !== "pending") setIncomingCall(current => current?.id === invitation.id ? null : current);
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId) {
      setInvite("");
      setInviteLoading(false);
      return;
    }
    const client = supabase;
    let active = true;
    setInvite("");
    const loadPersonalInvite = async () => {
      setInviteLoading(true);
      try {
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData.session?.user.id !== userId) throw new Error("Your signed-in account changed. Reload Team after your account finishes loading.");
        const metadata = sessionData.session.user.user_metadata || {};
        const profileResult = await client.from("grand_lumen_profiles").select("display_name").eq("id", userId).maybeSingle();
        const displayName = String(profileResult.data?.display_name || metadata.full_name || metadata.name || "").trim();
        if (active) setAccountName(displayName || email || "Grand Lumen member");
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const token = Array.from(bytes).map(value => value.toString(16).padStart(2, "0")).join("");
        const result = await client.rpc("grand_lumen_get_or_create_personal_team_invite", { invite_token: token });
        if (result.error) throw result.error;
        if (!result.data) throw new Error("The personal invitation service returned an empty code.");
        if (active) setInvite(String(result.data));
      } catch (reason) {
        if (active) setNotice(reason instanceof Error ? reason.message : "Could not load your personal QR invitation.");
      } finally {
        if (active) setInviteLoading(false);
      }
    };
    void loadPersonalInvite();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    peerRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [localStream, remoteStream]);

  const finishCall = async (updateServer = true) => {
    if (updateServer && supabase && activeCallId) await supabase.from("grand_lumen_team_call_invites").update({ status: "ended" }).eq("id", activeCallId);
    callRef.current?.close();
    peerRef.current?.destroy();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCallId("");
    setIncomingCall(null);
    setCallStatus("");
    setActiveMediaType("audio");
  };

  const startCall = async (mediaType: "audio" | "video") => {
    if (!supabase || !selected) return;
    const client = supabase;
    const connection = selected;
    if (!navigator.mediaDevices?.getUserMedia) { setNotice("Calls require a secure HTTPS connection and browser media support."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mediaType === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setActiveMediaType(mediaType);
      const peer = new Peer();
      peerRef.current = peer;
      peer.on("error", reason => setNotice("Call connection error: " + reason.message));
      peer.on("call", incoming => {
        const local = localStreamRef.current;
        if (!local) { incoming.close(); return; }
        callRef.current = incoming;
        incoming.answer(local);
        incoming.on("stream", streamValue => { setRemoteStream(streamValue); setCallStatus("Connected"); });
        incoming.on("close", () => void finishCall(false));
      });
      peer.on("open", async peerId => {
        const memberId = connection.user_low === userId ? connection.user_high : connection.user_low;
        const result = await client.from("grand_lumen_team_call_invites").insert({
          connection_id: connection.id,
          caller_id: userId,
          recipient_id: memberId,
          peer_id: peerId,
          media_type: mediaType
        }).select("id").single();
        if (result.error) { setNotice(result.error.message); await finishCall(false); return; }
        setActiveCallId(result.data.id);
        setCallStatus(mediaType === "video" ? "Starting video call…" : "Starting voice call…");
      });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Camera or microphone permission was not granted.");
      await finishCall(false);
    }
  };

  const acceptCall = async () => {
    if (!supabase || !incomingCall) return;
    const client = supabase;
    const invitation = incomingCall;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: invitation.media_type === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setActiveMediaType(invitation.media_type);
      const peer = new Peer();
      peerRef.current = peer;
      peer.on("error", reason => setNotice("Call connection error: " + reason.message));
      peer.on("open", () => {
        const call = peer.call(invitation.peer_id, stream);
        callRef.current = call;
        call.on("stream", streamValue => { setRemoteStream(streamValue); setCallStatus("Connected"); });
        call.on("close", () => void finishCall(false));
      });
      const result = await client.from("grand_lumen_team_call_invites").update({ status: "accepted" }).eq("id", invitation.id);
      if (result.error) throw result.error;
      setActiveCallId(invitation.id);
      setCallStatus(invitation.media_type === "video" ? "Connecting video…" : "Connecting voice…");
      setIncomingCall(null);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not accept the call.");
      await finishCall(false);
    }
  };

  const declineCall = async () => {
    if (supabase && incomingCall) await supabase.from("grand_lumen_team_call_invites").update({ status: "declined" }).eq("id", incomingCall.id);
    setIncomingCall(null);
  };

  useEffect(() => {
    if (!supabase || !selected) {
      setMessages([]);
      return;
    }
    const client = supabase;
    let alive = true;
    let channel: ReturnType<typeof client.channel> | null = null;
    const loadMessages = async () => {
      const conversation = await client.from("grand_lumen_team_conversations").select("id").eq("connection_id", selected.id).single();
      if (conversation.error) { if (alive) setNotice(conversation.error.message); return; }
      const conversationId = conversation.data.id as string;
      const [result, hiddenResult] = await Promise.all([
        client.from("grand_lumen_team_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(150),
        client.from("grand_lumen_team_message_hides").select("message_id").eq("user_id", userId)
      ]);
      if (!alive) return;
      if (result.error) { setNotice(result.error.message); return; }
      if (hiddenResult.error) { setNotice(hiddenResult.error.message); return; }
      setMessages((result.data || []) as Message[]);
      void markConversationRead(conversationId, (result.data || []) as Message[]);
      setHiddenMessageIds((hiddenResult.data || []).map(item => String(item.message_id)));
      channel = client.channel("grand-lumen-chat-" + conversationId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_team_messages", filter: "conversation_id=eq." + conversationId }, payload => {
          const message = payload.new as Message;
          if (alive && message.conversation_id === conversationId) { setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]); if (message.sender_id !== userId) void markConversationRead(conversationId, [message]); }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grand_lumen_team_messages", filter: "conversation_id=eq." + conversationId }, payload => {
          const message = payload.new as Message;
          if (alive && message.conversation_id === conversationId) setMessages(current => current.map(item => item.id === message.id ? message : item));
        }).subscribe();
    };
    void loadMessages();
    return () => { alive = false; if (channel) void client.removeChannel(channel); };
  }, [selected]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    const pending = messages.filter(message => !message.deleted_for_everyone && readAttachment(message.body) && !attachmentUrls[message.id]);
    if (!pending.length) return;
    void Promise.all(pending.map(async message => {
      const attachment = readAttachment(message.body);
      if (!attachment) return null;
      const result = await client.storage.from("grand-lumen-team-attachments").createSignedUrl(attachment.path, 60 * 60);
      return result.data?.signedUrl ? [message.id, result.data.signedUrl] as const : null;
    })).then(results => {
      if (!active) return;
      const resolved = results.filter((item): item is readonly [string, string] => Boolean(item));
      if (resolved.length) setAttachmentUrls(current => {
        const next = { ...current };
        for (const item of resolved) next[item[0]] = item[1];
        return next;
      });
    });
    return () => { active = false; };
  }, [messages, attachmentUrls]);

  useEffect(() => {
    if (!cameraOpen) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      return;
    }
    let active = true;
    const start = async () => {
      try {
        const detectorConstructor = (window as any).BarcodeDetector;
        if (!detectorConstructor) throw new Error("QR camera scanning is not supported by this browser. Paste an invitation code instead.");
        const detector = new detectorConstructor({ formats: ["qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!active) { stream.getTracks().forEach((track: MediaStreamTrack) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found.length) {
              const raw = String(found[0].rawValue || "");
              const parsed = JSON.parse(raw);
              if (parsed.type === "grand-lumen-team-invite" && typeof parsed.token === "string") {
                setInviteInput(parsed.token);
                setCameraOpen(false);
                setNotice("Invitation scanned. Review and connect when ready.");
                return;
              }
            }
          } catch {}
          window.setTimeout(() => void scan(), 350);
        };
        await videoRef.current?.play();
        void scan();
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : "Camera access could not start.");
        setCameraOpen(false);
      }
    };
    void start();
    return () => { active = false; streamRef.current?.getTracks().forEach(track => track.stop()); };
  }, [cameraOpen]);

  const connectWithToken = async () => {
    if (!supabase || !inviteInput.trim()) return;
    setBusy(true);
    setNotice("");
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inviteInput.trim()));
      const tokenHash = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
      const result = await supabase.rpc("grand_lumen_redeem_team_invite", { invite_token_hash: tokenHash });
      if (result.error) throw result.error;
      setInviteInput("");
      setNotice("Connection request sent. The other person must approve it.");
      await loadTeam();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Invitation could not be redeemed.");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (requestId: string, accept: boolean) => {
    if (!supabase || !userId) return;
    setBusy(true);
    setNotice("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData.session?.user.id !== userId) throw new Error("The active sign-in does not match this Team account. Reload Team and try again.");
      const result = await supabase.rpc("grand_lumen_handle_connection_request", { p_request_id: requestId, p_accept: accept });
      if (result.error) throw result.error;
      if (accept && !result.data) throw new Error("The request was processed, but no connection was returned. Refresh Team and check the connection list.");
      await loadTeam();
      setNotice(accept ? "Connection accepted. The member should now appear in your network and private chat." : "Request declined.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : reason && typeof reason === "object" && "message" in reason ? String(reason.message || JSON.stringify(reason)) : String(reason || "The connection request could not be processed."));
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    if (!supabase || !projectName.trim()) return;
    setBusy(true);
    setNotice("");
    const result = await supabase.from("grand_lumen_projects").insert({ user_id: userId, name: projectName.trim(), description: projectDescription.trim() }).select("*").single();
    if (result.error) setNotice(result.error.message);
    else {
      setProjects(current => [result.data as Project, ...current]);
      setProjectName("");
      setProjectDescription("");
      setNotice("Cloud project created.");
    }
    setBusy(false);
  };

  const shareProject = async (projectId: string) => {
    if (!supabase || !projectMember || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const { data: currentConnections, error: connectionError } = await supabase.from("grand_lumen_team_connections").select("user_low,user_high");
      if (connectionError) {
        setNotice("Could not verify your connected members: " + connectionError.message);
        return;
      }
      const connectedIds = Array.from(new Set(((currentConnections || []) as Pick<Connection, "user_low" | "user_high">[]).map(connection => connection.user_low === userId ? connection.user_high : connection.user_low)));
      const memberIds = projectMember === "__all__" ? connectedIds : [projectMember];
      if (!memberIds.length) {
        setNotice("Connect with at least one member before sharing this project.");
        return;
      }
      if (memberIds.some(memberId => !connectedIds.includes(memberId))) {
        setNotice("That member is no longer connected. Refresh Team and choose a current connection.");
        return;
      }
      const { data, error } = await supabase.rpc("grand_lumen_share_project", {
        p_project_id: projectId,
        p_member_ids: memberIds,
        p_role: projectRole
      });
      if (error) {
        setNotice("Project sharing failed: " + error.message);
        return;
      }
      const sharedCount = Number(data || 0);
      setProjectMember("");
      setNotice(sharedCount === 1 ? "Project shared successfully. The member can now see it in Team Projects." : "Project shared with " + sharedCount + " connected members.");
      await loadTeam();
    } catch (error) {
      setNotice("Project sharing failed: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (project: Project) => {
    if (!supabase || project.user_id !== userId) return;
    if (!window.confirm("Delete “" + project.name + "”? This will remove the project and its member access.")) return;
    setBusy(true);
    setNotice("");
    const result = await supabase.from("grand_lumen_projects").delete().eq("id", project.id).eq("user_id", userId);
    if (result.error) setNotice("Project could not be deleted: " + result.error.message);
    else {
      setProjects(current => current.filter(item => item.id !== project.id));
      setNotice("Project deleted.");
    }
    setBusy(false);
  };

  const openWhatsApp = () => {
    const entered = window.prompt("Enter the connected member’s WhatsApp number with country code. Example: 233XXXXXXXXX");
    if (!entered) return;
    const phone = entered.replace(/\\D/g, "");
    if (phone.length < 8 || phone.length > 15) { setNotice("Enter a valid international phone number."); return; }
    window.location.assign("https://wa.me/" + phone);
  };

  const getConversationId = async () => {
    if (!supabase || !selected) throw new Error("Open a conversation before sending.");
    const result = await supabase.from("grand_lumen_team_conversations").select("id").eq("connection_id", selected.id).single();
    if (result.error) throw result.error;
    return String(result.data.id);
  };

  const sendMessage = async () => {
    if (!supabase || !selected || !draft.trim()) return;
    try {
      const conversationId = await getConversationId();
      const body = draft.trim();
      setDraft("");
      const result = await supabase.from("grand_lumen_team_messages").insert({ conversation_id: conversationId, sender_id: userId, body }).select("*").single();
      if (result.error) throw result.error;
      setMessages(current => current.some(item => item.id === result.data.id) ? current : [...current, result.data as Message]);
      void supabase.functions.invoke("team-message-push", { body: { messageId: result.data.id } });
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Your message could not be sent.");
    }
  };

  const uploadAttachment = async (file: File, forcedKind?: MessageAttachment["kind"]) => {
    if (!supabase || !selected || uploading) return;
    if (file.size > 50 * 1024 * 1024) { setNotice("Each attachment must be 50 MB or smaller."); return; }
    const mime = file.type || "application/octet-stream";
    const kind = forcedKind || (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file");
    setUploading(true);
    setNotice("Uploading " + file.name + "…");
    try {
      const conversationId = await getConversationId();
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "attachment";
      const path = conversationId + "/" + userId + "/" + crypto.randomUUID() + "-" + safeName;
      const uploaded = await supabase.storage.from("grand-lumen-team-attachments").upload(path, file, { contentType: mime, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const attachment: MessageAttachment = { name: file.name, path, mime, size: file.size, kind };
      const result = await supabase.from("grand_lumen_team_messages").insert({ conversation_id: conversationId, sender_id: userId, body: attachmentPrefix + JSON.stringify(attachment) }).select("*").single();
      if (result.error) {
        await supabase.storage.from("grand-lumen-team-attachments").remove([path]);
        throw result.error;
      }
      const signed = await supabase.storage.from("grand-lumen-team-attachments").createSignedUrl(path, 60 * 60);
      if (signed.data?.signedUrl) setAttachmentUrls(current => ({ ...current, [result.data.id]: signed.data.signedUrl }));
      setMessages(current => current.some(item => item.id === result.data.id) ? current : [...current, result.data as Message]);
      void supabase.functions.invoke("team-message-push", { body: { messageId: result.data.id } });
      setNotice("Attachment sent.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The attachment could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("Audio recording is not supported by this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => setNotice("Audio recording failed. Please try again.");
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (blob.size) void uploadAttachment(new File([blob], "voice-message-" + Date.now() + ".webm", { type: blob.type }), "audio");
      };
      recorder.start();
      setRecording(true);
      setNotice("Recording audio message… tap Stop recording when finished.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Microphone permission was not granted.");
    }
  };

  const stopAudioRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const deleteMessageForMe = async (message: Message) => {
    if (!supabase || message.sender_id !== userId) return;
    const result = await supabase.rpc("grand_lumen_hide_team_message", { p_message_id: message.id });
    if (result.error) { setNotice(result.error.message); return; }
    setHiddenMessageIds(current => current.includes(message.id) ? current : [...current, message.id]);
    setMessageMenu(null);
  };

  const deleteMessageForEveryone = async (message: Message) => {
    if (!supabase || message.sender_id !== userId) return;
    const result = await supabase.rpc("grand_lumen_delete_team_message_for_everyone", { p_message_id: message.id });
    if (result.error) { setNotice(result.error.message); return; }
    setMessages(current => current.map(item => item.id === message.id ? { ...item, body: "This message was deleted", deleted_for_everyone: true } : item));
    setAttachmentUrls(current => { const next = { ...current }; delete next[message.id]; return next; });
    setMessageMenu(null);
  };

  const beginMessagePress = (message: Message) => {
    if (message.deleted_for_everyone) return;
    if (messagePressTimer.current) window.clearTimeout(messagePressTimer.current);
    messagePressTimer.current = window.setTimeout(() => setMessageMenu(message), 550);
  };

  const cancelMessagePress = () => {
    if (messagePressTimer.current) window.clearTimeout(messagePressTimer.current);
    messagePressTimer.current = null;
  };

  if (!supabase) return <div className="team-workspace"><div className="team-empty"><h3>Cloud account required</h3><p>Sign in with a Grand Lumen cloud account to connect with other people across devices. Local browser accounts cannot use Team.</p></div></div>;

  return <div className="team-workspace">
    {!selected && <>
    <header className="team-hero"><div className="team-hero-copy"><span className="team-kicker"><i/> GRAND-LUMEN COLLABORATION</span><h2>Your people.<br/><span>Your next big idea.</span></h2><p>Bring your network together, exchange ideas, build shared projects and keep every conversation connected.</p><div className="team-hero-meta"><span><i/> Private by design</span><span><i/> Cloud-connected</span><span><i/> Built for teamwork</span></div></div><div className="team-hero-side"><div className="team-hero-orbit"><div className="team-orbit-ring team-orbit-ring-one"/><div className="team-orbit-ring team-orbit-ring-two"/><div className="team-orbit-core">GL</div><span className="team-orbit-dot team-orbit-dot-one"/><span className="team-orbit-dot team-orbit-dot-two"/><span className="team-orbit-dot team-orbit-dot-three"/></div><div className="team-account"><small>SIGNED IN AS</small><b>{email}</b><span>PERSONAL WORKSPACE REMAINS PRIVATE</span></div></div></header><section className="team-overview"><div className="team-overview-heading"><div><span className="team-kicker">YOUR NETWORK AT A GLANCE</span><h3>Team overview</h3></div><button className="team-secondary team-notification-enable" onClick={() => void enableMessageNotifications()}>{notificationReady ? "Notifications enabled" : "Enable phone notifications"}</button><span className="team-overview-live"><i/> LIVE WORKSPACE</span></div><div className="team-stat-grid"><article className="team-stat"><span className="team-stat-icon">◎</span><div><strong>{connections.length}</strong><small>Connected members</small></div><span className="team-stat-foot">YOUR NETWORK</span></article><article className="team-stat"><span className="team-stat-icon">↗</span><div><strong>{requests.length}</strong><small>Incoming requests</small></div><span className="team-stat-foot">NEEDS REVIEW</span></article><article className="team-stat"><span className="team-stat-icon">↗</span><div><strong>{sentRequests.length}</strong><small>Sent requests</small></div><span className="team-stat-foot">AWAITING REPLY</span></article><article className="team-stat"><span className="team-stat-icon">▦</span><div><strong>{projects.length}</strong><small>Team projects</small></div><span className="team-stat-foot">SHARED WORK</span></article></div></section>
    {notice && <div className="team-notice" role="status">{notice}</div>}
    {incomingCall && <section className="team-incoming-call"><div><b>Incoming {incomingCall.media_type === "video" ? "video" : "voice"} call</b><small>Another connected Team member is calling you.</small></div><div className="team-actions"><button className="team-secondary" onClick={() => void declineCall()}>Decline</button><button className="team-primary" onClick={() => void acceptCall()}>Accept</button></div></section>}
    
    <div className="team-grid">
      <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">YOUR IDENTITY</span><h3>Personal QR invitation</h3></div><span className="team-icon">QR</span></div><p>Your personal QR invitation stays available here. Other members can scan it repeatedly to send you a connection request.</p><div className="team-qr">{invite ? <><QRCodeSVG value={JSON.stringify({ type: "grand-lumen-team-invite", version: 1, accountId: userId, token: invite })} size={190} level="M"/><b>Personal QR · Bound to this account</b><span>{accountName}</span><span>{email || "Signed-in account"}</span><small>Account ID: {userId.slice(0, 8)}…{userId.slice(-6)}</small><button onClick={() => { void navigator.clipboard?.writeText(invite).then(() => setNotice("Personal invitation code copied.")).catch(() => setNotice("Clipboard access is unavailable on this device.")); }}>Copy invitation code</button></> : <p>{inviteLoading ? "Loading the QR identity for this signed-in account…" : "Your account-specific QR invitation could not load. Check the message above and reload Team."}</p>}</div>
      </section>
      <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">FIND A MEMBER</span><h3>Scan or enter a code</h3></div><span className="team-icon">+</span></div><p>Scan another member's QR invitation or paste their invitation code.</p><textarea value={inviteInput} onChange={event => setInviteInput(event.target.value)} placeholder="Paste invitation token here" rows={3}/><div className="team-actions"><button className="team-secondary" onClick={() => setCameraOpen(value => !value)}>{cameraOpen ? "Close camera" : "Scan QR code"}</button><button className="team-primary" onClick={() => void connectWithToken()} disabled={busy || !inviteInput.trim()}>Send request</button></div>{cameraOpen && <video className="team-camera" ref={videoRef} muted playsInline/>}</section>
    </div>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">CONNECTION REQUESTS</span><h3>Requests awaiting your approval</h3></div><span className="team-count">{requests.length}</span></div>{requests.length ? requests.map(request => <div className="team-request" key={request.id}><div><b>{profiles[request.requester_id]?.display_name || "Grand Lumen member"}</b><small>{profiles[request.requester_id]?.email || "Connection request"}</small></div><div className="team-actions"><button className="team-secondary" disabled={busy} onClick={() => void respond(request.id, false)}>Decline</button><button className="team-primary" disabled={busy} onClick={() => void respond(request.id, true)}>Accept</button></div></div>) : <p className="team-muted">No pending requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">SENT REQUESTS</span><h3>Awaiting their response</h3></div><span className="team-count">{sentRequests.length}</span></div>{sentRequests.length ? sentRequests.map(request => <div className="team-request" key={request.id}><div><b>{profiles[request.recipient_id]?.display_name || "Grand Lumen member"}</b><small>{profiles[request.recipient_id]?.email || "Request pending"}</small></div><span className="team-muted">Pending approval</span></div>) : <p className="team-muted">You have no outgoing requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">YOUR NETWORK</span><h3>Connected members</h3></div><span className="team-count">{connections.length}</span></div>{connections.length ? <div className="team-contacts">{connections.map(connection => { const memberId = connection.user_low === userId ? connection.user_high : connection.user_low; const profile = profiles[memberId]; return <button className="team-contact" key={connection.id} onClick={() => setSelected(connection)}><span className="team-avatar">{(profile?.display_name || profile?.email || "GL").slice(0, 1).toUpperCase()}</span><span><b>{profile?.display_name || "Grand Lumen member"}</b><small>{profile?.email || "Connected account"}</small></span>{Boolean(unreadCounts[connection.id]) && <span className="team-unread-badge">{unreadCounts[connection.id]}</span>}</button>; })}</div> : <p className="team-muted">Your connections will appear here after they approve your requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">SHARED WORK</span><h3>Team projects</h3></div><span className="team-count">{projects.length}</span></div><div className="team-project-create"><input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Project name"/><input value={projectDescription} onChange={event => setProjectDescription(event.target.value)} placeholder="Short project description"/><button className="team-primary" onClick={() => void createProject()} disabled={!projectName.trim() || busy}>Create project</button></div>{projects.map(project => <article className="team-project-row" key={project.id}><div><b>{project.name}</b><small>{project.description || "No description"} · {project.user_id === userId ? "Owner" : "Shared with you"}</small></div>{project.user_id === userId && <div className="team-project-share">{connections.length > 0 && <><select value={projectMember} onChange={event => setProjectMember(event.target.value)}><option value="">Choose member</option><option value="__all__">All connected members</option>{connections.map(connection => { const memberId = connection.user_low === userId ? connection.user_high : connection.user_low; return <option key={memberId} value={memberId}>{profiles[memberId]?.display_name || profiles[memberId]?.email || memberId.slice(0, 8)}</option>; })}</select><select value={projectRole} onChange={event => setProjectRole(event.target.value as "viewer" | "editor" | "manager")}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="manager">Manager</option></select><button className="team-secondary" onClick={() => void shareProject(project.id)} disabled={!projectMember || busy}>Share</button></>}<button className="team-danger team-project-delete" onClick={() => void deleteProject(project)} disabled={busy}>Delete</button></div>}</article>)}{!projects.length && <p className="team-muted">Create a cloud project, then share it with connected members.</p>}</section>
    </>}
    {selected && <section className="team-card team-chat team-chat-fullscreen"><div className="team-card-heading"><div className="team-chat-title-row"><button className="team-secondary team-chat-back" onClick={() => setSelected(null)}>← Back to Team</button><div><span className="eyebrow">PRIVATE CONVERSATION{unreadCounts[selected.id] ? " · " + unreadCounts[selected.id] + " UNREAD" : ""}</span><h3>{(() => { const memberId = selected.user_low === userId ? selected.user_high : selected.user_low; return profiles[memberId]?.display_name || "Team member"; })()}</h3></div></div><div className="team-actions"><button className="team-secondary" onClick={() => void startCall("audio")}>Voice call</button><button className="team-secondary" onClick={() => void startCall("video")}>Video call</button><button className="team-secondary" onClick={openWhatsApp}>WhatsApp</button></div></div><div className="team-message-list">{messages.filter(message => !hiddenMessageIds.includes(message.id)).map(message => {
      const attachment = readAttachment(message.body);
      const url = attachmentUrls[message.id];
      const own = message.sender_id === userId;
      return <article className={("team-message" + (own ? " own" : "") + (message.deleted_for_everyone ? " deleted" : "") + (attachment ? " has-attachment" : ""))} key={message.id} onContextMenu={event => { event.preventDefault(); if (own && !message.deleted_for_everyone) setMessageMenu(message); }} onTouchStart={() => { if (own) beginMessagePress(message); }} onTouchEnd={cancelMessagePress} onTouchMove={cancelMessagePress} onTouchCancel={cancelMessagePress}>
        {message.deleted_for_everyone ? <p>This message was deleted</p> : attachment ? <div className="team-attachment">
          {attachment.kind === "image" && (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.name}/></a> : <span>Loading image…</span>)}
          {attachment.kind === "video" && (url ? <video src={url} controls preload="metadata"/> : <span>Loading video…</span>)}
          {attachment.kind === "audio" && (url ? <audio src={url} controls preload="metadata"/> : <span>Loading audio…</span>)}
          {attachment.kind === "file" && <div className="team-attachment-file"><span>FILE</span><div><b>{attachment.name}</b><small>{(attachment.size / 1024 / 1024).toFixed(2)} MB</small></div>{url ? <a href={url} target="_blank" rel="noreferrer" download={attachment.name}>Open / download</a> : <span>Preparing…</span>}</div>}
          <small>{attachment.name}</small>
        </div> : <p>{message.body}</p>}
        <small>{new Date(message.created_at).toLocaleString()}</small>
      </article>;
    })}{!messages.filter(message => !hiddenMessageIds.includes(message.id)).length && <p className="team-muted">Start the conversation.</p>}</div>{messageMenu && messageMenu.sender_id === userId && <div className="team-message-menu-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMessageMenu(null); }}><section className="team-message-menu" role="dialog" aria-modal="true" aria-label="Message options"><span>YOUR MESSAGE</span><button type="button" onClick={() => void deleteMessageForMe(messageMenu)}>Delete for me</button><button type="button" className="delete-everyone" onClick={() => void deleteMessageForEveryone(messageMenu)}>Delete for everyone</button><button type="button" className="cancel" onClick={() => setMessageMenu(null)}>Cancel</button></section></div>}<form className="team-compose" onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" maxLength={12000}/><button className="team-primary" disabled={!draft.trim() || uploading}>Send</button><input ref={fileInputRef} className="team-file-input" type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} /><button type="button" className="team-secondary team-attach-button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Attach"}</button><button type="button" className="team-secondary team-audio-button" onClick={() => recording ? stopAudioRecording() : void startAudioRecording()} disabled={uploading}>{recording ? "Stop recording" : "Record audio"}</button></form>{notice && <div className="team-notice team-chat-notice" role="status">{notice}</div>}<div className="team-call-note">Messages, files and calls stay in this private conversation. Attachments up to 50 MB.</div>{incomingCall && <section className="team-incoming-call"><div><b>Incoming {incomingCall.media_type === "video" ? "video" : "voice"} call</b><small>A connected Team member is calling you.</small></div><div className="team-actions"><button className="team-secondary" onClick={() => void declineCall()}>Decline</button><button className="team-primary" onClick={() => void acceptCall()}>Accept</button></div></section>}{callStatus && <section className="team-call-panel"><div className="team-card-heading"><div><span className="eyebrow">LIVE {activeMediaType === "video" ? "VIDEO" : "VOICE"} CALL</span><h3>{callStatus}</h3></div><button className="team-danger team-call-end" onClick={() => void finishCall()}>End call</button></div><div className="team-call-media">{remoteStream && <video ref={remoteVideoRef} autoPlay playsInline/>}{localStream && <video ref={localVideoRef} autoPlay playsInline muted/>}{activeMediaType === "audio" && <audio ref={remoteAudioRef} autoPlay/>}</div><small>Tap End call whenever you want to stop the conversation.</small></section>}</section>}
  </div>;
}
