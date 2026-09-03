export interface UnifiWebhookActor {
  id?: string;
  name?: string;
  type?: string;
  email?: string;
}

export interface UnifiWebhookTarget {
  id?: string;
  name?: string;
  type?: string;
  display_name?: string;
}

export interface UnifiWebhookPayload {
  event?: string;
  timestamp?: number | string;
  actor?: UnifiWebhookActor;
  target?: UnifiWebhookTarget;
  data?: {
    door_id?: string;
    door_name?: string;
    reader_id?: string;
    reader_name?: string;
    event_type?: string;
    result?: string;
    user_id?: string;
    user_name?: string;
    user_email?: string;
    timestamp?: number | string;
  };
  [key: string]: unknown;
}

export interface UnifiUser {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  card_id?: string;
}
