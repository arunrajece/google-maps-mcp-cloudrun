# Google Maps MCP Server for Cloud Run

A Google Maps Model Context Protocol (MCP) server designed for deployment on Google Cloud Run with public access. This server provides Google Maps functionality to Claude Desktop clients through a secure, rate-limited API.

## Features

- **Route Calculation**: Optimal driving routes with real-time traffic data
- **Route Comparison**: Compare multiple routing alternatives with different options
- **Live Traffic**: Current traffic conditions and travel time analysis
- **Cost Estimation**: Trip cost calculations including fuel and toll estimates
- **Public Access**: No authentication required for easy sharing
- **Rate Limiting**: 50 requests per hour per IP address
- **Cloud Run Optimized**: Designed for serverless deployment on GCP

## Prerequisites

- Google Cloud Platform account with billing enabled
- Google Cloud CLI (`gcloud`) installed and configured
- Node.js 18+ for local development
- Google Maps API key with required APIs enabled

## Required Google Maps APIs

Before deployment, enable these APIs in your GCP project:

1. **Directions API** - For route calculations
2. **Geocoding API** - For address resolution
3. **Maps JavaScript API** - For polyline encoding (optional)

Enable APIs via [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/api-list) or CLI:

```bash
gcloud services enable directions-backend.googleapis.com
gcloud services enable geocoding-backend.googleapis.com
gcloud services enable maps-backend.googleapis.com
```

## Quick Start

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console > Credentials](https://console.cloud.google.com/google/maps-apis/credentials)
2. Create a new API key or use an existing one
3. Restrict the key to the required APIs listed above
4. Note your API key for deployment

### 2. Deploy to Cloud Run

```bash
# Clone the repository
git clone <your-repo-url>
cd google-maps-mcp-cloudrun

# Set your Google Maps API key
export GOOGLE_MAPS_API_KEY="your-api-key-here"

# Deploy using the provided script
./simple-deploy.sh your-gcp-project-id us-central1
```

### 3. Extract Service URL

After deployment, extract your service URL:

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe google-maps-mcp \
  --region us-central1 \
  --format="value(status.url)")

echo "Your MCP Server URL: $SERVICE_URL/sse"
```

## Manual Deployment

If you prefer manual deployment:

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required services
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Deploy
gcloud run deploy google-maps-mcp \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_MAPS_API_KEY="your-api-key-here" \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 300 \
  --port 8080
```

## Claude Desktop Configuration

Add this configuration to your Claude Desktop settings:

```json
{
  "mcpServers": {
    "google-maps": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://YOUR-SERVICE-URL.run.app/sse"
      ]
    }
  }
}
```

Replace `YOUR-SERVICE-URL.run.app` with your actual Cloud Run service URL.

### Finding Your Claude Desktop Config

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

## Available Tools

The MCP server provides these tools to Claude:

1. **calculate_route** - Calculate optimal driving routes with traffic
2. **compare_routes** - Compare multiple route alternatives
3. **get_live_traffic** - Get current traffic conditions
4. **estimate_costs** - Calculate trip costs (fuel + tolls)

## Service Endpoints

- **MCP Endpoint**: `https://your-service.run.app/sse`
- **Health Check**: `https://your-service.run.app/health`
- **Usage Stats**: `https://your-service.run.app/stats`

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API key
# GOOGLE_MAPS_API_KEY=your-api-key-here

# Start development server
npm run dev

# Test locally
npm test
```

## Troubleshooting

### Common Deployment Issues

#### 1. Permission Denied
```bash
# Error: Permission denied
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

#### 2. API Not Enabled
```bash
# Error: API not enabled
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

#### 3. Billing Not Enabled
- Visit [GCP Billing Console](https://console.cloud.google.com/billing)
- Enable billing for your project

#### 4. Invalid API Key
```bash
# Check API key restrictions in Console
# Ensure Directions API and Geocoding API are enabled
```

#### 5. Service Won't Start
```bash
# Check logs for errors
gcloud run services logs read google-maps-mcp --region us-central1 --limit 50
```

### Common Runtime Issues

#### Rate Limiting
- Each IP is limited to 50 requests per hour
- Check `/stats` endpoint for current usage
- Consider implementing user authentication for higher limits

#### API Quota Exceeded
- Monitor your Google Maps API usage in [GCP Console](https://console.cloud.google.com/google/maps-apis/quotas)
- Increase quotas if needed
- Consider implementing caching for repeated requests

### Testing Your Deployment

```bash
# Test health endpoint
curl "https://your-service.run.app/health"

# Test stats endpoint
curl "https://your-service.run.app/stats"

# Test with Claude Desktop
# Add the configuration and try asking Claude to calculate a route
```

## Security Considerations

- API key is stored as environment variable (secure)
- Service allows public access (no authentication required)
- Rate limiting prevents abuse (50 requests/hour per IP)
- No sensitive data is logged or stored

## Cost Management

- **Cloud Run**: Pay-per-request pricing
- **Google Maps API**: Pay-per-API-call pricing
- **Monitoring**: Use GCP billing alerts to track costs

Set up billing alerts:
```bash
# Set up billing budget alerts in GCP Console
# Billing > Budgets & Alerts
```

## Documentation Links

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Claude Desktop MCP Configuration](https://claude.ai/mcp)

## Support and Troubleshooting Resources

- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting)
- [Google Maps API Troubleshooting](https://developers.google.com/maps/support)
- [GCP Support](https://cloud.google.com/support)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Note**: This server is designed for development and testing purposes. For production use with high traffic, consider implementing additional security measures and monitoring.