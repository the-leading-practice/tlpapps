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

    // Inject x-tlp-app-* headers from JWT payload for backward compatibility
    // (patient/appointment controllers read these instead of req.payload)
    const p = payload as AuthPayload;
    if (p.location) req.headers['x-tlp-app-location'] = `${p.location} ${p.token || ''}`;
    if (p.calendar) req.headers['x-tlp-app-calendar'] = p.calendar;
    if (p.timezone) req.headers['x-tlp-app-timezone'] = p.timezone;
    if (p.software) req.headers['x-tlp-app-software'] = p.software;
    if (token) req.headers['x-tlp-app-jwt'] = token;
    if (p.pushGHL) req.headers['x-tlp-app-pushghl'] = 'true';
    if (p.pushAppt) req.headers['x-tlp-app-pushappt'] = 'true';
    if (p.pushPat) req.headers['x-tlp-app-pushpat'] = 'true';

    next();
  });
}
