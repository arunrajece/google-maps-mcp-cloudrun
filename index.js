import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/http.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleMapsService } from './google-maps.js';
import http from 'http';

// Environment configuration for Cloud Run
const PORT = parseInt(process.env.PORT) || 8080;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('❌ GOOGLE_MAPS_API_KEY environment variable is required');
  process.exit(1);
}

// Simple rate limiting for public access
const requestCounts = new Map();
const RATE_LIMIT = 50; // requests per hour per IP
const WINDOW = 60 * 60 * 1000; // 1 hour window

function checkRateLimit(ip) {
  const now = Date.now();
  const count = requestCounts.get(ip) || { count: 0, window: now };
  
  if (now - count.window > WINDOW) {
    count.count = 1;
    count.window = now;
  } else {
    count.count++;
  }
  
  requestCounts.set(ip, count);
  return count.count <= RATE_LIMIT;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, count] of requestCounts.entries()) {
    if (now - count.window > WINDOW) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

// Initialize Google Maps service
const googleMaps = new GoogleMapsService(GOOGLE_MAPS_API_KEY);

// Create MCP server following Google's patterns
const server = new Server(
  {
    name: 'google-maps-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define MCP tools optimized for Claude
const tools = [
  {
    name: 'calculate_route',
    description: 'Calculate optimal driving route with real-time traffic from Google Maps. Returns detailed route information including distance, duration, traffic delays, and turn-by-turn directions.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { 
          type: 'string', 
          description: 'Starting location (address, place name, or coordinates like "40.7589,-73.9851")' 
        },
        destination: { 
          type: 'string', 
          description: 'Destination location (address, place name, or coordinates)' 
        },
        waypoints: { 
          type: 'array', 
          items: { type: 'string' }, 
          description: 'Optional intermediate stops along the route',
          maxItems: 8
        },
        options: {
          type: 'object',
          properties: {
            avoidTolls: { type: 'boolean', default: false, description: 'Avoid toll roads' },
            avoidHighways: { type: 'boolean', default: false, description: 'Avoid highways/freeways' },
            departureTime: { type: 'string', description: 'ISO datetime or "now" for traffic prediction' },
            trafficModel: { 
              type: 'string', 
              enum: ['best_guess', 'pessimistic', 'optimistic'],
              default: 'best_guess',
              description: 'Traffic prediction model'
            }
          }
        }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'compare_routes',
    description: 'Compare multiple route alternatives with different routing options (tolls, highways, traffic models) to find the best option.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination location' },
        waypoints: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Optional waypoints for all route comparisons'
        },
        compareOptions: {
          type: 'array',
          description: 'Array of different routing options to compare',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Human-readable name for this route option' },
              avoidTolls: { type: 'boolean' },
              avoidHighways: { type: 'boolean' },
              trafficModel: { type: 'string', enum: ['best_guess', 'pessimistic', 'optimistic'] }
            }
          }
        }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'get_live_traffic',
    description: 'Get current traffic conditions and travel time analysis for a specific route. Includes traffic delays and conditions.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination location' },
        departureTime: { 
          type: 'string', 
          default: 'now',
          description: 'Departure time for traffic analysis ("now" or ISO 8601 format)' 
        }
      },
      required: ['origin', 'destination']
    }
  },
  {
    name: 'estimate_costs',
    description: 'Calculate comprehensive trip costs including fuel, tolls, and total expenses based on vehicle specifications.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting location' },
        destination: { type: 'string', description: 'Destination location' },
        vehicleOptions: {
          type: 'object',
          description: 'Vehicle specifications for cost calculation',
          properties: {
            fuelEfficiency: { 
              type: 'number', 
              description: 'Vehicle fuel consumption in liters per 100km (e.g., 8.0)',
              minimum: 3.0,
              maximum: 25.0,
              default: 8.0
            },
            fuelPrice: { 
              type: 'number', 
              description: 'Current fuel price per liter in USD (e.g., 1.50)',
              minimum: 0.50,
              maximum: 5.00,
              default: 1.50
            }
          }
        }
      },
      required: ['origin', 'destination']
    }
  }
];

// Helper function to get client IP
function getClientIP(extra) {
  return extra?.req?.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         extra?.req?.connection?.remoteAddress || 
         extra?.req?.socket?.remoteAddress ||
         'unknown';
}

// Tool handlers with rate limiting and usage logging
server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
  const clientIP = getClientIP(extra);
  
  if (!checkRateLimit(clientIP)) {
    console.log(`🚫 Rate limit exceeded for IP: ${clientIP}`);
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  console.log(`📋 Tools list requested from IP: ${clientIP}`);
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args } = request.params;
  const clientIP = getClientIP(extra);
  
  if (!checkRateLimit(clientIP)) {
    console.log(`🚫 Rate limit exceeded for IP: ${clientIP}`);
    throw new Error('Rate limit exceeded. Please try again later.');
  }
  
  console.log(`🔧 Executing tool: ${name} from IP: ${clientIP}`);
  
  try {
    let result;
    switch (name) {
      case 'calculate_route':
        result = await handleCalculateRoute(args);
        break;
      case 'compare_routes':
        result = await handleCompareRoutes(args);
        break;
      case 'get_live_traffic':
        result = await handleGetLiveTraffic(args);
        break;
      case 'estimate_costs':
        result = await handleEstimateCosts(args);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    
    console.log(`✅ Tool ${name} completed for IP: ${clientIP}`);
    return result;
    
  } catch (error) {
    console.error(`❌ Tool ${name} failed for IP ${clientIP}:`, error.message);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Enhanced tool implementation functions
async function handleCalculateRoute(args) {
  const { origin, destination, waypoints = [], options = {} } = args;
  
  // Input validation
  if (!origin?.trim() || !destination?.trim()) {
    throw new Error('Origin and destination are required and cannot be empty');
  }

  console.log(`🗺️ Calculating route: ${origin} → ${destination}`);
  
  const route = await googleMaps.calculateRoute({
    origin: origin.trim(),
    destination: destination.trim(),
    waypoints: waypoints.map(w => w.trim()).filter(w => w),
    ...options
  });

  const result = {
    success: true,
    route: {
      summary: route.summary,
      distance: {
        meters: route.distance,
        kilometers: (route.distance / 1000).toFixed(1),
        text: `${(route.distance / 1000).toFixed(1)} km`
      },
      duration: {
        seconds: route.duration,
        text: formatDuration(route.duration)
      },
      durationInTraffic: {
        seconds: route.durationInTraffic,
        text: formatDuration(route.durationInTraffic)
      },
      trafficDelay: {
        seconds: route.durationInTraffic - route.duration,
        text: formatDuration(route.durationInTraffic - route.duration)
      },
      steps: route.steps?.slice(0, 8), // Limit for readability
      warnings: route.warnings,
      polyline: route.polyline
    },
    metadata: {
      timestamp: new Date().toISOString(),
      trafficModel: options.trafficModel || 'best_guess',
      requestedWaypoints: waypoints.length
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleCompareRoutes(args) {
  const { origin, destination, waypoints = [], compareOptions = [] } = args;
  
  console.log(`🔄 Comparing routes: ${origin} → ${destination}`);
  
  const routePromises = [];
  const routeLabels = [];
  
  // Default route
  routePromises.push(googleMaps.calculateRoute({
    origin,
    destination,
    waypoints,
    alternatives: true
  }));
  routeLabels.push('Default Route');
  
  // Custom option routes
  for (const [index, option] of compareOptions.entries()) {
    routePromises.push(googleMaps.calculateRoute({
      origin,
      destination,
      waypoints,
      ...option
    }));
    routeLabels.push(option.name || `Option ${index + 1}`);
  }
  
  const routes = await Promise.all(routePromises);
  
  const comparison = {
    routes: routes.map((route, index) => ({
      id: index,
      label: routeLabels[index],
      summary: route.summary,
      distance: {
        meters: route.distance,
        text: `${(route.distance / 1000).toFixed(1)} km`
      },
      duration: {
        seconds: route.duration,
        text: formatDuration(route.duration)
      },
      durationInTraffic: {
        seconds: route.durationInTraffic,
        text: formatDuration(route.durationInTraffic)
      },
      trafficDelay: {
        seconds: route.durationInTraffic - route.duration,
        text: formatDuration(route.durationInTraffic - route.duration)
      },
      options: index === 0 ? 'default' : compareOptions[index - 1]
    })),
    recommendation: findBestRoute(routes, routeLabels),
    summary: {
      fastestRoute: findFastestRoute(routes, routeLabels),
      shortestRoute: findShortestRoute(routes, routeLabels),
      totalRoutesCompared: routes.length
    }
  };
  
  const result = {
    success: true,
    comparison,
    metadata: {
      timestamp: new Date().toISOString(),
      routesCompared: routes.length,
      origin,
      destination
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleGetLiveTraffic(args) {
  const { origin, destination, departureTime = 'now' } = args;
  
  console.log(`🚦 Getting traffic info: ${origin} → ${destination} at ${departureTime}`);
  
  const trafficData = await googleMaps.getTrafficInfo({
    origin,
    destination,
    departureTime
  });
  
  const trafficDelay = trafficData.durationInTraffic - trafficData.duration;
  
  const result = {
    success: true,
    traffic: {
      currentDuration: {
        seconds: trafficData.duration,
        text: formatDuration(trafficData.duration)
      },
      durationInTraffic: {
        seconds: trafficData.durationInTraffic,
        text: formatDuration(trafficData.durationInTraffic)
      },
      trafficDelay: {
        seconds: trafficDelay,
        text: formatDuration(trafficDelay)
      },
      trafficCondition: getTrafficCondition(trafficData),
      route: {
        summary: trafficData.route?.summary || trafficData.summary,
        distance: `${(trafficData.distance / 1000).toFixed(1)} km`
      }
    },
    metadata: {
      timestamp: new Date().toISOString(),
      departureTime,
      origin,
      destination
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

async function handleEstimateCosts(args) {
  const { origin, destination, vehicleOptions = {} } = args;
  
  console.log(`💰 Estimating costs for route: ${origin} → ${destination}`);
  
  const route = await googleMaps.calculateRoute({ origin, destination });
  
  const fuelEfficiency = vehicleOptions.fuelEfficiency || 8.0; // L/100km
  const fuelPrice = vehicleOptions.fuelPrice || 1.50; // per liter
  
  const distanceKm = route.distance / 1000;
  const fuelNeeded = (distanceKm / 100) * fuelEfficiency;
  const fuelCost = fuelNeeded * fuelPrice;
  const tollCost = distanceKm * 0.05; // Rough estimate
  
  const result = {
    success: true,
    costs: {
      fuel: {
        amount: Math.round(fuelCost * 100) / 100,
        currency: 'USD',
        text: `$${(Math.round(fuelCost * 100) / 100).toFixed(2)}`
      },
      tolls: {
        amount: Math.round(tollCost * 100) / 100,
        currency: 'USD',
        text: `$${(Math.round(tollCost * 100) / 100).toFixed(2)}`,
        note: 'Estimated based on $0.05/km'
      },
      total: {
        amount: Math.round((fuelCost + tollCost) * 100) / 100,
        currency: 'USD',
        text: `$${(Math.round((fuelCost + tollCost) * 100) / 100).toFixed(2)}`
      },
      breakdown: {
        distance: `${distanceKm.toFixed(1)} km`,
        fuelNeeded: `${fuelNeeded.toFixed(1)} L`,
        fuelEfficiency: `${fuelEfficiency} L/100km`,
        fuelPrice: `$${fuelPrice}/L`
      }
    },
    route: {
      distance: `${distanceKm.toFixed(1)} km`,
      duration: formatDuration(route.duration),
      summary: route.summary
    },
    metadata: {
      timestamp: new Date().toISOString(),
      assumptions: {
        fuelEfficiency: `${fuelEfficiency} L/100km`,
        fuelPrice: `$${fuelPrice} per liter`,
        tollEstimate: 'Estimated at $0.05 per kilometer'
      }
    }
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

// Utility functions
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getTrafficCondition(trafficData) {
  const delay = trafficData.durationInTraffic - trafficData.duration;
  const ratio = delay / trafficData.duration;
  
  if (ratio < 0.1) return 'light';
  if (ratio < 0.3) return 'moderate';
  if (ratio < 0.5) return 'heavy';
  return 'severe';
}

function findBestRoute(routes, labels) {
  const fastest = routes.reduce((best, current, index) => 
    current.durationInTraffic < best.route.durationInTraffic ? 
    { route: current, index, label: labels[index] } : best
  , { route: routes[0], index: 0, label: labels[0] });
  
  return {
    recommended: fastest,
    reason: 'Fastest travel time considering current traffic conditions',
    timeSaved: routes[0].durationInTraffic - fastest.route.durationInTraffic
  };
}

function findFastestRoute(routes, labels) {
  const fastest = routes.reduce((best, current, index) => 
    current.durationInTraffic < best.route.durationInTraffic ? 
    { route: current, index, label: labels[index] } : best
  , { route: routes[0], index: 0, label: labels[0] });
  
  return {
    label: fastest.label,
    duration: formatDuration(fastest.route.durationInTraffic)
  };
}

function findShortestRoute(routes, labels) {
  const shortest = routes.reduce((best, current, index) => 
    current.distance < best.route.distance ? 
    { route: current, index, label: labels[index] } : best
  , { route: routes[0], index: 0, label: labels[0] });
  
  return {
    label: shortest.label,
    distance: `${(shortest.route.distance / 1000).toFixed(1)} km`
  };
}

// Create HTTP server with Google's recommended /sse endpoint
const httpServer = http.createServer();

// Create streamable HTTP transport on /sse endpoint (Google's pattern)
const transport = new StreamableHTTPServerTransport(httpServer, '/sse');

// Health check endpoint for Cloud Run with usage stats
httpServer.on('request', (req, res) => {
  // Set CORS headers for web access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy',
      service: 'google-maps-mcp',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      access: 'public',
      endpoint: '/sse',
      activeConnections: requestCounts.size,
      totalRequests: Array.from(requestCounts.values()).reduce((sum, count) => sum + count.count, 0)
    }));
    return;
  }
  
  // Usage statistics endpoint
  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      activeIPs: requestCounts.size,
      totalRequests: Array.from(requestCounts.values()).reduce((sum, count) => sum + count.count, 0),
      rateLimitWindow: `${RATE_LIMIT} requests per hour`,
      timestamp: new Date().toISOString(),
      service: 'google-maps-mcp',
      version: '1.0.0'
    }));
    return;
  }
  
  // Handle other requests (MCP transport handles /sse)
  if (!req.url.startsWith('/sse')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start server following Google Cloud Run patterns
async function main() {
  console.log('🚀 Starting Google Maps MCP Server (Public Access)...');
  
  try {
    await server.connect(transport);
    
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📍 MCP endpoint: /sse`);
      console.log(`🏥 Health check: / and /health`);
      console.log(`📊 Usage stats: /stats`);
      console.log(`🔓 Public access enabled (no authentication required)`);
      console.log(`🛡️ Rate limiting: ${RATE_LIMIT} requests per hour per IP`);
      console.log('🌍 Ready for Claude Desktop connections!');
      console.log('');
      console.log('📋 Friends should use this config:');
      console.log('   "command": "npx",');
      console.log('   "args": ["-y", "mcp-remote", "https://YOUR-SERVICE-URL/sse"]');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown for Cloud Run
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

main().catch((error) => {
  console.error('💥 Startup error:', error);
  process.exit(1);
});