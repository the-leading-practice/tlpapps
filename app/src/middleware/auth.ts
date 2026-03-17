import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { Request, Response, NextFunction } from 'express';

export interface AuthPayload {
  location: string;
  calendar: string;
  timezone: string;
  name: string;
  token: string;
  pushGHL: boolean;
  pushAppt: boolean;
  pushPat: boolean;
  software: string;
}

export interface AuthenticatedRequest extends Request {
  payload?: AuthPayload;
  jwt?: string;
}

export function authToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.sendStatus(401);
    return;
  }

  jwt.verify(token, config.tokenKey, (err: any, payload: any) => {
    if (err) {
      res.sendStatus(403);
      return;
    }
    req.payload = payload as AuthPayload;
    req.jwt = token;
    next();
  });
}
