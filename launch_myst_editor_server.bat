@echo off
REM Go to root of the project
cd /d "%~dp0"

REM Activate the virtual environment
call myst_venv\Scripts\activate.bat

REM Change to the directory containing app.py and cert files
cd ./server

REM Run the server (cert.pem and key.pem will now be found)
start "" http://localhost:5000
python app.py

REM Keep terminal open
echo.
echo Server stopped. Press any key to exit...
pause > nul