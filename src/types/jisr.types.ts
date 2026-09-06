export type PunchType = 'in' | 'out';

export interface JisrEmployee {
  id: string;
  code: string;
  full_name_en?: string;
  full_name_ar?: string;
  email?: string;
  telephone?: string;
  is_active?: boolean;
  status?: string;
}

export interface JisrAttendanceLogPayload {
  employee_id?: string | number;
  employee_code?: string | number;
  timestamp: string;
  punch_type?: PunchType;
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
