import type { Request, Response } from 'express';
import { AccessTokenModel } from '../../models/accessToken.js';
import { AppConfigModel } from '../../models/appConfig.js';
import { PatientModel } from '../../models/patient.js';
import { AppointmentModel } from '../../models/appointment.js';
import { DrChronoConfigModel } from '../../models/drchronoConfig.js';
import { SilkOneConfigModel } from '../../models/silkOneConfig.js';
import { cryptoService } from '../../utils/crypto.js';

const createController = () => {
  /**
   * List all practices. Excludes the encrypted `token` field.
   * Joins with clientAppConfigs to indicate whether each practice has a config.
   */
  const listPractices = async (_req: Request, res: Response) => {
    try {
      const practices = await AccessTokenModel.find({}, { token: 0 }).lean();
      const configs = await AppConfigModel.find({}, { location: 1 }).lean();

      const configLocations = new Set(configs.map((c) => c.location));

      const result = practices.map((p) => ({
        ...p,
        hasConfig: configLocations.has(p.location),
      }));

      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list practices', details: err.message });
    }
  };

  /**
   * Get a single practice by location ID.
   * Includes patient count and appointment count for that location.
   */
  const getPractice = async (req: Request, res: Response) => {
    try {
      const { location } = req.params;
      if (!location) return res.status(400).json({ error: 'Missing location parameter' });

      const practice = await AccessTokenModel.findOne({ location }, { token: 0 }).lean();
      if (!practice) return res.status(404).json({ error: 'Practice not found' });

      const [patientCount, appointmentCount] = await Promise.all([
        PatientModel.countDocuments({ locationId: location }),
        AppointmentModel.countDocuments({ locationId: location }),
      ]);

      return res.status(200).json({
        ...practice,
        patientCount,
        appointmentCount,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to get practice', details: err.message });
    }
  };

  /**
   * Create a new practice (accessToken document).
   * Required: name, location, software.
   * Optional: company, calendar, timezone, pushGHL, pushAppt, pushPat, secret.
   * If secret is not provided, one is auto-generated.
   */
  const createPractice = async (req: Request, res: Response) => {
    try {
      const { name, location, software, company, calendar, timezone, pushGHL, pushAppt, pushPat, secret } = req.body;

      if (!name || !location || !software) {
        return res.status(400).json({ error: 'Missing required fields: name, location, software' });
      }

      const existing = await AccessTokenModel.findOne({ location }).lean();
      if (existing) {
        return res.status(409).json({ error: 'A practice with this location already exists' });
      }

      const newPractice = await AccessTokenModel.create({
        name,
        location,
        software,
        company: company || '',
        calendar: calendar || '',
        timezone: timezone || 'America/New_York',
        secret: secret || cryptoService.getNewSecret(),
        pushGHL: pushGHL ?? false,
        pushAppt: pushAppt ?? false,
        pushPat: pushPat ?? false,
      });

      // Return without the token field
      const result = newPractice.toObject();
      delete result.token;

      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create practice', details: err.message });
    }
  };

  /**
   * Update a practice by location.
   * Allowed fields: name, calendar, timezone, pushGHL, pushAppt, pushPat, software.
   * Does NOT allow updating the encrypted token.
   */
  const updatePractice = async (req: Request, res: Response) => {
    try {
      const { location } = req.params;
      if (!location) return res.status(400).json({ error: 'Missing location parameter' });

      const allowedFields = ['name', 'calendar', 'timezone', 'pushGHL', 'pushAppt', 'pushPat', 'software'];
      const updates: Record<string, any> = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const updated = await AccessTokenModel.findOneAndUpdate({ location }, { $set: updates }, { new: true, projection: { token: 0 } }).lean();

      if (!updated) return res.status(404).json({ error: 'Practice not found' });

      return res.status(200).json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update practice', details: err.message });
    }
  };

  /**
   * Delete a practice by location (hard delete).
   */
  const deletePractice = async (req: Request, res: Response) => {
    try {
      const { location } = req.params;
      if (!location) return res.status(400).json({ error: 'Missing location parameter' });

      const deleted = await AccessTokenModel.findOneAndDelete({ location }).lean();
      if (!deleted) return res.status(404).json({ error: 'Practice not found' });

      return res.status(200).json({ message: 'Practice deleted', location });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to delete practice', details: err.message });
    }
  };

  /**
   * Get stats for a specific practice location.
   * Returns: patient count, appointment count, last appointment date, config status.
   */
  const getPracticeStats = async (req: Request, res: Response) => {
    try {
      const { location } = req.params;
      if (!location) return res.status(400).json({ error: 'Missing location parameter' });

      const [patientCount, appointmentCount, lastAppointment, config] = await Promise.all([
        PatientModel.countDocuments({ locationId: location }),
        AppointmentModel.countDocuments({ locationId: location }),
        AppointmentModel.findOne({ locationId: location }).sort({ startTime: -1 }).select('startTime').lean(),
        AppConfigModel.findOne({ location }).select('_id').lean(),
      ]);

      return res.status(200).json({
        location,
        patientCount,
        appointmentCount,
        lastAppointmentDate: lastAppointment?.startTime || null,
        configStatus: config ? 'exists' : 'missing',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to get practice stats', details: err.message });
    }
  };

  /**
   * Dashboard overview with aggregate stats.
   * Returns: total practices, total patients, total appointments, per-practice summary.
   */
  const getDashboard = async (_req: Request, res: Response) => {
    try {
      const practices = await AccessTokenModel.find({}, { token: 0, secret: 0 }).lean();

      const [totalPatients, totalAppointments] = await Promise.all([
        PatientModel.countDocuments(),
        AppointmentModel.countDocuments(),
      ]);

      // Per-practice summary with counts
      const perPracticeSummary = await Promise.all(
        practices.map(async (practice) => {
          const [patientCount, appointmentCount, lastAppointment] = await Promise.all([
            PatientModel.countDocuments({ locationId: practice.location }),
            AppointmentModel.countDocuments({ locationId: practice.location }),
            // No dedicated sync-activity timestamp exists on patient/appointment
            // mappings (neither model has createdAt/updatedAt). The most recent
            // appointment startTime is the best available proxy for last sync
            // activity per location; null when the practice has no appointments.
            AppointmentModel.findOne({ locationId: practice.location })
              .sort({ startTime: -1 })
              .select('startTime')
              .lean(),
          ]);

          return {
            name: practice.name,
            location: practice.location,
            software: practice.software,
            // Source: the practice's accessTokens.timezone (GHL location tz).
            timezone: practice.timezone || null,
            lastSync: lastAppointment?.startTime || null,
            patientCount,
            appointmentCount,
          };
        }),
      );

      res.status(200).json({
        totalPractices: practices.length,
        totalPatients,
        totalAppointments,
        practices: perPracticeSummary,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get dashboard', details: err.message });
    }
  };

  /**
   * List DrChrono configurations.
   */
  const getDrChronoConfigs = async (_req: Request, res: Response) => {
    try {
      const configs = await DrChronoConfigModel.find({}).lean();
      res.status(200).json(configs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get DrChrono configs', details: err.message });
    }
  };

  /**
   * Get SilkOne configuration.
   */
  const getSilkOneConfig = async (_req: Request, res: Response) => {
    try {
      const config = await SilkOneConfigModel.findOne({}).lean();
      if (!config) return res.status(404).json({ error: 'SilkOne config not found' });
      return res.status(200).json(config);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to get SilkOne config', details: err.message });
    }
  };

  return {
    listPractices,
    getPractice,
    createPractice,
    updatePractice,
    deletePractice,
    getPracticeStats,
    getDashboard,
    getDrChronoConfigs,
    getSilkOneConfig,
  };
};

export const adminController = createController();
