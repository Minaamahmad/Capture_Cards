import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  // Reduces RAM usage on your machine during large tests
  discardResponseBodies: true,

  stages: [
    { duration: '1m', target: 200 },   // Ramp up to 200 users over 1 minute
    { duration: '2m', target: 1000 },  // Ramp up to 1,000 users over 2 minutes
    { duration: '3m', target: 5000 },  // Hold at 1,000 users for 3 minutes
    { duration: '1m', target: 0 },     // Ramp back down to 0 users
  ],
};

export default function runTest() {
  const res = http.get('http://localhost:3000');
  
  check(res, { 'status was 200': (r) => r.status === 200 });
  
  // Pause 1 second between requests (simulates real human pacing)
  sleep(1);
}