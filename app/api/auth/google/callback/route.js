import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/google";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:40px;max-width:600px">
        <h2>No refresh token returned</h2>
        <p>Google only returns a refresh token the <b>first</b> time you authorize, or if you
        revoke access first. Go to <a href="https://myaccount.google.com/permissions">
        Google Account &rarr; Security &rarr; Third-party access</a>, remove this app's access,
        then visit <a href="/api/auth/google">/api/auth/google</a> again.</p>
      </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  // Show the refresh token once so it can be copied into your host's env vars
  // (e.g. Vercel Project Settings -> Environment Variables -> GOOGLE_REFRESH_TOKEN).
  // It is NOT stored anywhere by this app — copy it now.
  return new NextResponse(
    `<html><body style="font-family:sans-serif;padding:40px;max-width:700px">
      <h2>Calendar connected ✅</h2>
      <p>Copy this value into your deployment's environment variables as
      <code>GOOGLE_REFRESH_TOKEN</code>, then redeploy:</p>
      <textarea style="width:100%;height:80px;font-family:monospace;padding:10px">${tokens.refresh_token}</textarea>
      <p style="color:#9C4A2E">This is shown once. If you lose it, revoke access in your
      Google Account and reconnect.</p>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
