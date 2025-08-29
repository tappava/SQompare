#!/bin/bash

echo "================================================"
echo "           SQompare Build Script"
echo "================================================"
echo

echo "Choose your build target:"
echo "1. Current platform"
echo "2. Windows"
echo "3. macOS"
echo "4. Linux"
echo "5. All platforms"
echo "6. Pack only (no installer)"
echo "7. Clean build directory"
echo

read -p "Enter your choice (1-7): " choice

case $choice in
    1)
        echo "Building for current platform..."
        npm run build
        ;;
    2)
        echo "Building for Windows..."
        npm run build:win
        ;;
    3)
        echo "Building for macOS..."
        npm run build:mac
        ;;
    4)
        echo "Building for Linux..."
        npm run build:linux
        ;;
    5)
        echo "Building for all platforms..."
        npm run build:all
        ;;
    6)
        echo "Packing (no installer)..."
        npm run pack
        ;;
    7)
        echo "Cleaning build directory..."
        npm run clean
        echo "Clean complete!"
        exit 0
        ;;
    *)
        echo "Invalid choice!"
        exit 1
        ;;
esac

echo
echo "Build complete! Check the 'dist' folder for your application."
echo

read -p "Press Enter to continue..."
