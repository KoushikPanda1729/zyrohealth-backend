import { env } from '../config/env';

export type AgentServicePayload = {
  livekit_agent_id?: string;
  agent_id?: string;
  version_id?: string;
  doctor_id: string;
  name?: string;
  display_name?: string;
  active?: boolean;
  system_prompt: string;
  welcome_message?: string | null;
  welcome_allow_interruptions?: boolean;
  language?: string;
  llm_provider: string;
  llm_model: string;
  llm_temperature?: number;
  stt_provider: string;
  stt_model: string;
  tts_provider: string;
  tts_model: string;
  tts_voice?: string;
  tts_language?: string;
  tts_voice_settings?: Record<string, unknown>;
  dynamic_variables?: Record<string, string | number | boolean>;
};

export type AgentServiceResponse = {
  livekit_agent_id: string;
  agent_id: string | null;
  doctor_id: string;
  version_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AgentStatusResponse = {
  agent_id: string;
  latest_build: { id: string; status: string; error?: string | null } | null;
  latest_deployment: {
    id: string;
    status: string;
    livekit_deployed_agent_id?: string | null;
    error?: string | null;
  } | null;
};

export class AgentServiceError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'AgentServiceError';
    this.status = status;
    this.details = details;
  }
}

class AgentServiceClient {
  private get baseUrl(): string {
    return (env.AGENT_SERVICE_URL ?? '').replace(/\/$/, '');
  }
  private get authToken(): string | undefined {
    return env.AGENT_SERVICE_TOKEN;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.authToken) headers['authorization'] = `Bearer ${this.authToken}`;
    return headers;
  }

  private async request<T>(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<T> {
    if (!this.baseUrl)
      throw new AgentServiceError('Agent service URL not configured', 500);
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method,
      headers: this.buildHeaders(),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      let details: unknown;
      try {
        details = JSON.parse(text);
      } catch {
        details = text;
      }
      throw new AgentServiceError(
        `Agent service error: ${res.status}`,
        res.status,
        details,
      );
    }
    return JSON.parse(text) as T;
  }

  createAgent(payload: AgentServicePayload): Promise<AgentServiceResponse> {
    return this.request<AgentServiceResponse>('/agents', {
      method: 'POST',
      body: payload,
    });
  }

  updateAgent(
    livekitAgentId: string,
    payload: AgentServicePayload,
  ): Promise<AgentServiceResponse> {
    return this.request<AgentServiceResponse>('/agents?auto_build=true', {
      method: 'POST',
      body: { ...payload, livekit_agent_id: livekitAgentId },
    });
  }

  deleteAgent(agentId: string, doctorId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(
      `/agents/${agentId}?doctor_id=${doctorId}`,
      { method: 'DELETE' },
    );
  }

  getStatus(agentId: string): Promise<AgentStatusResponse> {
    return this.request<AgentStatusResponse>(`/agents/${agentId}/status`, {
      method: 'GET',
    });
  }
}

export const agentServiceClient = new AgentServiceClient();
