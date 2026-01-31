# EzSign Load Testing

Load testing suite using [k6](https://k6.io/) for performance testing the EzSign API.

## Prerequisites

1. **Install k6**:
   ```bash
   # macOS
   brew install k6

   # Windows (Chocolatey)
   choco install k6

   # Windows (winget)
   winget install k6

   # Docker
   docker pull grafana/k6
   ```

2. **Ensure the backend is running**:
   ```bash
   cd backend
   npm run dev
   ```

3. **Create test user** (optional - tests will create one automatically):
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"loadtest@example.com","password":"LoadTest123!","name":"Load Test User"}'
   ```

## Quick Start

```bash
cd backend/load-tests

# Smoke test (verify system works)
k6 run scenarios/health.js

# Load test authentication
k6 run --env PROFILE=load scenarios/auth.js

# Stress test documents
k6 run --env PROFILE=stress scenarios/documents.js

# Mixed workload simulation
k6 run --env PROFILE=load scenarios/mixed-workload.js
```

## Test Scenarios

### `health.js` - Health Check Baseline
Basic health endpoint test to establish baseline latency.

```bash
k6 run --env PROFILE=smoke scenarios/health.js
k6 run --env PROFILE=load scenarios/health.js
```

### `auth.js` - Authentication Flow
Tests login, token refresh, and logout under load.

```bash
k6 run --env PROFILE=load scenarios/auth.js
```

### `documents.js` - Document Operations
Tests CRUD operations for documents, fields, and signers.

```bash
k6 run --env PROFILE=load scenarios/documents.js
```

### `signing.js` - Signing Flow
Tests the signing workflow with actual signing tokens.

```bash
# With a real signing token
k6 run --env PROFILE=load --env SIGN_TOKEN=<token> scenarios/signing.js

# Pattern testing (no actual signing)
k6 run --env PROFILE=load scenarios/signing.js
```

### `mixed-workload.js` - Realistic Simulation
Weighted mix of operations simulating real user behavior:
- 40% Document browsing
- 30% Document management
- 20% Signing operations
- 10% Authentication

```bash
k6 run --env PROFILE=load scenarios/mixed-workload.js
```

## Load Profiles

| Profile | Description | Duration | Users |
|---------|-------------|----------|-------|
| `smoke` | Verify system works | 30s | 1 |
| `load` | Normal expected load | ~9min | 10-20 |
| `stress` | Find breaking point | ~33min | 10-40 |
| `spike` | Sudden traffic surge | ~3min | 5-50 |
| `soak` | Extended duration (memory leaks) | ~34min | 10 |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | API base URL | `http://localhost:3001` |
| `PROFILE` | Load profile to use | `smoke` |
| `TEST_USER_EMAIL` | Test user email | `loadtest@example.com` |
| `TEST_USER_PASSWORD` | Test user password | `LoadTest123!` |
| `SIGN_TOKEN` | Signing token for signing tests | - |

## Running with Docker

```bash
# From backend/load-tests directory
docker run --rm -i --network host \
  -v $(pwd):/scripts \
  grafana/k6 run \
  --env BASE_URL=http://host.docker.internal:3001 \
  --env PROFILE=load \
  /scripts/scenarios/auth.js
```

## Output Formats

```bash
# Console output (default)
k6 run scenarios/health.js

# JSON output
k6 run --out json=results.json scenarios/health.js

# CSV output
k6 run --out csv=results.csv scenarios/health.js

# InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 scenarios/health.js
```

## Performance Baselines

Expected performance targets for a healthy system:

### Health Endpoint
| Metric | Target | Critical |
|--------|--------|----------|
| p95 response time | < 100ms | < 200ms |
| p99 response time | < 200ms | < 500ms |
| Error rate | < 1% | < 5% |

### Authentication
| Metric | Target | Critical |
|--------|--------|----------|
| Login p95 | < 500ms | < 1000ms |
| Token refresh p95 | < 300ms | < 500ms |
| Error rate | < 5% | < 10% |

### Document Operations
| Metric | Target | Critical |
|--------|--------|----------|
| List documents p95 | < 1000ms | < 2000ms |
| Create document p95 | < 2000ms | < 3000ms |
| Get document p95 | < 500ms | < 1000ms |
| Error rate | < 5% | < 10% |

### Signing Flow
| Metric | Target | Critical |
|--------|--------|----------|
| Get signing page p95 | < 1000ms | < 2000ms |
| Submit signature p95 | < 1500ms | < 3000ms |
| Complete signing p95 | < 2000ms | < 4000ms |
| Error rate | < 5% | < 10% |

## Interpreting Results

### Key Metrics

- **http_req_duration**: Total request time
  - `p(95)`: 95% of requests completed within this time
  - `p(99)`: 99% of requests completed within this time
  - `avg`: Average response time
  - `max`: Maximum response time

- **http_req_failed**: Percentage of failed requests (non-2xx responses)

- **http_reqs**: Request throughput (requests per second)

- **vus**: Number of virtual users active

- **iterations**: Total completed test iterations

### Example Output

```
     ✓ login status is 200
     ✓ login returns tokens
     ✓ login time < 500ms

     checks.........................: 100.00% ✓ 300      ✗ 0
     data_received..................: 1.2 MB  12 kB/s
     data_sent......................: 234 kB  2.3 kB/s
     http_req_duration..............: avg=45ms min=12ms med=38ms max=312ms p(90)=89ms p(95)=124ms
     http_req_failed................: 0.00%   ✓ 0        ✗ 150
     http_reqs......................: 150     1.5/s
     iteration_duration.............: avg=2.1s min=1.2s med=2.0s max=4.5s p(90)=3.2s p(95)=3.8s
     iterations.....................: 50      0.5/s
     login_duration.................: avg=42ms min=11ms med=35ms max=298ms p(90)=82ms p(95)=118ms
     login_failures.................: 0.00%   ✓ 0        ✗ 50
     vus............................: 10      min=1      max=10
     vus_max........................: 10      min=10     max=10
```

## Troubleshooting

### Common Issues

1. **Connection refused**: Ensure the backend is running on the correct port
   ```bash
   curl http://localhost:3001/health
   ```

2. **Authentication failures**: Verify test user exists and credentials are correct
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"loadtest@example.com","password":"LoadTest123!"}'
   ```

3. **Rate limiting**: Tests may trigger rate limits; adjust think times or rate limit settings

4. **Memory issues**: For stress/soak tests, monitor backend memory usage

### Debug Mode

```bash
# Verbose output
k6 run --verbose scenarios/auth.js

# HTTP debug
k6 run --http-debug scenarios/auth.js
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Run Load Tests
  run: |
    docker run --rm --network host \
      -v ${{ github.workspace }}/backend/load-tests:/scripts \
      grafana/k6 run \
      --env BASE_URL=http://localhost:3001 \
      --env PROFILE=smoke \
      /scripts/scenarios/health.js
```

## Further Reading

- [k6 Documentation](https://k6.io/docs/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [k6 Metrics](https://k6.io/docs/using-k6/metrics/)
- [k6 Options](https://k6.io/docs/using-k6/k6-options/reference/)
