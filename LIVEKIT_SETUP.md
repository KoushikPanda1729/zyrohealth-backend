# LiveKit Setup

LiveKit is used for video calls between doctors and patients. It replaces the previous custom WebRTC + COTURN setup.

---

## How It Works

```
Doctor Browser → LiveKit SFU → Patient Browser
```

The backend generates a short-lived JWT token for each participant. The frontend uses that token to connect directly to the LiveKit server. The LiveKit SFU (Selective Forwarding Unit) handles all media routing — the backend is not involved in the actual video stream.

Chat during calls still goes through the Express + Socket.IO backend and is stored in PostgreSQL.

---

## Running LiveKit Locally

```bash
docker run --rm \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  livekit/livekit-server \
  --dev \
  --bind 0.0.0.0
```

| Port | Purpose |
|------|---------|
| 7880 | HTTP / WebSocket (signaling) |
| 7881 | TCP media fallback |
| 7882 | UDP media (main video/audio) |

`--dev` mode uses placeholder credentials:
- API Key: `devkey`
- API Secret: `secret`

Verify it is running:
```bash
curl http://localhost:7880
# should return: OK
```

---

## Environment Variables

Add these to your `.env`:

```env
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

For production, replace with your LiveKit Cloud or self-hosted server credentials.

---

## Token Generation

The token is generated in `src/modules/bookings/bookings.service.ts` inside the `joinRoom` method.

```
POST /api/bookings/:id/join-room
```

What it does:
1. Validates the booking exists and is PAID or ACTIVE
2. Validates the requesting user is the doctor or patient of that booking
3. Creates a LiveKit `AccessToken` with:
   - `identity` = userId
   - `room` = booking.videoRoomId (a UUID stored on the Booking entity)
   - Grants: `roomJoin`, `canPublish`, `canSubscribe`
   - TTL: 1 hour
4. Returns `{ token, url }`

The frontend uses this token to call `room.connect(url, token)` directly against the LiveKit server — no further backend involvement in the call.

---

## Room Lifecycle

| Event | What happens |
|-------|-------------|
| Doctor opens call page | Token generated, doctor connects to LiveKit room |
| Patient opens call page | Token generated, patient connects to same room |
| Both connected | LiveKit forwards video/audio between them |
| Either disconnects | Other participant gets `ParticipantDisconnected` event |
| Doctor clicks End Call | `room.disconnect()` called, booking marked COMPLETED via `PATCH /api/bookings/:id/complete` |

---

## Production Setup

For production, use [LiveKit Cloud](https://livekit.io) or self-host LiveKit with a public IP.

Update `.env`:
```env
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
```

LiveKit Cloud free tier supports up to 100 concurrent participants and handles TURN/STUN automatically — no separate COTURN server needed.
