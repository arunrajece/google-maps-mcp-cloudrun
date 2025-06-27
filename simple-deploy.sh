#!/bin/bash
set -e

PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"us-central1"}

echo "🚀 Deploying Simple Access Google Maps MCP Server..."
echo "📋 Project: $PROJECT_ID"
echo "📍 Region: $REGION"

if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
    echo "❌ Please set GOOGLE_MAPS_API_KEY environment variable"
    echo "   export GOOGLE_MAPS_API_KEY='your-api-key-here'"
    exit 1
fi

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run: gcloud auth login"
    exit 1
fi

# Setup project
echo "🔧 Setting up Google Cloud project..."
gcloud config set project $PROJECT_ID

echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

echo "📦 Deploying with PUBLIC ACCESS (no authentication required)..."

# Deploy with public access - no authentication required
gcloud run deploy google-maps-mcp \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_MAPS_API_KEY="$GOOGLE_MAPS_API_KEY" \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 300 \
  --port 8080

SERVICE_URL=$(gcloud run services describe google-maps-mcp \
  --region $REGION \
  --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Public MCP Server: $SERVICE_URL/sse"
echo "📊 Usage Stats: $SERVICE_URL/stats"
echo "🏥 Health Check: $SERVICE_URL/health"
echo ""
echo "🧪 Test your deployment:"
echo "curl \"$SERVICE_URL/health\""
echo ""
echo "📋 Share this Claude Desktop config with friends:"
echo "{"
echo "  \"mcpServers\": {"
echo "    \"google-maps\": {"
echo "      \"command\": \"npx\","
echo "      \"args\": ["
echo "        \"-y\","
echo "        \"mcp-remote\","
echo "        \"$SERVICE_URL/sse\""
echo "      ]"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "🔍 Monitor usage: https://console.cloud.google.com/run/detail/$REGION/google-maps-mcp"
echo "💰 Monitor costs: https://console.cloud.google.com/billing"
echo ""
echo "🛡️ Security: Rate limited to 50 requests/hour per IP"
echo "📈 Stats available at: $SERVICE_URL/stats"
