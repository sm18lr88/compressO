# CompressO

Cross-platform offline video compression app built with Tauri + FFmpeg.

## Download

Installers are published on GitHub Releases.

- Windows: `.msi`, `.exe` (NSIS)
- Linux: `.deb`, `.AppImage`
- macOS: `.dmg` (arm64, x64)

## Features

- Single and batch compression
- Presets: `ironclad` (smaller output), `thunderbolt` (faster)
- Optional quality control (CRF-based)
- Mute audio
- Resize, FPS change, and transforms (crop/rotate/flip)
- Pre-compression quality preview:
  - Single mode: first 20s
  - Batch mode: first 3 videos (20s each)
  - Side-by-side synced playback/seek
  - Wheel zoom + drag pan
- Batch auto-shutdown: `No`, `10`, `30`, `60` minutes

## Run Locally

```bash
pnpm install
pnpm tauri:dev
```

## Build

```bash
pnpm tauri:build
```

Default output location:

- `src-tauri/target/release/bundle/`

If `CARGO_TARGET_DIR` is set in your environment, artifacts are written there instead.

## CI/CD

- CI workflow: `.github/workflows/ci.yml`
  - Runs on push/PR to `main`
  - Matrix: Windows, Linux, macOS
  - Checks: `pnpm tsc:check`, `cargo check`, `pnpm tauri build --no-bundle`
  - Rust warnings fail CI (`RUSTFLAGS=-D warnings`)
- Release workflow: `.github/workflows/release.yml`
  - Runs on `v*` tags
  - Builds and publishes `.msi`, `.exe`, `.deb`, `.AppImage`, `.dmg`

## CLI (Batch)

```bash
cd src-tauri
cargo run --bin compresso-cli
```

Optional FFmpeg override:

```bash
COMPRESSO_FFMPEG_PATH=<path-to-ffmpeg-sidecar>
```

## License

AGPL-3.0-only. See `LICENSE`.

This project uses FFmpeg under LGPLv2.1.
