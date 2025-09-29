// Import the WebSocket library
import WebSocket from 'ws';

// Replace this with your actual Polygon.io API key
const API_KEY = 'R6reVCRquYldATUFUFNQnzc35F_AKwY3';

console.log('🚀 Testing delayed endpoint and current option contracts...');
console.log('🕐 Current time:', new Date().toLocaleString());

// Try the delayed endpoint first (should have more data)
const delayedUrl = 'wss://delayed.polygon.io/options';
const realtimeUrl = 'wss://socket.polygon.io/options';

// Current option contracts (closer to current date)
const currentDate = new Date();
const currentYear = currentDate.getFullYear();
const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
const currentDay = String(currentDate.getDate()).padStart(2, '0');

// Generate current option contracts
const currentContracts = [
  // SPY options for current month
  `SPY${currentYear}${currentMonth}${currentDay}C00550000`, // SPY Call $550
  `SPY${currentYear}${currentMonth}${currentDay}P00550000`, // SPY Put $550
  `SPY${currentYear}${currentMonth}${currentDay}C00540000`, // SPY Call $540
  `SPY${currentYear}${currentMonth}${currentDay}P00540000`, // SPY Put $540

  // AAPL options for current month
  `AAPL${currentYear}${currentMonth}${currentDay}C00150000`, // AAPL Call $150
  `AAPL${currentYear}${currentMonth}${currentDay}P00150000`, // AAPL Put $150
  `AAPL${currentYear}${currentMonth}${currentDay}C00160000`, // AAPL Call $160
  `AAPL${currentYear}${currentMonth}${currentDay}P00160000`, // AAPL Put $160

  // TSLA options for current month
  `TSLA${currentYear}${currentMonth}${currentDay}C00250000`, // TSLA Call $250
  `TSLA${currentYear}${currentMonth}${currentDay}P00250000`, // TSLA Put $250
  `TSLA${currentYear}${currentMonth}${currentDay}C00240000`, // TSLA Call $240
  `TSLA${currentYear}${currentMonth}${currentDay}P00240000`, // TSLA Put $240
];

console.log('📅 Generated contracts for:', `${currentYear}-${currentMonth}-${currentDay}`);
console.log('🔍 Testing contracts:', currentContracts.slice(0, 4));

function testEndpoint(url, endpointName) {
  return new Promise(resolve => {
    console.log(`\n🌐 Testing ${endpointName}: ${url}`);

    const socket = new WebSocket(url);
    let isAuthenticated = false;
    let messageCount = 0;
    let tradeCount = 0;
    let subscriptionCount = 0;
    const receivedTrades = new Set();

    socket.on('open', () => {
      console.log(`✅ ${endpointName} connection established.`);
      socket.send(JSON.stringify({ action: 'auth', params: API_KEY }));
    });

    socket.on('message', data => {
      messageCount++;
      const messages = JSON.parse(data.toString());

      for (const msg of messages) {
        if (msg.ev === 'status') {
          console.log(`📊 ${endpointName} Status: ${msg.status} - ${msg.message}`);

          if (msg.status === 'auth_success' && !isAuthenticated) {
            isAuthenticated = true;
            console.log(`🔐 ${endpointName} Authentication successful!`);

            // Subscribe to wildcards first
            const wildcards = ['SPY*', 'AAPL*', 'TSLA*'];
            wildcards.forEach((symbol, index) => {
              setTimeout(() => {
                socket.send(JSON.stringify({ action: 'subscribe', params: symbol }));
                subscriptionCount++;
                console.log(`📡 ${endpointName} [${subscriptionCount}] Wildcard: ${symbol}`);
              }, index * 200);
            });

            // Then subscribe to specific contracts
            currentContracts.slice(0, 6).forEach((contract, index) => {
              setTimeout(() => {
                socket.send(JSON.stringify({ action: 'subscribe', params: contract }));
                subscriptionCount++;
                console.log(`📡 ${endpointName} [${subscriptionCount}] Contract: ${contract}`);
              }, (index + 3) * 200);
            });
          }
        } else if (msg.ev === 'T') {
          tradeCount++;
          const tradeKey = `${msg.sym}_${msg.t}_${msg.p}_${msg.s}`;

          if (!receivedTrades.has(tradeKey)) {
            receivedTrades.add(tradeKey);
            console.log(`🎯 ${endpointName} TRADE #${tradeCount}:`);
            console.log(`   Symbol: ${msg.sym}`);
            console.log(`   Price: $${msg.p}`);
            console.log(`   Size: ${msg.s} contracts`);
            console.log(`   Time: ${new Date(msg.t).toLocaleString()}`);
            console.log('   ------------------------');
          }
        }
      }
    });

    socket.on('close', (code, reason) => {
      console.log(`❌ ${endpointName} closed: ${code} - ${reason}`);
      console.log(
        `📊 ${endpointName} Results: ${messageCount} messages, ${tradeCount} trades, ${subscriptionCount} subscriptions`
      );
      resolve({ endpointName, messageCount, tradeCount, subscriptionCount });
    });

    socket.on('error', error => {
      console.error(`❗️ ${endpointName} error:`, error);
      resolve({ endpointName, error: error.message });
    });

    // Close after 3 minutes
    setTimeout(() => {
      socket.close();
    }, 180000);
  });
}

// Test both endpoints
async function runTests() {
  console.log('🚀 Starting comprehensive endpoint test...');

  // Test delayed endpoint first
  const delayedResults = await testEndpoint(delayedUrl, 'DELAYED');

  // Wait a bit between tests
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test real-time endpoint
  const realtimeResults = await testEndpoint(realtimeUrl, 'REALTIME');

  console.log('\n📊 FINAL RESULTS:');
  console.log('Delayed:', delayedResults);
  console.log('Real-time:', realtimeResults);

  process.exit(0);
}

runTests().catch(console.error);


