import { NextResponse } from 'next/server';

import { handleError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';

/** The signed-in user, or an explicit null. Route handlers own the cookies. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return handleError(error);
  }
}
