# Dapptoon Cross-Platform Builds

## Important Note About Cross-Compilation

This app uses the `systray` library which has CGO dependencies for system tray integration. This creates some limitations for cross-compilation:

- ✅ **Native builds** work perfectly (build on the target platform)
- ✅ **Windows builds** work from any platform 
- ⚠️ **Linux builds** may need native compilation for full systray support
- ❌ **macOS builds** require building on macOS due to CGO dependencies

## Quick Build Commands

### Current Platform (Recommended)
```bash
go build -o dapptoon main.go
```

### Windows (works from any platform)
```bash
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o dapptoon-windows.exe main.go
```

### Linux (may need native build for systray)
```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dapptoon-linux main.go
```

### macOS (requires macOS)
```bash
# Run these commands on macOS only
GOOS=darwin GOARCH=amd64 go build -o dapptoon-macos main.go
GOOS=darwin GOARCH=arm64 go build -o dapptoon-macos-arm64 main.go
```

## Automated Build Script

Use the included `build.sh` script to build for all platforms at once:

```bash
./build.sh
```

This will create a `builds/` directory with organized executables for each platform.

## Supported Platforms

Go supports many more platforms. Here are some additional options:

- `GOOS=linux GOARCH=arm64` - Linux ARM64 (Raspberry Pi, etc.)
- `GOOS=freebsd GOARCH=amd64` - FreeBSD
- `GOOS=openbsd GOARCH=amd64` - OpenBSD

## Distribution Notes

- **Linux**: Single executable, no dependencies needed
- **macOS**: May need to sign/notarize for distribution outside App Store
- **Windows**: Single .exe file, no dependencies needed
- **All platforms**: Make sure to include the `dist/` directory alongside the executable