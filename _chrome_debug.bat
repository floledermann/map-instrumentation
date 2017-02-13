echo %~dp0
chrome.exe --user-data-dir="%~dp0_chrome_user_data_debug" --remote-debugging-port=9222
pause