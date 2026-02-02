<p align="center">
  <img width="700" alt="CompressO Screenshot 1" src="https://github.com/user-attachments/assets/e24596c1-4b88-4f99-bd6e-0abd146fd21d" />
</p>

# [CompressO](https://github.com/codeforreal1/compressO)

Cross-platform offline video compression app built with Tauri + FFmpeg
<div align="center">
  <p>
    <strong>Download</strong>
  </p>
  <div>
    <a href="https://github.com/sm18lr88/compressO/releases">
      <img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=black&color=orange" />
    </a>
    <a href="https://github.com/sm18lr88/compressO/releases">
      <img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows&logoColor=white" />
    </a>
    <a href="https://github.com/sm18lr88/compressO/releases">
      <img alt="macOS" src="https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple&logoColor=white" />
    </a>
  </div>
</div>
<p align="center">
  <img width="700" alt="CompressO Screenshot 2" src="https://github.com/user-attachments/assets/bde20671-a775-468b-af09-7ee8a7979fb5" />
</p>

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
