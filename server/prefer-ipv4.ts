import dns from 'node:dns';
import net from 'node:net';

dns.setDefaultResultOrder('ipv4first');

if ('setDefaultAutoSelectFamily' in net && typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}
