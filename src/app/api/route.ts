import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ test: "hello", time: new Date().toISOString() });
}
