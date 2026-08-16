import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("sesion")?.value;
  if (!token) return NextResponse.redirect(new URL("/", req.url));
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET!));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }
}
export const config = { matcher: ["/panel/:path*"] };
