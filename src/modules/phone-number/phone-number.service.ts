import { injectable } from 'tsyringe';
import { v4 as uuidv4 } from 'uuid';
import { In, Repository } from 'typeorm';
import {
  RoomAgentDispatch,
  RoomConfiguration,
  SIPDispatchRule,
  SIPDispatchRuleInfo,
  SIPDispatchRuleIndividual,
  CreateSipOutboundTrunkOptions,
} from 'livekit-server-sdk';
import { AppDataSource } from '../../config/database';
import { VoiceAgentPhoneNumber } from '../../entities/VoiceAgentPhoneNumber';
import { VoiceAgent } from '../../entities/VoiceAgent';
import {
  VoiceAgentCall,
  VoiceAgentCallType,
  VoiceAgentCallStatus,
} from '../../entities/VoiceAgentCall';
import { AppError } from '../../utils/app-error';
import { livekitSipClient } from '../../lib/sipClient';
import { livekitDispatcher } from '../../lib/livekitDispatch';
import { buildRoomEgress, buildS3EgressOutput } from '../../lib/s3Recording';
import { EgressClient } from 'livekit-server-sdk';
import { env } from '../../config/env';
import {
  ImportInboundDtoType,
  ImportOutboundDtoType,
  AssignAgentDtoType,
  InitiateCallDtoType,
} from './phone-number.dto';

function buildDispatchRuleInfo(
  phoneNumber: string,
  trunkId: string,
  agentName: string | null,
  agentId?: string,
  phoneNumberId?: string,
  doctorId?: string,
): SIPDispatchRuleInfo {
  const roomPrefix = `inbound-${phoneNumber.replace(/\D/g, '')}-`;
  const egress =
    doctorId && agentId ? buildRoomEgress(doctorId, agentId) : undefined;
  const roomConfig = agentName
    ? new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName,
            metadata: JSON.stringify({
              agent_id: agentId,
              phone_number_id: phoneNumberId,
              phone_number: phoneNumber,
            }),
          }),
        ],
        ...(egress && { egress }),
      })
    : new RoomConfiguration({ agents: [] });

  return new SIPDispatchRuleInfo({
    trunkIds: [trunkId],
    rule: new SIPDispatchRule({
      rule: {
        case: 'dispatchRuleIndividual',
        value: new SIPDispatchRuleIndividual({ roomPrefix }),
      },
    }),
    roomConfig,
  });
}

@injectable()
export class PhoneNumberService {
  private get phoneRepo(): Repository<VoiceAgentPhoneNumber> {
    return AppDataSource.getRepository(VoiceAgentPhoneNumber);
  }
  private get agentRepo(): Repository<VoiceAgent> {
    return AppDataSource.getRepository(VoiceAgent);
  }
  private get callRepo(): Repository<VoiceAgentCall> {
    return AppDataSource.getRepository(VoiceAgentCall);
  }

  async list(doctorId: string): Promise<
    Array<
      VoiceAgentPhoneNumber & {
        assignedAgent: { id: string; name: string; displayName: string } | null;
      }
    >
  > {
    const phones = await this.phoneRepo.find({
      where: { assignedDoctorId: doctorId, isActive: true },
    });
    const agentIds = phones
      .map((p) => p.assignedAgentId)
      .filter(Boolean) as string[];
    let agentMap: Record<
      string,
      { id: string; name: string; displayName: string }
    > = {};
    if (agentIds.length) {
      const agents = await this.agentRepo.find({ where: { id: In(agentIds) } });
      agentMap = Object.fromEntries(
        agents.map((a) => [
          a.id,
          { id: a.id, name: a.name, displayName: a.displayName },
        ]),
      );
    }
    return phones.map((p) => ({
      ...p,
      assignedAgent: p.assignedAgentId
        ? (agentMap[p.assignedAgentId] ?? null)
        : null,
    }));
  }

  // LiveKit rejects a new inbound trunk if another trunk already claims the same
  // number without AllowedNumbers set ("Conflicting inbound SIP Trunks"). Remove
  // any pre-existing trunk(s) for this number — and their dispatch rules — first,
  // so re-importing a number is idempotent and self-heals orphaned trunks.
  private async cleanupExistingInboundTrunks(
    phoneNumber: string,
  ): Promise<void> {
    try {
      const trunks = await livekitSipClient.listInboundTrunks();
      const conflicting = trunks.filter((t) =>
        (t.numbers ?? []).includes(phoneNumber),
      );
      if (!conflicting.length) return;

      const trunkIds = new Set(conflicting.map((t) => t.sipTrunkId));

      const rules = await livekitSipClient.listSipDispatchRules();
      for (const rule of rules) {
        if ((rule.trunkIds ?? []).some((id) => trunkIds.has(id))) {
          try {
            await livekitSipClient.deleteSipDispatchRule(
              rule.sipDispatchRuleId,
            );
          } catch {
            /* best effort */
          }
        }
      }
      for (const id of trunkIds) {
        try {
          await livekitSipClient.deleteSipTrunk(id);
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      // If listing isn't available, let createInboundTrunk surface the real error.
      console.warn(
        '[importInbound] cleanup of existing inbound trunks failed',
        err,
      );
    }
  }

  async importInbound(
    doctorId: string,
    tenantId: string,
    dto: ImportInboundDtoType,
  ): Promise<VoiceAgentPhoneNumber> {
    await this.cleanupExistingInboundTrunks(dto.phoneNumber);

    const trunk = await livekitSipClient.createInboundTrunk(
      dto.label,
      [dto.phoneNumber],
      { allowedAddresses: dto.allowedAddresses },
    );

    const dispatchRule = await livekitSipClient.createSipDispatchRule(
      {
        type: 'individual',
        roomPrefix: `inbound-${dto.phoneNumber.replace(/\D/g, '')}-`,
      },
      { trunkIds: [trunk.sipTrunkId], name: `dispatch-${dto.label}` },
    );

    const existing = await this.phoneRepo.findOne({
      where: { phoneNumber: dto.phoneNumber },
    });
    if (existing) {
      existing.label = dto.label;
      existing.provider = dto.provider;
      existing.assignedDoctorId = doctorId;
      existing.tenantId = tenantId;
      existing.inboundTrunkId = trunk.sipTrunkId;
      existing.inboundDispatchRuleId = dispatchRule.sipDispatchRuleId;
      existing.isActive = true;
      return this.phoneRepo.save(existing);
    }

    return this.phoneRepo.save(
      this.phoneRepo.create({
        phoneNumber: dto.phoneNumber,
        label: dto.label,
        provider: dto.provider,
        assignedDoctorId: doctorId,
        tenantId,
        inboundTrunkId: trunk.sipTrunkId,
        inboundDispatchRuleId: dispatchRule.sipDispatchRuleId,
        isActive: true,
      }),
    );
  }

  async importOutbound(
    doctorId: string,
    dto: ImportOutboundDtoType,
  ): Promise<VoiceAgentPhoneNumber> {
    const phone = await this.phoneRepo.findOne({
      where: { id: dto.phoneNumberId, assignedDoctorId: doctorId },
    });
    if (!phone) throw AppError.notFound('Phone number');

    const outboundTrunkOptions: CreateSipOutboundTrunkOptions = {
      // 0 = SIP_TRANSPORT_AUTO, the same default the SDK uses when no
      // options object (and therefore no `transport`) is supplied.
      transport: 0,
      ...(dto.username ? { authUsername: dto.username } : {}),
      ...(dto.password ? { authPassword: dto.password } : {}),
    };

    const trunk = await livekitSipClient.createOutboundTrunk(
      `${phone.label ?? phone.phoneNumber} outbound`,
      dto.address,
      [phone.phoneNumber],
      outboundTrunkOptions,
    );

    phone.outboundTrunkId = trunk.sipTrunkId;
    return this.phoneRepo.save(phone);
  }

  async assignAgent(
    phoneId: string,
    doctorId: string,
    dto: AssignAgentDtoType,
  ): Promise<VoiceAgentPhoneNumber> {
    const phone = await this.phoneRepo.findOne({
      where: { id: phoneId, assignedDoctorId: doctorId },
    });
    if (!phone) throw AppError.notFound('Phone number');

    const agent = await this.agentRepo.findOne({
      where: { id: dto.agentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    // Update dispatch rule to auto-dispatch this agent when inbound call arrives
    if (phone.inboundDispatchRuleId && phone.inboundTrunkId) {
      try {
        const ruleInfo = buildDispatchRuleInfo(
          phone.phoneNumber,
          phone.inboundTrunkId,
          agent.name,
          agent.id,
          phone.id,
          doctorId,
        );
        await livekitSipClient.updateSipDispatchRule(
          phone.inboundDispatchRuleId,
          ruleInfo,
        );
      } catch {
        /* best effort — rule may not exist yet */
      }
    }

    phone.assignedAgentId = dto.agentId;
    return this.phoneRepo.save(phone);
  }

  async unassignAgent(
    phoneId: string,
    doctorId: string,
  ): Promise<VoiceAgentPhoneNumber> {
    const phone = await this.phoneRepo.findOne({
      where: { id: phoneId, assignedDoctorId: doctorId },
    });
    if (!phone) throw AppError.notFound('Phone number');

    // Clear agent dispatch from the dispatch rule
    if (phone.inboundDispatchRuleId && phone.inboundTrunkId) {
      try {
        const ruleInfo = buildDispatchRuleInfo(
          phone.phoneNumber,
          phone.inboundTrunkId,
          null,
        );
        await livekitSipClient.updateSipDispatchRule(
          phone.inboundDispatchRuleId,
          ruleInfo,
        );
      } catch {
        /* best effort */
      }
    }

    phone.assignedAgentId = undefined;
    return this.phoneRepo.save(phone);
  }

  async delete(phoneId: string, doctorId: string): Promise<void> {
    const phone = await this.phoneRepo.findOne({
      where: { id: phoneId, assignedDoctorId: doctorId },
    });
    if (!phone) throw AppError.notFound('Phone number');

    if (phone.inboundTrunkId) {
      try {
        await livekitSipClient.deleteSipTrunk(phone.inboundTrunkId);
      } catch {
        /* best effort */
      }
    }
    if (
      phone.outboundTrunkId &&
      phone.outboundTrunkId !== phone.inboundTrunkId
    ) {
      try {
        await livekitSipClient.deleteSipTrunk(phone.outboundTrunkId);
      } catch {
        /* best effort */
      }
    }
    if (phone.inboundDispatchRuleId) {
      try {
        await livekitSipClient.deleteSipDispatchRule(
          phone.inboundDispatchRuleId,
        );
      } catch {
        /* best effort */
      }
    }

    await this.phoneRepo.delete(phoneId);
  }

  async initiateCall(
    phoneId: string,
    doctorId: string,
    dto: InitiateCallDtoType,
  ): Promise<VoiceAgentCall> {
    const phone = await this.phoneRepo.findOne({
      where: { id: phoneId, assignedDoctorId: doctorId },
    });
    if (!phone) throw AppError.notFound('Phone number');
    if (!phone.outboundTrunkId)
      throw AppError.badRequest(
        'No outbound trunk configured for this phone number',
      );
    if (!phone.assignedAgentId)
      throw AppError.badRequest('No agent assigned to this phone number');

    const agent = await this.agentRepo.findOne({
      where: { id: phone.assignedAgentId, doctorId },
    });
    if (!agent) throw AppError.notFound('Voice agent');

    const roomName = `outbound-${agent.name}-${uuidv4().slice(0, 8)}`;

    const call = this.callRepo.create({
      agentId: agent.id,
      doctorId,
      roomName,
      callType: VoiceAgentCallType.OUTBOUND,
      fromNumber: phone.phoneNumber,
      toNumber: dto.toNumber,
      status: VoiceAgentCallStatus.INITIATED,
    });
    await this.callRepo.save(call);

    try {
      await livekitDispatcher.createDispatch({
        doctorId,
        agentId: agent.id,
        agentName: agent.name,
        roomName,
        participantIdentity: `dialer-${uuidv4().slice(0, 8)}`,
        participantName: 'Outbound Dialer',
        metadata: {
          agent_id: agent.id,
          agent_name: agent.name,
          doctor_id: doctorId,
          from_number: phone.phoneNumber,
          to_number: dto.toNumber,
          dynamic_variables: dto.dynamicVariables ?? {},
        },
      });

      await livekitSipClient.createSipParticipant(
        phone.outboundTrunkId,
        dto.toNumber,
        roomName,
        { waitUntilAnswered: dto.waitUntilAnswered },
      );

      await this.callRepo.update(call.id, {
        status: VoiceAgentCallStatus.ACTIVE,
      });

      try {
        const egressClient = new EgressClient(
          env.LIVEKIT_URL,
          env.LIVEKIT_API_KEY,
          env.LIVEKIT_API_SECRET,
        );
        await egressClient.startRoomCompositeEgress(
          roomName,
          buildS3EgressOutput(doctorId, agent.id),
          { audioOnly: true },
        );
      } catch (err) {
        console.error(
          '[recording] Failed to start egress for outbound room',
          roomName,
          err,
        );
      }

      return call;
    } catch (err) {
      await this.callRepo.update(call.id, {
        status: VoiceAgentCallStatus.FAILED,
      });
      throw err;
    }
  }

  async listDoctorAgents(doctorId: string): Promise<VoiceAgent[]> {
    return this.agentRepo.find({
      where: { doctorId },
      select: ['id', 'name', 'displayName'],
      order: { displayName: 'ASC' },
    });
  }
}
