import { Request, Response, NextFunction } from 'express';
import { injectable } from 'tsyringe';
import { PhoneNumberService } from './phone-number.service';
import {
  ImportInboundDto,
  ImportOutboundDto,
  AssignAgentDto,
  InitiateCallDto,
} from './phone-number.dto';
import { success } from '../../utils/api-response';

@injectable()
export class PhoneNumberController {
  constructor(private readonly svc: PhoneNumberService) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.svc.list(req.user!.id as string);
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  importInbound = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = ImportInboundDto.parse(req.body);
      const result = await this.svc.importInbound(
        req.user!.id as string,
        req.user!.tenantId as string,
        dto,
      );
      res.status(201).json(success(result));
    } catch (err) {
      next(err);
    }
  };

  importOutbound = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = ImportOutboundDto.parse(req.body);
      const result = await this.svc.importOutbound(req.user!.id as string, dto);
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  assignAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = AssignAgentDto.parse(req.body);
      const result = await this.svc.assignAgent(
        req.params['id'] as string,
        req.user!.id as string,
        dto,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  unassignAgent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.svc.unassignAgent(
        req.params['id'] as string,
        req.user!.id as string,
      );
      res.json(success(null));
    } catch (err) {
      next(err);
    }
  };

  delete = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.svc.delete(req.params['id'] as string, req.user!.id as string);
      res.json(success(null));
    } catch (err) {
      next(err);
    }
  };

  initiateCall = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const dto = InitiateCallDto.parse(req.body);
      const result = await this.svc.initiateCall(
        req.params['id'] as string,
        req.user!.id as string,
        dto,
      );
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };

  listAgents = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.svc.listDoctorAgents(req.user!.id as string);
      res.json(success(result));
    } catch (err) {
      next(err);
    }
  };
}
