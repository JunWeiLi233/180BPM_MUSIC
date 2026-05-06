# Beats Your Music

Localhost website for converting one or more uploaded music files to a target BPM. The default target is 180 BPM for runner-friendly playlists.

## Run

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The API runs at `http://127.0.0.1:4177`. Vite proxies `/api` requests to that server.

## Verify

```powershell
npm test
npm run build
npm run test:browser
npm run test:browser:multi
```

`npm run test:browser` expects `npm run dev` to already be running.

## Deploy To Render

This project is Render-ready as one Node Web Service.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

The included `render.yaml` can be used as a Render Blueprint after the project is pushed to GitHub.

## Notes

- Supported input: common audio files such as MP3, WAV, M4A, AAC, OGG, FLAC, AIFF, and AIF.
- File limit: 80 MB.
- Batch handling: select or drop multiple files; each track gets its own BPM correction, conversion button, preview, and download.
- Conversion output: MP3.
- Audio is processed by the local Node server using bundled FFmpeg from `ffmpeg-static`.
- Temporary files are stored under `server/storage`, cleared when the server starts, and removed after about 1 hour while the server is running.
