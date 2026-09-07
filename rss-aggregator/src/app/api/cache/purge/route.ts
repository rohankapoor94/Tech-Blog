import { NextResponse } from "next/server";
import { purgeCache } from "@/lib/cache";

export async function GET() {
  purgeCache();
  return NextResponse.json({ success: true, message: "Cache purged successfully" });
}
