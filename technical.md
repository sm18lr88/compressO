# CompressO Technical Notes

This file documents the core processing behavior used by CompressO.

## 1) Compression Engine

- Backend: Rust + Tauri command layer
- Encoder: FFmpeg sidecar (`compresso_ffmpeg`)
- Processing is local/offline
- Temporary working files are created in app data `assets/`

## 2) Quality (CRF)

User quality (0-100) maps to CRF:

```text
crf = 36 - (12 * quality) / 100
```

- 100 -> CRF 24 (higher quality, larger file)
- 50 -> CRF 30
- 0 -> CRF 36 (smaller file)
- Out-of-range values fall back to default CRF 28

## 3) Presets

### `thunderbolt`
Faster encode path, fewer tuning flags.

### `ironclad`
Compression-focused path.
Uses `-preset slow`, `-pix_fmt yuv420p`, `-movflags +faststart`, CRF flow.

## 4) Codecs and Formats

Supported output extensions:

- `mp4`, `mov`, `mkv`, `avi` -> `libx264`
- `webm` -> `libvpx-vp9`

## 5) Video Filters

Filter order applied by app logic:

1. Transform history (rotate / flip / crop)
2. Optional scale (custom dimensions)
3. Even-dimension padding

Padding rule:

```text
pad=ceil(iw/2)*2:ceil(ih/2)*2
```

This avoids odd-dimension codec failures.

## 6) Quality Preview Pipeline

The preview feature renders short clips using current settings.

- Command: `generate_quality_preview`
- Duration: default 20 seconds (bounded 1..120)
- Output pair per preview:
  - source preview clip
  - compressed preview clip
- UI compares them side-by-side with synced playback/seek

### Single mode
- Builds one preview pair from selected file.

### Batch mode
- Builds preview pairs for first 3 batch items.

### Preview playback UX
- Shared Play/Pause
- Shared seek
- Zoom slider
- Mouse-wheel zoom
- Drag-to-pan when zoomed

## 7) Preview Temp File Lifecycle

Preview files are temporary and stored in app `assets/`.

Current cleanup behavior:

- Reused while settings/input are unchanged (no re-render on close/reopen)
- Deleted before generating a new preview set with changed inputs/settings
- Deleted on component unmount
- Backend also removes partial preview files if generation fails
- Global stale-file cleanup still runs with 24h TTL when compression/preview commands execute

## 8) Compression Progress

Encoding progress is parsed from FFmpeg progress output (`out_time=...`) and emitted through Tauri events.

- Single mode updates central compression progress
- Batch mode updates per-item progress

## 9) Batch Auto-shutdown

After batch completion, optional system shutdown can be scheduled.

UI options:

- `No`
- `10`
- `30`
- `60` minutes

Backend dispatches platform-specific shutdown/cancel commands (Windows/macOS/Linux).

## 10) Security / Media Loading

CSP allows:

- `img-src` for app/asset/blob/data
- `media-src` for app/asset/blob/data

This is required for preview video playback via Tauri asset URLs.

## 11) CI/CD Build Matrix

GitHub Actions pipelines cover all desktop targets:

- CI (`.github/workflows/ci.yml`):
  - Windows, Linux, macOS verification
  - `pnpm tsc:check`
  - `cargo check` with warnings denied via `RUSTFLAGS=-D warnings`
  - `pnpm tauri build --bundles none`
- Release (`.github/workflows/release.yml`):
  - Triggered by `v*` tags
  - Publishes Windows (`.msi`, `.exe`), Linux (`.deb`, `.AppImage`), and macOS (`.dmg` arm64/x64) artifacts
