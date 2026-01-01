# Load Simulation Script

A comprehensive, battle-tested load simulation script for testing the Observa API with realistic heavy logging scenarios.

## Features

- **Multiple Users**: Simulates multiple concurrent users with unique IDs
- **Realistic Conversations**: Multiple conversation templates (Customer Support, Technical Support, Product Inquiry, E-commerce)
- **Multi-turn Conversations**: Realistic conversation flows with 5-10 messages per conversation
- **Error Scenarios**: Includes realistic error rates (rate limits, server errors)
- **Hallucination Detection**: Simulates hallucination scenarios for testing detection
- **Concurrent Load**: Configurable concurrency for realistic load patterns
- **Progress Tracking**: Real-time statistics and progress reporting
- **Comprehensive Reporting**: Detailed statistics after simulation completes

## Quick Start

```bash
# Basic usage
JWT_TOKEN=your_token node scripts/load-simulation.js

# Or pass token as argument
node scripts/load-simulation.js your_jwt_token
```

## Configuration

Configure the simulation using environment variables:

### Basic Configuration

- `JWT_TOKEN` (required): Your API authentication token
- `API_URL` (default: `http://localhost:3000`): API base URL

### Load Configuration

- `NUM_USERS` (default: `10`): Number of concurrent users to simulate
- `CONVERSATIONS_PER_USER` (default: `3`): Number of conversations per user
- `MIN_MESSAGES` (default: `5`): Minimum messages per conversation
- `MAX_MESSAGES` (default: `10`): Maximum messages per conversation
- `RATE_LIMIT_MS` (default: `100`): Delay between requests in milliseconds
- `CONCURRENT_REQUESTS` (default: `5`): Number of concurrent user simulations

### Feature Flags

- `ENABLE_ERRORS` (default: `true`): Include error scenarios (rate limits, server errors)
- `ENABLE_HALLUCINATIONS` (default: `true`): Include hallucination scenarios

## Examples

### Light Load Testing
```bash
NUM_USERS=5 CONVERSATIONS_PER_USER=2 MIN_MESSAGES=3 MAX_MESSAGES=5 \
  JWT_TOKEN=your_token node scripts/load-simulation.js
```

### Heavy Load Testing
```bash
NUM_USERS=50 CONVERSATIONS_PER_USER=10 MIN_MESSAGES=10 MAX_MESSAGES=20 \
  RATE_LIMIT_MS=50 CONCURRENT_REQUESTS=10 \
  JWT_TOKEN=your_token node scripts/load-simulation.js
```

### Production Testing
```bash
API_URL=https://observa-api.vercel.app \
  NUM_USERS=20 CONVERSATIONS_PER_USER=5 \
  JWT_TOKEN=your_production_token \
  node scripts/load-simulation.js
```

### Testing Without Errors/Hallucinations
```bash
ENABLE_ERRORS=false ENABLE_HALLUCINATIONS=false \
  JWT_TOKEN=your_token node scripts/load-simulation.js
```

## Output

The script provides:

1. **Configuration Summary**: Shows all configuration settings before starting
2. **Progress Updates**: Real-time progress with statistics:
   - Users completed
   - Total traces sent
   - Success/error counts
   - Traces per second
   - Success rate percentage
3. **Final Statistics**:
   - Total traces sent
   - Success/error counts and percentages
   - Unique conversations created
   - Unique users simulated
   - Total time and average rate
   - Error breakdown by type

## Conversation Templates

The script includes 4 realistic conversation templates:

1. **Customer Support**: Order inquiries, shipping, refunds
2. **Technical Support**: Password resets, API integration, error troubleshooting
3. **Product Inquiry**: Feature questions, pricing, trials
4. **E-commerce**: Inventory, sizing, recommendations, returns

Each template includes:
- Realistic queries
- Context snippets
- Appropriate responses
- Variable message counts

## Models Simulated

The script simulates various LLM models with realistic token usage:
- `gpt-4o-mini`: ~150 prompt tokens, ~80 completion tokens
- `gpt-4o`: ~300 prompt tokens, ~200 completion tokens
- `gpt-4-turbo`: ~400 prompt tokens, ~300 completion tokens
- `claude-3-opus`: ~350 prompt tokens, ~250 completion tokens
- `claude-3-sonnet`: ~250 prompt tokens, ~150 completion tokens

## Error Scenarios

When `ENABLE_ERRORS=true`, the script includes realistic error rates:
- **Rate Limit (429)**: 2% probability
- **Internal Server Error (500)**: 1% probability
- **Service Unavailable (503)**: 0.5% probability

## Hallucination Scenarios

When `ENABLE_HALLUCINATIONS=true`, the script includes realistic hallucination patterns:
- Order status hallucinations: 3% probability on order-related queries
- Pricing hallucinations: 2% probability on price-related queries
- Shipping hallucinations: 2.5% probability on shipping-related queries

## Best Practices

1. **Start Small**: Begin with default settings and increase gradually
2. **Monitor Performance**: Watch API logs and database performance
3. **Test Incrementally**: Test with small loads before heavy load testing
4. **Use Appropriate Rate Limits**: Adjust `RATE_LIMIT_MS` based on your API's capacity
5. **Production Testing**: Use lower concurrency and higher rate limits for production

## Troubleshooting

### Authentication Errors
- Verify your JWT token is valid and not expired
- Check that the token includes tenantId and projectId
- Ensure the token has the correct permissions

### Rate Limiting
- Increase `RATE_LIMIT_MS` to reduce request rate
- Decrease `CONCURRENT_REQUESTS` to reduce parallel load
- Check API rate limit configuration

### Connection Errors
- Verify `API_URL` is correct and accessible
- Check network connectivity
- Ensure the API server is running

### Validation Errors
- Check that all required fields are included
- Verify data types match the schema
- Review API logs for specific validation errors

## Performance Considerations

- **Database Load**: Heavy simulations generate significant database writes
- **API Capacity**: Monitor API server resources (CPU, memory, connections)
- **Network Bandwidth**: Large simulations require good network connectivity
- **Rate Limits**: Respect API rate limits to avoid throttling

## Comparison with Other Test Scripts

| Feature | load-simulation.js | test-trace.js | test-waterfall.js |
|---------|-------------------|---------------|-------------------|
| Multiple Users | ✅ Yes | ❌ No | ❌ No |
| Multiple Conversations | ✅ Yes | ❌ No | ❌ No |
| Multi-turn Conversations | ✅ Yes | ❌ No | ❌ No |
| Realistic Data | ✅ Yes | ⚠️ Basic | ⚠️ Basic |
| Error Scenarios | ✅ Yes | ❌ No | ❌ No |
| Progress Tracking | ✅ Yes | ❌ No | ❌ No |
| Configurable Load | ✅ Yes | ❌ No | ❌ No |
| Statistics | ✅ Comprehensive | ⚠️ Basic | ⚠️ Basic |

## Next Steps

After running the simulation:

1. **View Traces**: Check the dashboard for ingested traces
2. **View Conversations**: Review conversation flows in the conversations page
3. **Check Analytics**: Review analytics and metrics
4. **Monitor Issues**: Check for detected hallucinations and errors
5. **Review Performance**: Check API and database performance metrics

