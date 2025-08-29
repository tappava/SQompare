@echo off
echo ================================================
echo           SQompare Build Script
echo ================================================
echo.

REM Disable code signing to avoid permission issues
set CSC_IDENTITY_AUTO_DISCOVERY=false
set CSC_LINK=
set CSC_KEY_PASSWORD=

echo Choose your build target:
echo 1. Windows (current platform)
echo 2. macOS 
echo 3. Linux
echo 4. All platforms
echo 5. Pack only (no installer)
echo 6. Clean build directory
echo.

set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" (
    echo Building for Windows
    call npm run build:win
) else if "%choice%"=="2" (
    echo Building for macOS
    call npm run build:mac
) else if "%choice%"=="3" (
    echo Building for Linux
    call npm run build:linux
) else if "%choice%"=="4" (
    echo Building for all platforms
    call npm run build:all
) else if "%choice%"=="5" (
    echo Packing (no installer
    call npm run pack
) else if "%choice%"=="6" (
    echo Cleaning build directory
    call npm run clean
    echo Clean complete!
    goto end
) else (
    echo Invalid choice!
    goto end
)

echo.
echo Build complete! Check the 'dist' folder for your application.
echo.

:end
pause
