local S="https://himnish2007-loco-temp-monitor-production.up.railway.app/api/push"
local K="himnish_rut200_key_2024"
local C="WAP7-30211"
local H="192.168.1.12"
local P=502
local U=1
local socket=require("socket")

while true do
  pcall(function()
    local sk=socket.tcp()
    sk:settimeout(5)
    if not sk:connect(H,P) then print("no connect") return end

    -- Bulk read: address 1584 (UI reg 1585) to 1606 (UI reg 1607), count=23
    local start=1584
    local count=23
    local p=string.char(0,1,0,0,0,6,U,4,math.floor(start/256),start%256,0,count)
    sk:send(p)
    socket.sleep(0.3)
    local b=sk:receive(9+2*count)
    sk:close()
    if not b or #b<9 then print("no data") return end

    -- Parse all registers into array a[1..23]
    local a={}
    for i=0,count-1 do
      local hi=string.byte(b,10+i*2) or 0
      local lo=string.byte(b,11+i*2) or 0
      local v=hi*256+lo
      if v>32767 then v=v-65536 end
      table.insert(a, v*0.1)
    end

    -- CORRECT index mapping (each sensor is every 2nd register, so step=2)
    -- UI reg 1585=addr 1584=a[1], 1587=addr 1586=a[3], ... 1607=addr 1606=a[23]
    local temps={}
    table.insert(temps, a[1])   -- UI 1585 | TM1 DE
    table.insert(temps, a[3])   -- UI 1587 | TM1 NDE
    table.insert(temps, a[5])   -- UI 1589 | TM2 DE
    table.insert(temps, a[7])   -- UI 1591 | TM2 NDE
    table.insert(temps, a[9])   -- UI 1593 | TM3 DE
    table.insert(temps, a[11])  -- UI 1595 | TM3 NDE
    table.insert(temps, a[13])  -- UI 1597 | TM4 DE
    table.insert(temps, a[15])  -- UI 1599 | TM4 NDE
    table.insert(temps, a[17])  -- UI 1601 | TM5 DE
    table.insert(temps, a[19])  -- UI 1603 | TM5 NDE
    table.insert(temps, a[21])  -- UI 1605 | TM6 DE
    table.insert(temps, a[23])  -- UI 1607 | TM6 NDE

    -- Print for debug
    local labels={"TM1-DE","TM1-NDE","TM2-DE","TM2-NDE","TM3-DE","TM3-NDE",
                  "TM4-DE","TM4-NDE","TM5-DE","TM5-NDE","TM6-DE","TM6-NDE"}
    for i=1,12 do
      print(string.format("%s: %.1f C", labels[i], temps[i] or 0))
    end

    -- Build JSON and push
    local s=""
    for i,v in ipairs(temps) do
      if i>1 then s=s.."," end
      s=s..string.format("%.1f", v or 0)
    end
    local js=string.format(
      '{"apiKey":"%s","coachId":"%s","motors":[%s],"ts":"%s"}',
      K,C,s,os.date("!%Y-%m-%dT%H:%M:%SZ")
    )
    local cmd='curl -s -X POST "'..S..'" -H "Content-Type: application/json" -d '
    cmd=cmd.."'"..js.."' --max-time 10"
    print(io.popen(cmd):read("*a"))
  end)
  socket.sleep(5)
end
