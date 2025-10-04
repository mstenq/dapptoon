# Dapptoon OrbitDB demo

This project now showcases a browser-based OrbitDB log that syncs between peers over libp2p using Helia. Launch multiple copies of the UI to watch entries replicate in real time.

## Install dependencies

```bash
bun install
```

## Start the development server

```bash
bun dev
```

## Build for production

```bash
bun run build
```

## Try the multi-peer log

1. Start the dev server and open `http://localhost:3000` in your browser.
2. Open the same URL in another tab, another browser profile, or a different device.
3. Use the "Publish a message" form in one window and watch it appear in the other nearly instantly.

### Notes

- Each browser instance creates (and reuses) a random OrbitDB identity stored in `localStorage` under `dapptoon.orbitdb.identityId`.
- libp2p uses the default browser transports from `@orbitdb/liftoff`, so peers can connect using WebRTC or relayed WebSocket paths without extra config.
- The demo database is an OrbitDB `events` log named `dapptoon-demo`; you can share its address to link other peers if needed.
