document.addEventListener("DOMContentLoaded", async function () {
  const currentTimeEl = document.getElementById("current-time");
  const container = document.getElementById("prayer-times");
  const dateEl = document.getElementById("date-info");
  const locationNameEl = document.getElementById("location-name");
  const notifToggle = document.getElementById("notif-toggle");

  const prayerNames = [
    { key: "Imsak", label: "Imsak" },
    { key: "Fajr", label: "Subuh" },
    { key: "Sunrise", label: "Terbit" },
    { key: "Dhuha", label: "Dhuha" },
    { key: "Dhuhr", label: "Dzuhur" },
    { key: "Asr", label: "Ashar" },
    { key: "Maghrib", label: "Maghrib" },
    { key: "Isha", label: "Isya" }
  ];

  function updateTime() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  updateTime();
  setInterval(updateTime, 1000);

  function parseTimeToDate(timeStr, today) {
    const [h, m] = timeStr.split(":").map(Number);
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m);
  }

  function renderDate(gregorian, hijri) {
    if (!gregorian || !hijri) return;
    dateEl.innerHTML = `
      <div class="masehi">${gregorian.day} ${gregorian.month.en} ${gregorian.year}</div>
      <div class="hijri">${hijri.day} ${hijri.month.en} ${hijri.year} H</div>
    `;
  }

  function renderPrayerTimes(timings) {
    if (!timings) return;

    const today = new Date();
    const now = new Date();
    let currentIdx = prayerNames.length - 1; // Default: setelah Isya
    let nextIdx = 0; // Default: next nya Imsak besok

    for (let i = 0; i < prayerNames.length; i++) {
      const t = timings[prayerNames[i].key];
      if (!t || t === "-") continue;
      const tDate = parseTimeToDate(t, today);

      if (now < tDate) {
        nextIdx = i;
        currentIdx = i > 0 ? i - 1 : prayerNames.length - 1;
        break;
      }
    }

    container.innerHTML = "";
    prayerNames.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "prayer-time";
      div.style.position = "relative";
      div.innerHTML = `<span class="prayer-name">${item.label}</span><span class="prayer-time-value">${timings[item.key] || "-"}</span>`;

      if (idx === currentIdx) {
        div.classList.add("current-prayer");
      } else if (idx === nextIdx) {
        div.classList.add("highlight-prayer");
        
        // Tambahkan badge countdown
        const badge = document.createElement("small");
        badge.className = "cdown-badge";
        badge.id = "cdown";
        badge.textContent = "--:--:--";
        div.appendChild(badge);

        // Jalankan countdown
        if (window.countdownInterval) clearInterval(window.countdownInterval);
        function updateCountdown() {
          const t = timings[item.key];
          if (!t || t === "-") return;
          const tDate = parseTimeToDate(t, today);
          const currentNow = new Date();
          if (tDate < currentNow) {
            // Berarti jadwal ini untuk besok
            tDate.setDate(tDate.getDate() + 1);
          }
          let diff = Math.floor((tDate - currentNow) / 1000);
          if (diff < 0) diff = 0;
          const h = String(Math.floor(diff / 3600)).padStart(2, "0");
          const m = String(Math.floor((diff % 3600) / 60)).padStart(2, "0");
          const s = String(diff % 60).padStart(2, "0");
          badge.textContent = `${h}:${m}:${s}`;
        }
        updateCountdown();
        window.countdownInterval = setInterval(updateCountdown, 1000);
      }
      container.appendChild(div);
    });
  }

  // Load from cache immediately if present and is for today
  const today = new Date();
  const todayStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;

  chrome.storage.local.get(["timings", "timingsDate", "cityName", "gregorian", "hijri"], (res) => {
    if (res.timings && res.timingsDate === todayStr) {
      if (res.cityName) {
        locationNameEl.textContent = res.cityName;
      }
      renderDate(res.gregorian, res.hijri);
      renderPrayerTimes(res.timings);
    }
  });

  async function fetchPrayerTimes(lat, lng) {
    try {
      fetchCityName(lat, lng);

      const todayVal = new Date();
      const dateStr = `${todayVal.getDate()}-${todayVal.getMonth() + 1}-${todayVal.getFullYear()}`;
      const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=11`;

      const response = await fetch(url);
      const data = await response.json();
      const timings = data.data.timings;

      const gregorian = data.data.date.gregorian;
      const hijri = data.data.date.hijri;

      // Hitung waktu Dhuha: Sunrise + 15 menit
      let dhuhaTime = "-";
      if (timings.Sunrise) {
        const [h, m] = timings.Sunrise.split(":").map(Number);
        const dhuhaDate = new Date(todayVal.getFullYear(), todayVal.getMonth(), todayVal.getDate(), h, m + 15);
        dhuhaTime = dhuhaDate.toTimeString().slice(0, 5);
      }
      timings.Dhuha = dhuhaTime;

      // Cache data
      chrome.storage.local.set({
        timings,
        timingsDate: dateStr,
        lastLat: lat,
        lastLng: lng,
        gregorian,
        hijri
      });

      renderDate(gregorian, hijri);
      renderPrayerTimes(timings);
    } catch (err) {
      // If we don't have cached timings loaded, show error message
      chrome.storage.local.get(["timings", "timingsDate"], (res) => {
        if (!res.timings || res.timingsDate !== todayStr) {
          container.innerHTML = '<p style="text-align:center;color:red;">Gagal memuat jadwal</p>';
          locationNameEl.textContent = "Gagal mendeteksi lokasi";
          dateEl.innerHTML = "";
        }
      });
      console.error("Gagal mengambil data jadwal sholat:", err);
    }
  }

  async function fetchCityName(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const city = data.address.city || data.address.town || data.address.village || "-";
      locationNameEl.textContent = city;
      chrome.storage.local.set({ cityName: city });
    } catch (err) {
      // Fallback: only reset text if we don't have a cached cityName
      chrome.storage.local.get(["cityName"], (res) => {
        if (!res.cityName) {
          locationNameEl.textContent = "Gagal mendeteksi lokasi";
        }
      });
      console.error("Gagal mengambil nama kota:", err);
    }
  }

  function success(pos) {
    const crd = pos.coords;
    fetchPrayerTimes(crd.latitude, crd.longitude);
  }

  function error(err) {
    console.warn(`ERROR(${err.code}): ${err.message}`);
    // fallback ke Jakarta
    chrome.storage.local.get(["lastLat", "lastLng"], (res) => {
      const lat = res.lastLat !== undefined ? res.lastLat : -6.2;
      const lng = res.lastLng !== undefined ? res.lastLng : 106.816666;
      fetchPrayerTimes(lat, lng);
    });
  }

  navigator.geolocation.getCurrentPosition(success, error);

  chrome.storage.local.get({ notifEnabled: true }, (res) => {
    notifToggle.checked = res.notifEnabled;
  });
  notifToggle.addEventListener("change", function () {
    chrome.storage.local.set({ notifEnabled: notifToggle.checked });
  });
});