import { SipClient } from 'livekit-server-sdk';
import { env } from '../config/env';

export class LivekitSipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LivekitSipError';
  }
}

class LivekitSipClient {
  private client?: SipClient;

  private ensureConfigured(): void {
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
      throw new LivekitSipError('SIP service is not configured');
    }
  }

  private getClient(): SipClient {
    this.ensureConfigured();
    if (!this.client) {
      const url = env.LIVEKIT_URL.startsWith('ws://')
        ? env.LIVEKIT_URL.replace('ws://', 'http://')
        : env.LIVEKIT_URL.replace('wss://', 'https://');
      this.client = new SipClient(
        url,
        env.LIVEKIT_API_KEY,
        env.LIVEKIT_API_SECRET,
      );
    }
    return this.client;
  }

  createInboundTrunk(
    ...args: Parameters<SipClient['createSipInboundTrunk']>
  ): ReturnType<SipClient['createSipInboundTrunk']> {
    return this.getClient().createSipInboundTrunk(...args);
  }

  listInboundTrunks(
    ...args: Parameters<SipClient['listSipInboundTrunk']>
  ): ReturnType<SipClient['listSipInboundTrunk']> {
    return this.getClient().listSipInboundTrunk(...args);
  }

  listSipDispatchRules(
    ...args: Parameters<SipClient['listSipDispatchRule']>
  ): ReturnType<SipClient['listSipDispatchRule']> {
    return this.getClient().listSipDispatchRule(...args);
  }

  createOutboundTrunk(
    ...args: Parameters<SipClient['createSipOutboundTrunk']>
  ): ReturnType<SipClient['createSipOutboundTrunk']> {
    return this.getClient().createSipOutboundTrunk(...args);
  }

  updateInboundTrunk(
    ...args: Parameters<SipClient['updateSipInboundTrunk']>
  ): ReturnType<SipClient['updateSipInboundTrunk']> {
    return this.getClient().updateSipInboundTrunk(...args);
  }

  updateOutboundTrunk(
    ...args: Parameters<SipClient['updateSipOutboundTrunk']>
  ): ReturnType<SipClient['updateSipOutboundTrunk']> {
    return this.getClient().updateSipOutboundTrunk(...args);
  }

  createSipParticipant(
    ...args: Parameters<SipClient['createSipParticipant']>
  ): ReturnType<SipClient['createSipParticipant']> {
    return this.getClient().createSipParticipant(...args);
  }

  createSipDispatchRule(
    ...args: Parameters<SipClient['createSipDispatchRule']>
  ): ReturnType<SipClient['createSipDispatchRule']> {
    return this.getClient().createSipDispatchRule(...args);
  }

  updateSipDispatchRule(
    ...args: Parameters<SipClient['updateSipDispatchRule']>
  ): ReturnType<SipClient['updateSipDispatchRule']> {
    return this.getClient().updateSipDispatchRule(...args);
  }

  deleteSipTrunk(
    ...args: Parameters<SipClient['deleteSipTrunk']>
  ): ReturnType<SipClient['deleteSipTrunk']> {
    return this.getClient().deleteSipTrunk(...args);
  }

  deleteSipDispatchRule(
    ...args: Parameters<SipClient['deleteSipDispatchRule']>
  ): ReturnType<SipClient['deleteSipDispatchRule']> {
    return this.getClient().deleteSipDispatchRule(...args);
  }
}

export const livekitSipClient = new LivekitSipClient();
