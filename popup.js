document.addEventListener("DOMContentLoaded", async function () {
  const currentTimeEl = document.getElementById("current-time");
  const container = document.getElementById("prayer-times");

  // Tambahkan elemen tanggal di atas jadwal sholat
  let dateEl = document.getElementById("date-info");
  if (!dateEl) {
    dateEl = document.createElement("div");
    dateEl.id = "date-info";
    dateEl.style.textAlign = "center";
    dateEl.style.marginBottom = "8px";
    container.parentNode.insertBefore(dateEl, locationEl.nextSibling);
  }

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

  async function fetchPrayerTimes(lat, lng) {
    try {
      // Ambil nama kota menggunakan reverse geocoding
      fetchCityName(lat, lng);

      const today = new Date();
      const dateStr = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
      const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lng}&method=11`;

      const response = await fetch(url);
      const data = await response.json();
      const timings = data.data.timings;

      // Tampilkan tanggal masehi dan hijriyah
      const gregorian = data.data.date.gregorian;
      const hijri = data.data.date.hijri;
      dateEl.innerHTML = `
        <div style="font-weight:600;font-size:15px;">${gregorian.day} ${gregorian.month.en} ${gregorian.year}</div>
        <div style="font-size:13px;color:#007aff;">${hijri.day} ${hijri.month.en} ${hijri.year} H</div>
      `;

      // Hitung waktu Dhuha: Sunrise + 15 menit
      let dhuhaTime = "-";
      if (timings.Sunrise) {
        const [h, m] = timings.Sunrise.split(":").map(Number);
        const dhuhaDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m + 15);
        dhuhaTime = dhuhaDate.toTimeString().slice(0, 5);
      }
      timings.Dhuha = dhuhaTime;

      // Cache data
      chrome.storage.local.set({ timings, lastLat: lat, lastLng: lng });

      container.innerHTML = "";

      // Mapping nama sholat lokal
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

      // Cari waktu shalat sekarang dan berikutnya
      const now = new Date();
      let currentIdx = prayerNames.length - 1; // Default: setelah Isya (berarti sekarang berada di sesi Isya kemarin)
      let nextIdx = 0; // Default: next nya Imsak besok

      for (let i = 0; i < prayerNames.length; i++) {
        const t = timings[prayerNames[i].key];
        if (!t || t === "-") continue;
        const tDate = parseTimeToDate(t, today);

        if (now < tDate) {
          // Jadwal pertama yang lebih besar dari waktu sekarang adalah jadwal berikutnya
          nextIdx = i;
          currentIdx = i > 0 ? i - 1 : prayerNames.length - 1;
          break;
        }
      }

      let countdownInterval;
      function renderPrayerTimes(timings, prayerNames, today, currentIdx, nextIdx) {
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
              const tDate = parseTimeToDate(t, today);
              const now = new Date();
              if (tDate < now) {
                // Berarti jadwal ini untuk besok (misal sesudah Isya, next nya Subuh)
                tDate.setDate(tDate.getDate() + 1);
              }
              let diff = Math.floor((tDate - now) / 1000);
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

      // Ganti bagian render jadwal sholat di fetchPrayerTimes:
      renderPrayerTimes(timings, prayerNames, today, currentIdx, nextIdx);

      // Notifikasi sudah ditangani secara mandiri oleh background.js
    } catch (err) {
      container.innerHTML = '<p style="text-align:center;color:red;">Gagal memuat jadwal</p>';
      document.getElementById("location-name").textContent = "Gagal mendeteksi lokasi";
      if (dateEl) dateEl.innerHTML = "";
      console.error("Gagal mengambil data jadwal sholat:", err);
    }
  }

  // Fungsi untuk mengambil nama kota dari lat/lng menggunakan Nominatim (OpenStreetMap)
  async function fetchCityName(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const res = await fetch(url);
      const data = await res.json();
      const city = data.address.city || data.address.town || data.address.village || "-";
      document.getElementById("location-name").textContent = city;
    } catch (err) {
      document.getElementById("location-name").textContent = "Gagal mendeteksi lokasi";
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
    fetchPrayerTimes(-6.2, 106.816666);
  }

  navigator.geolocation.getCurrentPosition(success, error);

  // Tambahkan di awal DOMContentLoaded:
  const notifToggle = document.getElementById("notif-toggle");
  chrome.storage.local.get({ notifEnabled: true }, (res) => {
    notifToggle.checked = res.notifEnabled;
  });
  notifToggle.addEventListener("change", function () {
    chrome.storage.local.set({ notifEnabled: notifToggle.checked });
  });


});