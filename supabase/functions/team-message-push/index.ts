import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@grand-lumen.app";

    const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const { messageId } = await request.json();
    if (!messageId || typeof messageId !== "string") return new Response("Invalid message", { status: 400, headers: corsHeaders });

    const admin = createClient(url, serviceKey);
    const { data: message, error: messageError } = await admin.from("grand_lumen_team_messages")
      .select("id,conversation_id,sender_id,body,deleted_for_everyone")
      .eq("id", messageId).single();
    if (messageError || !message || message.sender_id !== authData.user.id || message.deleted_for_everyone) {
      return new Response("Message not found", { status: 404, headers: corsHeaders });
    }

    const { data: conversation, error: conversationError } = await admin.from("grand_lumen_team_conversations")
      .select("connection_id").eq("id", message.conversation_id).single();
    if (conversationError || !conversation) throw conversationError || new Error("Conversation unavailable");

    const { data: connection, error: connectionError } = await admin.from("grand_lumen_team_connections")
      .select("user_low,user_high").eq("id", conversation.connection_id).single();
    if (connectionError || !connection) throw connectionError || new Error("Connection unavailable");

    const recipientId = connection.user_low === authData.user.id ? connection.user_high : connection.user_low;
    const [{ data: sender }, { data: subscriptions }] = await Promise.all([
      admin.from("grand_lumen_profiles").select("display_name").eq("id", authData.user.id).maybeSingle(),
      admin.from("grand_lumen_team_push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", recipientId)
    ]);

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const attachmentPrefix = "GLATTACH:";
    let preview = message.body;
    if (preview.startsWith(attachmentPrefix)) {
      try {
        const attachment = JSON.parse(preview.slice(attachmentPrefix.length));
        preview = attachment.kind === "image" ? "Sent a photo" : attachment.kind === "video" ? "Sent a video" : attachment.kind === "audio" ? "Sent an audio message" : "Sent a file: " + attachment.name;
      } catch { preview = "Sent an attachment"; }
    }
    const payload = JSON.stringify({
      title: sender?.display_name || "A Team member",
      body: preview.slice(0, 180),
      tag: "grand-lumen-message-" + message.conversation_id,
      url: "https://junior-pobee.github.io/Grand-Lumen/?openTeam=1"
    });

    const outcomes = await Promise.all((subscriptions || []).map(async subscription => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, payload);
        return "sent";
      } catch (error) {
        const status = Number((error as { statusCode?: number }).statusCode || 0);
        if (status === 404 || status === 410) await admin.from("grand_lumen_team_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        return "failed";
      }
    }));

    return new Response(JSON.stringify({ success: true, sent: outcomes.filter(value => value === "sent").length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Notification delivery failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
