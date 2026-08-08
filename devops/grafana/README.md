# Grafana Monitoring Setup

This directory contains the Grafana dashboards and alerts provisioning for the application.

## Provisioned Files

### Dashboards
- `provisioning/dashboards/chat-monitoring-dashboard.json`: Chat monitoring dashboard tracking outbox backlog, Celery queue depth, Postgres connections, and dead-letters.

### Alerts
- `provisioning/alerts/chat-alerts.yaml`: Alerting rules for the chat service.
  - Alerts on Outbox Backlog (> 50)
  - Alerts on Outbox Oldest Event Age (> 10s)
  - Alerts on Celery Realtime Queue Age (> 1s)
  - Alerts on PostgreSQL Active Connections (> 80% usage)
  - Alerts on Outbox Failed Attempts (> 3)
