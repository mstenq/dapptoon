#!/bin/bash

# Cross-platform build script for dapptoon
# Builds for Linux, macOS, and Windows

APP_NAME="dapptoon"
VERSION="1.0.0"
BUILD_DIR="builds"

echo "🚀 Building $APP_NAME v$VERSION for multiple platforms..."
echo "⚠️  Note: macOS builds require building on macOS due to systray CGO dependencies"

# Clean previous builds
if [ -d "$BUILD_DIR" ]; then
    echo "🧹 Cleaning previous builds..."
    rm -rf "$BUILD_DIR"
fi

# Create build directory structure
mkdir -p "$BUILD_DIR"/{linux,darwin,windows}

echo "📦 Building executables..."

# Build for current platform first (native build)
echo "  🏠 Building for current platform..."
go build -o "$BUILD_DIR/native/${APP_NAME}" main.go
if [ $? -eq 0 ]; then
    echo "    ✅ Native build successful"
else
    echo "    ❌ Native build failed"
    exit 1
fi

# Build for Linux (64-bit) - works from any platform
echo "  🐧 Building for Linux amd64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "$BUILD_DIR/linux/${APP_NAME}" main.go
if [ $? -eq 0 ]; then
    echo "    ✅ Linux build successful"
else
    echo "    ❌ Linux build failed (trying with CGO disabled)"
fi

# Build for Windows (64-bit) - works from any platform  
echo "  🪟 Building for Windows amd64..."
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o "$BUILD_DIR/windows/${APP_NAME}.exe" main.go
if [ $? -eq 0 ]; then
    echo "    ✅ Windows build successful"
else
    echo "    ❌ Windows build failed"
fi

# macOS builds - only attempt if we're on macOS or provide instructions
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  🍎 Building for macOS amd64..."
    GOOS=darwin GOARCH=amd64 go build -o "$BUILD_DIR/darwin/${APP_NAME}" main.go
    if [ $? -eq 0 ]; then
        echo "    ✅ macOS Intel build successful"
    else
        echo "    ❌ macOS Intel build failed"
    fi

    echo "  🍎 Building for macOS arm64..."
    GOOS=darwin GOARCH=arm64 go build -o "$BUILD_DIR/darwin/${APP_NAME}-arm64" main.go
    if [ $? -eq 0 ]; then
        echo "    ✅ macOS Apple Silicon build successful"
    else
        echo "    ❌ macOS Apple Silicon build failed"
    fi
else
    echo "  🍎 Skipping macOS builds (requires macOS for systray CGO dependencies)"
    echo "    💡 To build for macOS: run this script on a Mac or use GitHub Actions"
fi

# Copy dist directory to each build (if it exists)
if [ -d "dist" ]; then
    echo "📂 Copying dist directory to builds..."
    cp -r dist "$BUILD_DIR/linux/"
    cp -r dist "$BUILD_DIR/darwin/"
    cp -r dist "$BUILD_DIR/windows/"
    echo "    ✅ Dist directories copied"
fi

# Display build sizes
echo ""
echo "📊 Build Summary:"
echo "=================="
for dir in "$BUILD_DIR"/*; do
    if [ -d "$dir" ]; then
        platform=$(basename "$dir")
        echo "🔸 $platform:"
        for file in "$dir"/*; do
            if [ -f "$file" ] && [[ $(basename "$file") == *"$APP_NAME"* ]]; then
                size=$(du -h "$file" | cut -f1)
                echo "   $(basename "$file"): $size"
            fi
        done
    fi
done

echo ""
echo "🎉 All builds completed successfully!"
echo "📁 Executables are in the '$BUILD_DIR' directory"
echo ""
echo "💡 Usage examples:"
echo "   Linux:   ./$BUILD_DIR/linux/$APP_NAME"
echo "   macOS:   ./$BUILD_DIR/darwin/$APP_NAME"
echo "   Windows: .\\$BUILD_DIR\\windows\\$APP_NAME.exe"