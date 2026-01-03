# Common Issues and Solutions

Quick reference for common problems and their solutions.

## SDK Issues

### "Cannot find module 'observa-sdk'"

**Solution**: 
```bash
npm install observa-sdk
npm list observa-sdk  # Verify
```

### "Invalid API Key"

**Solutions**:
1. Verify API key format (should start with `eyJ`)
2. Check for extra spaces
3. Ensure key matches environment (dev vs prod)
4. Regenerate key from dashboard

### "Events Not Sending"

**Solutions**:
1. Ensure `endTrace()` is called
2. Check network requests in browser DevTools
3. Verify API URL is correct
4. Check API key is valid

---

## API Issues

### "401 Unauthorized"

**Solutions**:
1. Check Authorization header format: `Bearer <token>`
2. Verify token is valid and not expired
3. Ensure token matches environment

### "429 Rate Limit Exceeded"

**Solutions**:
1. Reduce request frequency
2. Implement exponential backoff
3. Check rate limit headers
4. Contact support for higher limits

### "Quota Exceeded"

**Solutions**:
1. Check current usage in dashboard
2. Upgrade plan for higher quota
3. Wait for monthly reset
4. Optimize event volume

---

## Data Issues

### "Traces Not Appearing"

**Solutions**:
1. Wait a few seconds for processing
2. Check time range filter
3. Verify project filter
4. Check API response for errors
5. Verify `endTrace()` was called

### "Dashboard Shows Zeros"

**Solutions**:
1. Check time range includes data
2. Verify correct project selected
3. Ensure data was ingested
4. Refresh dashboard

---

## Performance Issues

### "Slow Dashboard Loading"

**Solutions**:
1. Reduce time range
2. Filter by project
3. Clear browser cache
4. Check network connectivity

### "SDK Blocking Application"

**Solutions**:
1. Use async `endTrace()`
2. Batch events
3. Send in background
4. Check network speed

---

## Quick Diagnostic Checklist

- [ ] API key is set and valid
- [ ] SDK is installed correctly
- [ ] `endTrace()` is being called
- [ ] Network requests reaching API
- [ ] API returns 200 status
- [ ] Time range includes data
- [ ] Correct project selected
- [ ] No rate limit errors
- [ ] Quota not exceeded

---

## Getting Help

### Before Contacting Support

1. Check this troubleshooting guide
2. Review logs (application and API)
3. Reproduce issue with minimal example
4. Gather information:
   - Error messages
   - Request/response examples
   - SDK version
   - Timestamp

### Contact Support

- **GitHub Issues**: Report bugs
- **Email**: support@observa.ai
- **Documentation**: Check other guides

---

## Related Documentation

- [Error Codes](./error-codes.md)
- [Debugging Guide](./debugging.md)
- [SDK Installation](../sdk/installation.md)
- [API Overview](../api/overview.md)

---

**Still having issues?** Check the full [Troubleshooting Guide](../../TROUBLESHOOTING_GUIDE.md).

