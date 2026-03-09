import { NextResponse } from 'next/server';
import centresData from '@/../../data/centres.json';

export async function GET() {
  return NextResponse.json(centresData);
}