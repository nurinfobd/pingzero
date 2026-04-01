const http = require('http');

const data = JSON.stringify({
  name: 'Google DNS',
  ip: '8.8.8.8'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/hosts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
