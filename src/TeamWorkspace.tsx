import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Peer from "peerjs";
import { supabase } from "./auth";

type Profile = { id: string; display_name: string | null; email: string | null; avatar_url: string | null };
type Connection = { id: string; user_low: string; user_high: string };
type RequestRow = { id: string; requester_id: string; recipient_id: string; status: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type Project = { id: string; user_id: string; name: string; description: string; status: string };
type CallInvite = { id: string; connection_id: string; caller_id: string; recipient_id: string; peer_id: string; media_type: "audio" | "video"; status: string; expires_at: string };

export default function TeamWorkspace({ userId, email }: { userId: string; email: string }) {
  const [invite, setInvite] = useState("");
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteInput, setInviteInput] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [sentRequests, setSentRequests] = useState<RequestRow[]>([]);
  const [selected, setSelected] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
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
  }, [userId]);

  useEffect(() => {
    void loadTeam();
    if (!supabase) return;
    const channel = supabase.channel("grand-lumen-team-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_team_connections" }, () => void loadTeam())
       .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_connection_requests", filter: "recipient_id=eq." + userId }, () => void loadTeam())
      .on("postgres_changes", { event: "*", schema: "public", table: "grand_lumen_connection_requests", filter: "requester_id=eq." + userId }, () => void loadTeam())
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [loadTeam, userId]);

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
      const result = await client.from("grand_lumen_team_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(150);
      if (!alive) return;
      if (!result.error) setMessages((result.data || []) as Message[]);
      channel = client.channel("grand-lumen-chat-" + conversationId)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "grand_lumen_team_messages", filter: "conversation_id=eq." + conversationId }, payload => {
          const message = payload.new as Message;
          if (alive && message.conversation_id === conversationId) setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
        }).subscribe();
    };
    void loadMessages();
    return () => { alive = false; if (channel) void client.removeChannel(channel); };
  }, [selected]);

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
      setNotice(reason instanceof Error ? reason.message : "The connection request could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    if (!supabase || !projectName.trim()) return;
    const result = await supabase.from("grand_lumen_projects").insert({ user_id: userId, name: projectName.trim(), description: projectDescription.trim() }).select("*").single();
    if (result.error) setNotice(result.error.message);
    else { setProjects(current => [result.data as Project, ...current]); setProjectName(""); setProjectDescription(""); setNotice("Cloud project created."); }
  };

  const shareProject = async (projectId: string) => {
    if (!supabase || !projectMember) return;
    const result = await supabase.from("grand_lumen_project_members").insert({ project_id: projectId, owner_id: userId, member_id: projectMember, role: projectRole });
    if (result.error) setNotice(result.error.message);
    else { setProjectMember(""); setNotice("Project access granted."); }
  };

  const openWhatsApp = () => {
    const entered = window.prompt("Enter the connected member’s WhatsApp number with country code. Example: 233XXXXXXXXX");
    if (!entered) return;
    const phone = entered.replace(/\\D/g, "");
    if (phone.length < 8 || phone.length > 15) { setNotice("Enter a valid international phone number."); return; }
    window.open("https://wa.me/" + phone, "_blank", "noopener,noreferrer");
  };

  const sendMessage = async () => {
    if (!supabase || !selected || !draft.trim()) return;
    const conversation = await supabase.from("grand_lumen_team_conversations").select("id").eq("connection_id", selected.id).single();
    if (conversation.error) { setNotice(conversation.error.message); return; }
    const body = draft.trim();
    setDraft("");
    const result = await supabase.from("grand_lumen_team_messages").insert({ conversation_id: conversation.data.id, sender_id: userId, body }).select("*").single();
    if (result.error) { setDraft(body); setNotice(result.error.message); }
    else setMessages(current => current.some(item => item.id === result.data.id) ? current : [...current, result.data as Message]);
  };

  if (!supabase) return <div className="team-workspace"><div className="team-empty"><h3>Cloud account required</h3><p>Sign in with a Grand Lumen cloud account to connect with other people across devices. Local browser accounts cannot use Team.</p></div></div>;

  return <div className="team-workspace">
    <header className="team-hero"><div className="team-hero-copy"><span className="team-kicker"><i/> GRAND-LUMEN COLLABORATION</span><h2>Your people.<br/><span>Your next big idea.</span></h2><p>Bring your network together, exchange ideas, build shared projects and keep every conversation connected.</p><div className="team-hero-meta"><span><i/> Private by design</span><span><i/> Cloud-connected</span><span><i/> Built for teamwork</span></div></div><div className="team-hero-side"><div className="team-hero-orbit"><div className="team-orbit-ring team-orbit-ring-one"/><div className="team-orbit-ring team-orbit-ring-two"/><div className="team-orbit-core">GL</div><span className="team-orbit-dot team-orbit-dot-one"/><span className="team-orbit-dot team-orbit-dot-two"/><span className="team-orbit-dot team-orbit-dot-three"/></div><div className="team-account"><small>SIGNED IN AS</small><b>{email}</b><span>PERSONAL WORKSPACE REMAINS PRIVATE</span></div></div></header><section className="team-overview"><div className="team-overview-heading"><div><span className="team-kicker">YOUR NETWORK AT A GLANCE</span><h3>Team overview</h3></div><span className="team-overview-live"><i/> LIVE WORKSPACE</span></div><div className="team-stat-grid"><article className="team-stat"><span className="team-stat-icon">◎</span><div><strong>{connections.length}</strong><small>Connected members</small></div><span className="team-stat-foot">YOUR NETWORK</span></article><article className="team-stat"><span className="team-stat-icon">↗</span><div><strong>{requests.length}</strong><small>Incoming requests</small></div><span className="team-stat-foot">NEEDS REVIEW</span></article><article className="team-stat"><span className="team-stat-icon">↗</span><div><strong>{sentRequests.length}</strong><small>Sent requests</small></div><span className="team-stat-foot">AWAITING REPLY</span></article><article className="team-stat"><span className="team-stat-icon">▦</span><div><strong>{projects.length}</strong><small>Team projects</small></div><span className="team-stat-foot">SHARED WORK</span></article></div></section>
    {notice && <div className="team-notice" role="status">{notice}</div>}
    {incomingCall && <section className="team-incoming-call"><div><b>Incoming {incomingCall.media_type === "video" ? "video" : "voice"} call</b><small>Another connected Team member is calling you.</small></div><div className="team-actions"><button className="team-secondary" onClick={() => void declineCall()}>Decline</button><button className="team-primary" onClick={() => void acceptCall()}>Accept</button></div></section>}
    {callStatus && <section className="team-call-panel"><div className="team-card-heading"><div><span className="eyebrow">LIVE CALL</span><h3>{callStatus}</h3></div><button className="team-secondary" onClick={() => void finishCall()}>End call</button></div><div className="team-call-media">{remoteStream && <video ref={remoteVideoRef} autoPlay playsInline/>}{localStream && <video ref={localVideoRef} autoPlay playsInline muted/>}{activeMediaType === "audio" && <audio ref={remoteAudioRef} autoPlay/>}</div><small>Calls connect directly between devices. Browser camera and microphone permissions are required.</small></section>}
    <div className="team-grid">
      <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">YOUR IDENTITY</span><h3>Personal QR invitation</h3></div><span className="team-icon">QR</span></div><p>Your personal QR invitation stays available here. Other members can scan it repeatedly to send you a connection request.</p><div className="team-qr">{invite ? <><QRCodeSVG value={JSON.stringify({ type: "grand-lumen-team-invite", version: 1, accountId: userId, token: invite })} size={190} level="M"/><b>Personal QR · Bound to this account</b><span>{email || "Signed-in account"}</span><small>Account ID: {userId.slice(0, 8)}…{userId.slice(-6)}</small><button onClick={() => { void navigator.clipboard?.writeText(invite).then(() => setNotice("Personal invitation code copied.")).catch(() => setNotice("Clipboard access is unavailable on this device.")); }}>Copy invitation code</button></> : <p>{inviteLoading ? "Loading the QR identity for this signed-in account…" : "Your account-specific QR invitation could not load. Check the message above and reload Team."}</p>}</div>
      </section>
      <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">FIND A MEMBER</span><h3>Scan or enter a code</h3></div><span className="team-icon">+</span></div><p>Scan another member's QR invitation or paste their invitation code.</p><textarea value={inviteInput} onChange={event => setInviteInput(event.target.value)} placeholder="Paste invitation token here" rows={3}/><div className="team-actions"><button className="team-secondary" onClick={() => setCameraOpen(value => !value)}>{cameraOpen ? "Close camera" : "Scan QR code"}</button><button className="team-primary" onClick={() => void connectWithToken()} disabled={busy || !inviteInput.trim()}>Send request</button></div>{cameraOpen && <video className="team-camera" ref={videoRef} muted playsInline/>}</section>
    </div>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">CONNECTION REQUESTS</span><h3>Requests awaiting your approval</h3></div><span className="team-count">{requests.length}</span></div>{requests.length ? requests.map(request => <div className="team-request" key={request.id}><div><b>{profiles[request.requester_id]?.display_name || "Grand Lumen member"}</b><small>{profiles[request.requester_id]?.email || "Connection request"}</small></div><div className="team-actions"><button className="team-secondary" disabled={busy} onClick={() => void respond(request.id, false)}>Decline</button><button className="team-primary" disabled={busy} onClick={() => void respond(request.id, true)}>Accept</button></div></div>) : <p className="team-muted">No pending requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">SENT REQUESTS</span><h3>Awaiting their response</h3></div><span className="team-count">{sentRequests.length}</span></div>{sentRequests.length ? sentRequests.map(request => <div className="team-request" key={request.id}><div><b>{profiles[request.recipient_id]?.display_name || "Grand Lumen member"}</b><small>{profiles[request.recipient_id]?.email || "Request pending"}</small></div><span className="team-muted">Pending approval</span></div>) : <p className="team-muted">You have no outgoing requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">YOUR NETWORK</span><h3>Connected members</h3></div><span className="team-count">{connections.length}</span></div>{connections.length ? <div className="team-contacts">{connections.map(connection => { const memberId = connection.user_low === userId ? connection.user_high : connection.user_low; const profile = profiles[memberId]; return <button className={selected?.id === connection.id ? "team-contact active" : "team-contact"} key={connection.id} onClick={() => setSelected(connection)}><span className="team-avatar">{(profile?.display_name || profile?.email || "GL").slice(0, 1).toUpperCase()}</span><span><b>{profile?.display_name || "Grand Lumen member"}</b><small>{profile?.email || "Connected account"}</small></span></button>; })}</div> : <p className="team-muted">Your connections will appear here after they approve your requests.</p>}</section>
    <section className="team-card"><div className="team-card-heading"><div><span className="eyebrow">SHARED WORK</span><h3>Team projects</h3></div><span className="team-count">{projects.length}</span></div><div className="team-project-create"><input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Project name"/><input value={projectDescription} onChange={event => setProjectDescription(event.target.value)} placeholder="Short project description"/><button className="team-primary" onClick={() => void createProject()} disabled={!projectName.trim()}>Create project</button></div>{projects.map(project => <article className="team-project-row" key={project.id}><div><b>{project.name}</b><small>{project.description || "No description"} · {project.user_id === userId ? "Owner" : "Shared with you"}</small></div>{project.user_id === userId && connections.length > 0 && <div className="team-project-share"><select value={projectMember} onChange={event => setProjectMember(event.target.value)}><option value="">Choose member</option>{connections.map(connection => { const memberId = connection.user_low === userId ? connection.user_high : connection.user_low; return <option key={memberId} value={memberId}>{profiles[memberId]?.display_name || profiles[memberId]?.email || memberId.slice(0, 8)}</option>; })}</select><select value={projectRole} onChange={event => setProjectRole(event.target.value as "viewer" | "editor" | "manager")}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="manager">Manager</option></select><button className="team-secondary" onClick={() => void shareProject(project.id)} disabled={!projectMember}>Share</button></div>}</article>)}{!projects.length && <p className="team-muted">Create a cloud project, then share it with connected members.</p>}</section>
    {selected && <section className="team-card team-chat"><div className="team-card-heading"><div><span className="eyebrow">PRIVATE CONVERSATION</span><h3>{(() => { const memberId = selected.user_low === userId ? selected.user_high : selected.user_low; return profiles[memberId]?.display_name || "Team member"; })()}</h3></div><div className="team-actions"><button className="team-secondary" onClick={() => void startCall("audio")}>Voice call</button><button className="team-secondary" onClick={() => void startCall("video")}>Video call</button><button className="team-secondary" onClick={openWhatsApp}>WhatsApp</button><button className="team-secondary" onClick={() => setSelected(null)}>Close chat</button></div></div><div className="team-message-list">{messages.map(message => <article className={message.sender_id === userId ? "team-message own" : "team-message"} key={message.id}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleString()}</small></article>)}{!messages.length && <p className="team-muted">Start the conversation.</p>}</div><form className="team-compose" onSubmit={event => { event.preventDefault(); void sendMessage(); }}><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" maxLength={12000}/><button className="team-primary" disabled={!draft.trim()}>Send</button></form><div className="team-call-note">Voice and video calling require a configured call-signalling service. Chat and connection features are available here.</div></section>}
  </div>;
}
