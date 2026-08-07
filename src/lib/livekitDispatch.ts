import crypto from 'crypto';
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from 'livekit-server-sdk';
import { env } from '../config/env';

export type LivekitDispatchResult = {
  room: string;
  agent_name: string;
  dispatch_id: string;
  ws_url: string;
  token: string;
  participant_identity: string;
};

export class LivekitDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LivekitDispatchError';
  }
}

const toHttpUrl = (wsUrl: string): string => {
  if (!wsUrl) return '';
  if (wsUrl.startsWith('wss://')) return wsUrl.replace('wss://', 'https://');
  if (wsUrl.startsWith('ws://')) return wsUrl.replace('ws://', 'http://');
  return wsUrl;
};

const randomRoom = (prefix = 'call'): string =>
  `${prefix}-${crypto.randomBytes(4).toString('hex')}`;

const isRoomAlreadyExists = (error: unknown): boolean => {
  const message = String(error);
  return (
    message.includes('already exists') || message.includes('AlreadyExists')
  );
};

class LivekitDispatcher {
  private get livekitUrl(): string {
    return env.LIVEKIT_URL;
  }
  private get apiKey(): string {
    return env.LIVEKIT_API_KEY;
  }
  private get apiSecret(): string {
    return env.LIVEKIT_API_SECRET;
  }
  private get tokenTtlMinutes(): number {
    return env.LIVEKIT_TOKEN_TTL_MIN;
  }

  private ensureConfigured(): void {
    if (!this.livekitUrl || !this.apiKey || !this.apiSecret) {
      throw new LivekitDispatchError(
        'LiveKit dispatch service is not configured',
      );
    }
  }

  async createDispatch(options: {
    doctorId: string;
    agentId: string;
    agentName: string;
    roomName?: string;
    participantIdentity?: string;
    participantName?: string;
    metadata?: Record<string, unknown> | string;
  }): Promise<LivekitDispatchResult> {
    this.ensureConfigured();

    const roomName = options.roomName ?? randomRoom();
    const identity = options.participantIdentity ?? 'dialer';
    const name = options.participantName ?? 'Dialer';
    const dispatchMetadata =
      typeof options.metadata === 'string'
        ? options.metadata
        : options.metadata
          ? JSON.stringify(options.metadata)
          : undefined;

    const httpUrl = toHttpUrl(this.livekitUrl);
    const roomClient = new RoomServiceClient(
      httpUrl,
      this.apiKey,
      this.apiSecret,
    );
    const dispatchClient = new AgentDispatchClient(
      httpUrl,
      this.apiKey,
      this.apiSecret,
    );

    try {
      try {
        await roomClient.createRoom({
          name: roomName,
          metadata: dispatchMetadata,
        });
      } catch (error) {
        if (!isRoomAlreadyExists(error)) throw error;
      }

      const dispatch = await dispatchClient.createDispatch(
        roomName,
        options.agentName,
        {
          metadata: dispatchMetadata,
        },
      );

      const token = new AccessToken(this.apiKey, this.apiSecret, {
        identity,
        name,
        ttl: `${this.tokenTtlMinutes}m`,
      });
      token.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
      });

      return {
        room: roomName,
        agent_name: options.agentName,
        dispatch_id: dispatch.id,
        ws_url: this.livekitUrl,
        token: await token.toJwt(),
        participant_identity: identity,
      };
    } catch (error) {
      console.error('LiveKit dispatch failed', {
        agentName: options.agentName,
        roomName,
        error,
      });
      throw new LivekitDispatchError(String(error));
    }
  }
}

export const livekitDispatcher = new LivekitDispatcher();
