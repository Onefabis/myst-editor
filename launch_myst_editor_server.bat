@echo off
REM --- Go to root of the project ---
cd /d "%~dp0"

REM --- Ensure we are in the Myst-Editor directory ---
cd /d "%~dp0"

REM --- Go into server directory ---
cd server

REM --- Start browser ---
start "" http://localhost:5000

REM --- Run the server using the virtual environment Python explicitly ---
..\myst_venv\Scripts\python.exe app.py

echo.
echo Server stopped. Press any key to exit...
pause > nul
