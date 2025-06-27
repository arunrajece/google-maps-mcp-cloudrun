// Local testing script for development
import http from 'http';

const SERVICE_URL = process.env.SERVICE_URL || 'http://localhost:8080';

async function testEndpoint(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVICE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Google Maps MCP Server...\n');

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await testEndpoint('/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response: ${JSON.stringify(health.data, null, 2)}\n`);

    // Test stats endpoint
    console.log('2. Testing stats endpoint...');
    const stats = await testEndpoint('/stats');
    console.log(`   Status: ${stats.status}`);
    console.log(`   Response: ${JSON.stringify(stats.data, null, 2)}\n`);

    // Test MCP tools list
    console.log('3. Testing MCP tools list...');
    const toolsList = await testEndpoint('/sse', 'POST', {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 1
    });
    console.log(`   Status: ${toolsList.status}`);
    console.log(`   Tools: ${toolsList.data.result?.tools?.length || 0} available\n`);

    // Test route calculation
    console.log('4. Testing route calculation...');
    const routeTest = await testEndpoint('/sse', 'POST', {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'calculate_route',
        arguments: {
          origin: 'New York, NY',
          destination: 'Boston, MA'
        }
      },
      id: 2
    });
    console.log(`   Status: ${routeTest.status}`);
    console.log(`   Result: ${routeTest.data.result ? 'Success' : 'Failed'}\n`);

    console.log('✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

if (process.argv[1].endsWith('test-local.js')) {
  runTests();
}