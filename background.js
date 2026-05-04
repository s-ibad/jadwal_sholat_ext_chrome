chrome.runtime.onInstalled.addListener(() => {
  console.log("Jadwal Sholat Extension Installed");
  chrome.alarms.create("checkPrayerTimes", { periodInMinutes: 1 });
});

// Mapping nama API ke nama lokal
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkPrayerTimes") {
    chrome.storage.local.get(["timings", "notifEnabled"], (res) => {
      // Jika toggle dimatikan, abaikan notifikasi
      if (res.notifEnabled === false) return;
      
      if (!res.timings) return;
      const now = new Date();
      const current = `${now.getHours()}`.padStart(2, '0') + ":" + `${now.getMinutes()}`.padStart(2, '0');

      for (const [name, time] of Object.entries(res.timings)) {
        if (time === current) {
          const localName = prayerNameMap[name] || name;
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Waktu Sholat",
            message: `Sudah masuk waktu ${localName}`,
            priority: 2
          });
        }
      }
    });
  }
});