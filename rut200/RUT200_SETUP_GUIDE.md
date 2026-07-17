# RUT200 SSH Setup Guide

## Connect
ssh root@192.168.1.1
(If key error: ssh-keygen -R 192.168.1.1, then reconnect)

## Upload Script (First Time or After Reboot)
cat > /etc/himnish_push.lua << 'LUAEOF'
[paste script content here]
LUAEOF

## Run Script
lua /etc/himnish_push.lua          # Foreground (testing)
lua /etc/himnish_push.lua &        # Background (production)

## Stop Script
kill $(ps | grep himnish | grep -v grep | awk '{print $1}')

## Auto-start on Reboot
echo '#!/bin/sh' > /etc/rc.local
echo 'lua /etc/himnish_push.lua &' >> /etc/rc.local
chmod +x /etc/rc.local

## Verify Running
ps | grep lua

## Live Log Check
logread -f | grep TM

## IMPORTANT: WebUI Setting
Services → Modbus → Modbus TCP Client → MIBRX6 → Toggle OFF
(Warna Lua script se conflict hoga — "no connect" error aayega)

## Expected Output
TM1-DE: 24.5 C
TM1-NDE: 25.7 C
...
TM6-NDE: 26.4 C
{"ok":true,"received":"2026-05-16T..."}
