const prayerNameMap = {
  Imsak: "Imsak",
  Fajr: "Subuh",
  Sunrise: "Terbit",
  Dhuha: "Dhuha",
  Dhuhr: "Dzuhur",
  Asr: "Ashar",
  Maghrib: "Maghrib",
  Isha: "Isya"
};

// Function to create alarm to ensure it exists
function createAlarm() {
  chrome.alarms.get("checkPrayerTimes", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("checkPrayerTimes", { periodInMinutes: 1 });
      console.log("Alarm checkPrayerTimes created");
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Jadwal Sholat Extension Installed");
  createAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("Jadwal Sholat Extension Started");
  createAlarm();
});

// Helper to check if a time is within a 5-minute window
function isRecent(timeStr, currentStr, maxDiffMinutes = 5) {
  if (!timeStr || !currentStr || !timeStr.includes(":") || !currentStr.includes(":")) {
    return false;
  }
  const [th, tm] = timeStr.split(":").map(Number);
  const [ch, cm] = currentStr.split(":").map(Number);
  
  const timeMinutes = th * 60 + tm;
  const currentMinutes = ch * 60 + cm;
  
  const diff = currentMinutes - timeMinutes;
  return diff >= 0 && diff <= maxDiffMinutes;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkPrayerTimes") {
    const today = new Date();
    const todayStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

    chrome.storage.local.get(
      ["timings", "timingsDate", "lastLat", "lastLng", "notifEnabled", "lastNotified"],
      (res) => {
        if (res.notifEnabled === false) return;

        const proceedWithChecking = (timings) => {
          if (!timings) return;

          const now = new Date();
          const current = `${now.getHours()}`.padStart(2, '0') + ":" + `${now.getMinutes()}`.padStart(2, '0');

          let lastNotified = res.lastNotified || { date: "", prayers: [] };
          if (lastNotified.date !== todayStr) {
            lastNotified = { date: todayStr, prayers: [] };
          }

          let updated = false;

          for (const [name, time] of Object.entries(timings)) {
            const localName = prayerNameMap[name];
            if (!localName) continue; // Only notify mapped prayers

            if (isRecent(time, current, 5) && !lastNotified.prayers.includes(name)) {
              chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Waktu Sholat",
                message: `Sudah masuk waktu ${localName}`,
                priority: 2
              });
              lastNotified.prayers.push(name);
              updated = true;
            }
          }

          if (updated) {
            chrome.storage.local.set({ lastNotified });
          }
        };

        // If timings are valid and up to date, check notifications directly
        if (res.timings && res.timingsDate === todayStr) {
          proceedWithChecking(res.timings);
        } else {
          // Timings are stale or missing, fetch new ones
          const lat = res.lastLat !== undefined ? res.lastLat : -6.2;
          const lng = res.lastLng !== undefined ? res.lastLng : 106.816666;

          const url = `https://api.aladhan.com/v1/timings/${todayStr}?latitude=${lat}&longitude=${lng}&method=11`;
          fetch(url)
            .then((response) => response.json())
            .then((data) => {
              if (data && data.data && data.data.timings) {
                const newTimings = data.data.timings;

                // Calculate Dhuha
                let dhuhaTime = "-";
                if (newTimings.Sunrise) {
                  const [h, m] = newTimings.Sunrise.split(":").map(Number);
                  const dhuhaDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m + 15);
                  dhuhaTime = dhuhaDate.toTimeString().slice(0, 5);
                }
                newTimings.Dhuha = dhuhaTime;

                // Cache the data
                chrome.storage.local.set({
                  timings: newTimings,
                  timingsDate: todayStr
                }, () => {
                  proceedWithChecking(newTimings);
                });
              } else if (res.timings) {
                // If fetch failed but we have stale timings, check them as fallback
                proceedWithChecking(res.timings);
              }
            })
            .catch((err) => {
              console.error("Error fetching timings in background alarm:", err);
              if (res.timings) {
                proceedWithChecking(res.timings);
              }
            });
        }
      }
    );
  }
});