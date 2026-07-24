import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";

// Visit /api/auth/google once, as the business owner, to connect your
// Google Calendar. This is not for customers — they never see this route.
export async function GET() {
  const url = getAuthUrl();
  return NextResponse.redirect(url);
}
