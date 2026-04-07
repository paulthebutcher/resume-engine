// Server-Sent Events broadcaster
// Uses named events so frontend can listen selectively.

const clients = new Set();

export function addClient(res) {
  clients.add(res);
  return () => clients.delete(res);
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

export function broadcastJob(job) {
  broadcast('job', job);
}

export function broadcastScout(payload) {
  broadcast('scout', payload);
}

export function clientCount() {
  return clients.size;
}
