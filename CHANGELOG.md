# Changelog

## Unreleased

### Added
- Quality Preview before processing:
  - Single mode: first 20s sample
  - Batch mode: first 3 videos, 20s sample each
  - Side-by-side compare with synced play/seek
  - Wheel zoom + drag pan
- Preview progress shown directly in the Preview button
- Batch auto-shutdown setting with dropdown options: `No`, `10`, `30`, `60` minutes

### Changed
- Preview reopens from cache when inputs/settings are unchanged (no unnecessary re-render)
- Auto-shutdown UI is more compact
- App CSP now explicitly allows `media-src` for preview playback

### Fixed
- Preview modal playback issues (black screen / non-playing state)
- Preview temp file handling:
  - cleaned when regenerating with new settings
  - cleaned on component unmount
  - partial files removed on backend failure

### Docs
- Simplified `README.md`
- Updated `technical.md` for preview, cleanup, and auto-shutdown behavior
- Documented CI/CD workflows for cross-platform builds and release artifacts

### Infrastructure
- Added cross-platform CI workflow for Windows/Linux/macOS verification
- Added release workflow for Windows (`.msi`, `.exe`), Linux (`.deb`, `.AppImage`), and macOS (`.dmg` arm64/x64)

## 1.4.0

### Fixed
- Drag-and-drop issue on Windows

## 1.3.0

### Added
- Video transforms: crop, rotate, flip
- Custom output dimensions
- Custom FPS

### Changed
- Revamped UI

## 1.2.0

### Added
- Drag & drop support
- Cancel in-progress compression
- Quality slider

### Changed
- Video configuration UI improvements
- Window size and position persistence

### Fixed
- Window persistence issues on restart
- Accessibility fixes for scaled resolutions

## 1.1.0

### Added
- Mute video option

### Changed
- Minimum window height reduced from 992 to 800

### Fixed
- Typo fix for `vide_duration`
- README installer extension correction
