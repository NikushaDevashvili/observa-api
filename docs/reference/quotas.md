# Quotas Reference

Complete reference for Observa quotas and limits.

## Monthly Event Quotas

### Free Plan

- **Limit**: 10,000,000 events per month
- **Reset**: Monthly (first of month)
- **Overage**: Requests rejected with 429 error

### Pro Plan

- **Limit**: 100,000,000 events per month
- **Reset**: Monthly
- **Overage**: Contact support

### Enterprise Plan

- **Limit**: Custom
- **Reset**: Monthly or custom
- **Overage**: Custom handling

## Checking Quota

### Via API

```bash
curl -H "Authorization: Bearer TOKEN" \
  https://observa-api.vercel.app/api/v1/tenants/TENANT_ID
```

Response includes:
- `monthly_event_quota`: Total quota
- `monthly_event_count`: Current usage
- `quota_period_start`: When quota period started

### Via Dashboard

1. Go to Settings
2. View quota information
3. See current usage and reset date

## Quota Exceeded

When quota is exceeded:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Monthly event quota exceeded",
    "details": {
      "quota": 10000000,
      "used": 10000001,
      "reset_at": "2024-02-01T00:00:00Z"
    }
  }
}
```

## Managing Quota

### Optimize Event Volume

1. **Batch Events**: Send multiple events per request
2. **Filter Events**: Only send important events
3. **Sample Events**: Sample non-critical events
4. **Cache Responses**: Reduce duplicate processing

### Upgrade Plan

Contact support to upgrade for higher quotas.

### Wait for Reset

Quota resets monthly. Check `quota_period_start` to see when.

## Related Documentation

- [Rate Limits](./rate-limits.md)
- [API Overview](../api/overview.md)
- [Troubleshooting Guide](../troubleshooting/common-issues.md)

---

**Need help?** Check the [Troubleshooting Guide](../troubleshooting/common-issues.md).

