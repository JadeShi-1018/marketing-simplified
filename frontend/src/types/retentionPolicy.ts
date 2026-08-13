export interface RetentionPolicy {
  label: string;
  description: string;
  app_label: string;
  model_name: string;
  timestamp_field: string;
  retention_days_setting: string;
  retention_days: number | null;
}
