import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const authorization = request.headers.get("Authorization");
  if (!authorization) return Response.json({ error: "Authentication required." }, { status: 401, headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) return Response.json({ error: "Account services are not configured." }, { status: 500, headers: corsHeaders });

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authResult = await userClient.auth.getUser();
  if (authResult.error || !authResult.data.user) return Response.json({ error: "Your session is invalid. Sign in again." }, { status: 401, headers: corsHeaders });

  let body: { action?: string; confirmation?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400, headers: corsHeaders }); }
  const action = body.action;
  if (!["deactivate", "reactivate", "delete"].includes(String(action))) return Response.json({ error: "Unsupported account action." }, { status: 400, headers: corsHeaders });
  if (action === "delete" && body.confirmation !== "DELETE") return Response.json({ error: "Type DELETE to confirm permanent account deletion." }, { status: 400, headers: corsHeaders });

  const user = authResult.data.user;
  const status = action === "deactivate" ? "deactivated" : action === "delete" ? "deleted" : "active";
  const changed = await userClient.rpc("grand_lumen_set_account_status", { p_status: status });
  if (changed.error) return Response.json({ error: changed.error.message }, { status: 400, headers: corsHeaders });

  if (action === "delete") {
    const anonymized = await adminClient.auth.admin.updateUserById(user.id, {
      email: "deleted+" + user.id + "@accounts.invalid",
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { account_deleted: true },
      app_metadata: { account_status: "deleted" },
      ban_duration: "876000h"
    });
    if (anonymized.error) return Response.json({ error: "Your content has been anonymised, but sign-in could not yet be disabled. Contact support before considering deletion complete." }, { status: 500, headers: corsHeaders });
    const scrubbedProfile = await adminClient.from("grand_lumen_profiles").update({ email: null }).eq("id", user.id);
    if (scrubbedProfile.error) return Response.json({ error: "Sign-in has been disabled, but the profile email could not be fully anonymised. Contact support." }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ status, notifications: changed.data?.notifications ?? 0 }, { headers: corsHeaders });
});
