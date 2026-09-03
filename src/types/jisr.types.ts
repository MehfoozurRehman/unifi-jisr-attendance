export type PunchType = 'in' | 'out';

export interface JisrEmployee {
  id: string | number;
  code?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  status?: string;
}

export interface JisrAttendanceLogPayload {
  employee_id: string | number;
  timestamp: string;
  punch_type: PunchType;
  device_id?: string;
  source?: string;
  latitude?: number;
  longitude?: number;
  note?: string;
}

export interface JisrPunchResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}
