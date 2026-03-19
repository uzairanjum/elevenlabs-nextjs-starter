import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';

export async function GET() {
  try {
    const agentId = env.NEXT_PUBLIC_AGENT_ID;

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID not configured' },
        { status: 500 }
      );
    }

    const apiKey = env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to get token:', error);
      return NextResponse.json(
        { error: 'Failed to get token from ElevenLabs' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ token: data.token, agentId: agentId });
  } catch (error) {
    console.error('Error getting token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
