import type { Request, Response } from 'express';
import { embodiSync } from './sync.js';
import { embodiService, tlpService } from './services.js';
import registry from './registry.js';
import { logger } from '../../logger.js';
import type { EmbodiLocationSetting } from './types.js';

const createEmbodiController = () => {
  const getAvailability = async (req: Request, res: Response) => {
    // request availability for the desired location and date
    res.status(200).json({ status: 'ok' });
  };

  const createAppointment = async (req: Request, res: Response) => {
    const data = { ...req.body };
    res.send(200);

    await handleCreatedAppointment(data);
  };

  /**
   * Direct function call entry point (used by webhooks module instead of HTTP).
   * Accepts the same payload that was previously POSTed to /embodi/calendar/createdAppointment.
   */
  const handleCreatedAppointment = async (data: any) => {
    const start = new Date(data.appointment.startTime);
    const end = new Date(data.appointment.endTime);

    logger.info(
      `sending start: ${Math.floor(start.getTime() / 1000)}, end: ${Math.floor(end.getTime() / 1000)}, contactId: ${data.appointment.contactId} to embodi`,
    );

    const locations: EmbodiLocationSetting[] = registry.get('locations') || [];
    const loc = locations.find((l: EmbodiLocationSetting) => l.locationId === data.locationId);

    await embodiSync.login();
    const resp = await embodiService.scheduleAppointment(
      Math.floor(start.getTime() / 1000),
      Math.floor(end.getTime() / 1000),
      data.appointment.contactId,
    );

    // if failed post notification
    if (resp && resp.status === 409) {
      const msg = {
        severity: 'Error',
        timestamp: new Date().toISOString(),
        message: `unable to schedule appointment with EMBODI timeslot no longer available\n**ID**: ${data.appointment.id}\n**Contact**: ${data.appointment.contactId}\n**Start Time**: ${data.appointment.startTime}\n**End Time**: ${data.appointment.endTime}`,
      };

      if (loc) {
        await tlpService.postNotification(msg, loc);
      }

      logger.error('unable to schedule appointment with embodi');
    }
  };

  const updateCalendar = async (req: Request, res: Response) => {
    const data = { ...req.body };
    const start = new Date(data.start * 1000);

    const locations: EmbodiLocationSetting[] = registry.get('locations') || [];
    const loc = locations.find((l: EmbodiLocationSetting) => l.locationId === data.locationId);

    if (loc) {
      res.status(200);
    } else {
      res.status(404).json({ message: 'unknown location' });
    }
    res.send();

    if (loc) {
      await embodiSync.login();
      await embodiSync.sync(start, loc);
    }
  };

  return {
    getAvailability,
    createAppointment,
    handleCreatedAppointment,
    updateCalendar,
  };
};

export const embodiController = createEmbodiController();
