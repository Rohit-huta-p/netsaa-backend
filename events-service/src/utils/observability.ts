type Level = 'info' | 'warn' | 'error';

export type MetricName =
    | 'capacity_drift_detected'
    | 'reservation_compensation_failed'
    | 'auto_flag_triggered'
    | 'reminder_sent'
    | 'event_published'
    | 'event_cancelled'
    | 'event_rescheduled'
    | 'csv_exported'
    | 'cron_swept'
    | 'razorpay_webhook_received'
    | 'razorpay_webhook_signature_invalid'
    | 'razorpay_webhook_unhandled'
    | 'razorpay_webhook_orphan_capture'
    | 'razorpay_payment_failed'
    | 'razorpay_refund_processed'
    | 'razorpay_order_create_failed';

interface EmitProps {
    [key: string]: any;
}

/**
 * Emit a structured log line for ingestion by log-aggregator (CloudWatch Logs Insights,
 * Datadog, Loki). One JSON object per line, no trailing newline — bash printf-friendly.
 *
 * Reserved fields: metric, level, ts. Everything else passes through as-is.
 *
 * Pluggable: this is the single throat for downstream observability. To wire to PagerDuty
 * or Slack on level=error, intercept here.
 */
export function emit(metric: MetricName, level: Level, props: EmitProps = {}): void {
    const line = JSON.stringify({
        metric,
        level,
        ts: new Date().toISOString(),
        ...props,
    });
    console.log(line);
}
