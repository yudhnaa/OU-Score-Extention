// dashboard.js - Tailwind + Chart.js + State Sync

(function () {
  'use strict';

  let scoreData = null;
  let originalData = null;
  let currentFilter = 'all';
  let searchQuery = '';
  let gpaChartInstance = null;

  document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get('scoreData', (result) => {
      if (!result.scoreData) {
        document.querySelector('main').innerHTML = '<div class="p-10 text-center text-muted"><h2 class="text-xl font-bold mb-2">Không có dữ liệu</h2><p>Hãy mở popup từ trang điểm OU để tải dữ liệu trước.</p></div>';
        return;
      }
      scoreData = JSON.parse(JSON.stringify(result.scoreData));

      // Store original for reset (though a true reset would mean clearing exclusions)
      // We will clone without exclusions
      originalData = JSON.parse(JSON.stringify(result.scoreData));
      originalData.semesters.forEach(s => s.courses.forEach(c => {
        c.excluded = ScoreUtils.isAutoExcluded(c.code);
      }));

      initDashboard();
    });
  });

  function saveAndRefresh() {
    chrome.storage.local.set({ scoreData: scoreData }, () => {
      renderOverview();
      renderDetail();
    });
  }

  function initDashboard() {
    renderStudentInfo();
    renderOverview();
    renderDetail();
    setupNavigation();
    setupActions();
    setupSearch();
    setupFilters();
  }

  function renderStudentInfo() {
    const si = scoreData.studentInfo || {};
    document.getElementById('sb-student-name').textContent = si.hoTen || '—';
    document.getElementById('sb-student-id').textContent = 'MSSV: ' + (si.mssv || '—');
  }

  // ==================== OVERVIEW ====================
  function renderOverview() {
    const sems = scoreData.semesters;
    const g4 = ScoreUtils.calcCumulativeGPA4(sems);
    const g10 = ScoreUtils.calcCumulativeGPA10(sems);
    const tc = ScoreUtils.calcTotalCredits(sems);

    let totalCourses = 0;
    sems.forEach(s => { totalCourses += s.courses.filter(c => !c.excluded && c.credits > 0).length; });

    document.getElementById('ov-gpa4').textContent = g4 !== null ? g4.toFixed(2) : '—';
    document.getElementById('ov-gpa10').textContent = g10 !== null ? g10.toFixed(2) : '—';
    document.getElementById('ov-credits').textContent = tc;
    document.getElementById('ov-courses').textContent = totalCourses;

    renderChart(sems);
    renderSemesterSummary(sems);
  }

  function renderChart(sems) {
    const ctx = document.getElementById('gpaChartCanvas').getContext('2d');

    const reversed = [...sems].reverse();
    const labels = reversed.map(s => {
      const m = s.name.match(/k[ỳy]\s*(\d+).*?(\d{4})/i);
      return m ? `HK${m[1]} ${m[2]}` : s.name.substring(0, 10);
    });

    const data4 = reversed.map(s => ScoreUtils.calcSemesterGPA4(s.courses));
    const data10 = reversed.map(s => ScoreUtils.calcSemesterGPA10(s.courses));

    if (gpaChartInstance) {
      gpaChartInstance.destroy();
    }

    gpaChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'ĐTBHK Hệ 4',
            data: data4,
            borderColor: '#111111',
            backgroundColor: '#111111',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'ĐTBHK Hệ 10',
            data: data10,
            borderColor: '#06b6d4',
            backgroundColor: '#06b6d4',
            borderWidth: 2,
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        clip: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              font: { family: 'Inter', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#111111',
            titleFont: { family: 'Inter', size: 13 },
            bodyFont: { family: 'Inter', size: 13 },
            padding: 10,
            cornerRadius: 8,
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Inter', size: 11 } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            min: 0, max: 4,
            grid: { color: '#e5e7eb' },
            ticks: { font: { family: 'Inter', size: 11 } }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0, max: 10,
            grid: { drawOnChartArea: false },
            ticks: { font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });
  }

  function renderSemesterSummary(sems) {
    const tbody = document.getElementById('semester-summary-body');
    tbody.innerHTML = '';
    sems.forEach(sem => {
      const g4 = ScoreUtils.calcSemesterGPA4(sem.courses);
      const g10 = ScoreUtils.calcSemesterGPA10(sem.courses);
      const courses = sem.courses.filter(c => !c.excluded && c.credits > 0);
      const tc = courses.filter(c => c.result === 'pass').reduce((s, c) => s + c.credits, 0);
      const cls = ScoreUtils.classifyGPA4(g4);

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 transition-colors';
      tr.innerHTML = `
        <td class="py-3 text-gray-900 font-medium">${sem.name}</td>
        <td class="py-3 text-center text-muted">${courses.length}</td>
        <td class="py-3 text-center text-muted">${tc}</td>
        <td class="py-3 text-center font-bold text-primary">${g4 !== null ? g4.toFixed(2) : '—'}</td>
        <td class="py-3 text-center font-bold text-blue-600">${g10 !== null ? g10.toFixed(2) : '—'}</td>
        <td class="py-3"><span class="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">${cls}</span></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==================== DETAIL ====================
  let editingCourse = null; // { semIdx, courseIdx }

  function renderDetail() {
    const container = document.getElementById('detail-semesters');
    container.innerHTML = '';
    const sems = scoreData.semesters;
    const semNames = sems.map(s => s.name);

    // Update Detail tab header GPAs
    const cumGPA4 = ScoreUtils.calcCumulativeGPA4(sems);
    const cumGPA10 = ScoreUtils.calcCumulativeGPA10(sems);
    const elGPA4 = document.getElementById('detail-gpa4');
    const elGPA10 = document.getElementById('detail-gpa10');
    if (elGPA4) elGPA4.textContent = cumGPA4 !== null ? cumGPA4.toFixed(2) : '—';
    if (elGPA10) elGPA10.textContent = cumGPA10 !== null ? cumGPA10.toFixed(2) : '—';

    sems.forEach((sem, si) => {
      const g4 = ScoreUtils.calcSemesterGPA4(sem.courses);
      const tc = sem.courses.filter(c => !c.excluded && c.credits > 0 && c.result === 'pass').reduce((s, c) => s + c.credits, 0);

      // Filter courses
      let filtered = sem.courses;
      if (searchQuery) filtered = filtered.filter(c => c.name.toLowerCase().includes(searchQuery) || c.code.toLowerCase().includes(searchQuery));
      if (currentFilter === 'included') filtered = filtered.filter(c => !c.excluded);
      else if (currentFilter === 'excluded') filtered = filtered.filter(c => c.excluded);
      else if (currentFilter === 'english') filtered = filtered.filter(c => ScoreUtils.isEnglish(c.code));

      if (filtered.length === 0 && (searchQuery || currentFilter !== 'all')) return;

      const section = document.createElement('div');
      section.className = 'bg-white border border-hairline rounded-xl overflow-hidden shadow-sm';

      let rows = '';
      filtered.forEach((c, ci) => {
        const realIdx = sem.courses.indexOf(c);
        const excludedStyle = c.excluded ? 'opacity-40 line-through' : '';
        const toggleChecked = !c.excluded ? 'checked' : '';
        const modifiedStyle = c.modified ? 'bg-orange-50/40' : 'hover:bg-gray-50';
        const isEditing = editingCourse && editingCourse.semIdx === si && editingCourse.courseIdx === realIdx;

        let moveOptions = semNames.map((n, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${n.replace(/Học kỳ /, 'HK').replace(/ - Năm học /, ' ')}</option>`).join('');

        if (isEditing) {
          rows += `
            <tr class="border-b border-hairline bg-blue-50 transition-colors">
              <td class="py-3 px-4 text-xs text-muted">${ci + 1}</td>
              <td class="py-3 px-4 text-xs font-mono text-muted">${c.code}</td>
              <td class="py-3 px-4 text-sm font-medium text-gray-900 max-w-[200px] truncate" title="${c.name}">${c.name}</td>
              <td class="py-3 px-4 text-sm text-center">${c.credits}</td>
              <td class="py-3 px-4 text-sm text-center">
                <input type="number" id="edit-10" value="${c.diemTK10 !== null ? c.diemTK10 : ''}" class="w-14 border border-gray-300 rounded px-1 py-1 text-sm outline-none focus:border-primary text-center" step="0.1" max="10" min="0">
              </td>
              <td class="py-3 px-4 text-sm font-semibold text-center">
                <input type="number" id="edit-4" value="${c.diemTK4 !== null ? c.diemTK4 : ''}" class="w-14 border border-gray-300 rounded px-1 py-1 text-sm outline-none focus:border-primary text-center" step="0.1" max="4" min="0">
              </td>
              <td class="py-3 px-4 text-sm font-bold text-center">
                <input type="text" id="edit-c" value="${c.diemTKC || ''}" class="w-10 border border-gray-300 rounded px-1 py-1 text-sm outline-none focus:border-primary uppercase text-center" maxlength="2">
              </td>
              <td class="py-3 px-4 text-center">${c.result === 'pass' ? '<span class="text-emerald-500 font-bold">✓</span>' : c.result === 'fail' ? '<span class="text-red-500 font-bold">✗</span>' : ''}</td>
              <td class="py-3 px-4" colspan="3">
                <div class="flex items-center gap-2">
                  <button class="btn-save bg-primary text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-800 transition" data-sem="${si}" data-course="${realIdx}">Lưu</button>
                  <button class="btn-cancel bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-50 transition">Hủy</button>
                </div>
              </td>
            </tr>
          `;
        } else {
          rows += `
            <tr class="border-b border-hairline transition-colors ${modifiedStyle} ${excludedStyle}">
              <td class="py-3 px-4 text-xs text-muted">${ci + 1}</td>
              <td class="py-3 px-4 text-xs font-mono text-muted">${c.code}</td>
              <td class="py-3 px-4 text-sm font-medium text-gray-900 max-w-[200px] truncate" title="${c.name}">${c.name}
                ${c.modified ? '<span class="ml-2 text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold" title="Điểm giả định">Sửa</span>' : ''}
              </td>
              <td class="py-3 px-4 text-sm text-center">${c.credits}</td>
              <td class="py-3 px-4 text-sm text-center">${c.diemTK10 ?? ''}</td>
              <td class="py-3 px-4 text-sm font-semibold text-center">${c.diemTK4 ?? ''}</td>
              <td class="py-3 px-4 text-sm font-bold text-center ${c.diemTKC?.startsWith('A') ? 'text-emerald-500' : c.diemTKC?.startsWith('F') ? 'text-red-500' : ''}">${c.diemTKC}</td>
              <td class="py-3 px-4 text-center">${c.result === 'pass' ? '<span class="text-emerald-500 font-bold">✓</span>' : c.result === 'fail' ? '<span class="text-red-500 font-bold">✗</span>' : ''}</td>
              <td class="py-3 px-4">
                <label class="flex items-center cursor-pointer relative w-10 h-5" title="${c.excluded ? 'Đang loại bỏ' : 'Đang tính'}">
                  <input type="checkbox" class="toggle-exclude sr-only" data-sem="${si}" data-course="${realIdx}" ${toggleChecked}>
                  <div class="toggle-bg block w-10 h-5 bg-gray-300 rounded-full transition-colors ${!c.excluded ? 'bg-primary' : ''}"></div>
                  <div class="toggle-dot dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${!c.excluded ? 'transform translate-x-5' : ''}"></div>
                </label>
              </td>
              <td class="py-3 px-4">
                <select class="move-select bg-card border border-hairline text-xs rounded px-2 py-1 outline-none focus:border-primary" data-sem="${si}" data-course="${realIdx}">
                  ${moveOptions}
                </select>
              </td>
              <td class="py-3 px-4">
                <button class="btn-edit text-gray-400 hover:text-primary transition-colors" data-sem="${si}" data-course="${realIdx}" title="Sửa điểm giả định">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </td>
            </tr>
          `;
        }
      });

      section.innerHTML = `
        <div class="flex items-center justify-between p-4 bg-card border-b border-hairline cursor-pointer semester-header">
          <div class="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted transition-transform semester-toggle"><polyline points="6 9 12 15 18 9"/></svg>
            <h3 class="font-bold text-gray-900">${sem.name}</h3>
          </div>
          <div class="flex items-center gap-4 text-sm">
            <span class="text-muted"><strong class="text-primary">${g4 !== null ? g4.toFixed(2) : '—'}</strong> GPA</span>
            <span class="text-muted"><strong class="text-gray-900">${tc}</strong> TC</span>
            <span class="text-muted"><strong class="text-gray-900">${sem.courses.length}</strong> môn</span>
          </div>
        </div>
        <div class="semester-body overflow-hidden transition-all duration-300">
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead>
                <tr class="bg-white border-b border-hairline text-xs uppercase text-muted tracking-wider">
                  <th class="py-3 px-4 font-semibold">#</th>
                  <th class="py-3 px-4 font-semibold">Mã MH</th>
                  <th class="py-3 px-4 font-semibold">Tên môn học</th>
                  <th class="py-3 px-4 font-semibold text-center">TC</th>
                  <th class="py-3 px-4 font-semibold text-center">TK(10)</th>
                  <th class="py-3 px-4 font-semibold text-center">TK(4)</th>
                  <th class="py-3 px-4 font-semibold text-center">Chữ</th>
                  <th class="py-3 px-4 font-semibold text-center">KQ</th>
                  <th class="py-3 px-4 font-semibold">Tính điểm</th>
                  <th class="py-3 px-4 font-semibold">Chuyển kỳ</th>
                  <th class="py-3 px-4 font-semibold">Sửa</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
      container.appendChild(section);
    });

    // Event: Toggle collapse
    container.querySelectorAll('.semester-header').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        const toggle = h.querySelector('.semester-toggle');
        body.classList.toggle('hidden');
        toggle.classList.toggle('-rotate-90');
      });
    });

    // Event: Toggle exclude checkbox style logic
    container.querySelectorAll('.toggle-exclude').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const si = parseInt(chk.dataset.sem);
        const ci = parseInt(chk.dataset.course);
        const course = scoreData.semesters[si].courses[ci];

        course.excluded = !chk.checked; // If checked, it means included, so excluded is false
        saveAndRefresh();
      });
    });

    // Event: Move course
    container.querySelectorAll('.move-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const fromSem = parseInt(sel.dataset.sem);
        const courseIdx = parseInt(sel.dataset.course);
        const toSem = parseInt(sel.value);
        if (fromSem === toSem) return;

        const course = scoreData.semesters[fromSem].courses.splice(courseIdx, 1)[0];
        scoreData.semesters[toSem].courses.push(course);

        showToast(`Đã chuyển "${course.name}" sang ${scoreData.semesters[toSem].name}`);
        saveAndRefresh();
      });
    });

    // Event: Edit button
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        editingCourse = { semIdx: parseInt(btn.dataset.sem), courseIdx: parseInt(btn.dataset.course) };
        renderDetail();
      });
    });

    // Event: Cancel button
    container.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        editingCourse = null;
        renderDetail();
      });
    });

    // Event: Save button
    container.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.sem);
        const ci = parseInt(btn.dataset.course);
        const course = scoreData.semesters[si].courses[ci];

        const val10 = document.getElementById('edit-10').value;
        const val4 = document.getElementById('edit-4').value;
        const valC = document.getElementById('edit-c').value.toUpperCase();

        course.diemTK10 = val10 ? parseFloat(val10) : null;
        course.diemTK4 = val4 ? parseFloat(val4) : null;
        course.diemTKC = valC;
        course.modified = true;

        if (course.diemTK10 !== null) {
          course.result = course.diemTK10 >= 4.0 ? 'pass' : 'fail';
        }

        editingCourse = null;
        saveAndRefresh();
        showToast('Đã cập nhật điểm giả định');
      });
    });
  }

  // ==================== NAVIGATION ====================
  function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update tabs
        document.querySelectorAll('.nav-item').forEach(b => {
          b.classList.remove('active', 'bg-card', 'text-primary');
          b.classList.add('text-muted');
        });
        btn.classList.add('active', 'bg-card', 'text-primary');
        btn.classList.remove('text-muted');

        // Update content
        document.querySelectorAll('.tab-content').forEach(t => {
          t.classList.remove('block');
          t.classList.add('hidden');
        });
        const tabId = 'tab-' + btn.dataset.tab;
        document.getElementById(tabId).classList.remove('hidden');
        document.getElementById(tabId).classList.add('block');
      });
    });
  }

  // ==================== ACTIONS ====================
  function setupActions() {
    document.getElementById('btn-exclude-english').addEventListener('click', () => {
      let count = 0;
      scoreData.semesters.forEach(s => s.courses.forEach(c => {
        if (ScoreUtils.isEnglish(c.code) && !c.excluded) { c.excluded = true; count++; }
      }));
      showToast(`Đã loại bỏ ${count} môn Tiếng Anh`);
      saveAndRefresh();
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      chrome.tabs.query({ url: "*://tienichsv.ou.edu.vn/*" }, (tabs) => {
        if (tabs.length === 0) {
          showToast('Không tìm thấy tab trang điểm. Vui lòng mở lại tienichsv.ou.edu.vn/#/diem');
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getScoreData' }, (response) => {
          if (response && response.success && response.data) {
            scoreData = response.data;
            // Apply default auto exclusions
            scoreData.semesters.forEach(s => s.courses.forEach(c => {
              c.excluded = ScoreUtils.isAutoExcluded(c.code);
            }));
            showToast('Đã khôi phục toàn bộ điểm và cấu trúc về mặc định');
            saveAndRefresh();
          } else {
            showToast('Lỗi khi lấy dữ liệu gốc. Hãy F5 trang điểm và thử lại.');
          }
        });
      });
    });

    document.getElementById('btn-dl-csv').addEventListener('click', () => {
      const csv = ScoreUtils.exportCSV(scoreData.semesters, scoreData.studentInfo);
      ScoreUtils.downloadCSV(csv, `bang_diem_${scoreData.studentInfo?.mssv || 'ou'}.csv`);
      showToast('Đã tải xuống file CSV');
    });

    const btnDlImg = document.getElementById('btn-dl-img');
    if (btnDlImg) {
      btnDlImg.addEventListener('click', () => {
        const originalText = btnDlImg.innerHTML;
        btnDlImg.innerHTML = '<span class="animate-pulse">Đang tạo ảnh...</span>';
        btnDlImg.disabled = true;

        const overviewTab = document.getElementById('tab-overview');
        const exportTab = document.getElementById('tab-export');

        // Show overview tab temporarily
        exportTab.classList.remove('block');
        exportTab.classList.add('hidden');
        overviewTab.classList.remove('hidden');
        overviewTab.classList.add('block');

        // Allow DOM and Chart to fully render
        setTimeout(() => {
          html2canvas(overviewTab, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: 1200
          }).then(canvas => {
            // Revert back
            overviewTab.classList.remove('block');
            overviewTab.classList.add('hidden');
            exportTab.classList.remove('hidden');
            exportTab.classList.add('block');

            btnDlImg.innerHTML = originalText;
            btnDlImg.disabled = false;

            ScoreUtils.downloadImage(canvas, `thong_ke_diem_${scoreData.studentInfo?.mssv || 'ou'}.png`);
            showToast('Đã tải xuống ảnh thống kê');
          }).catch(err => {
            console.error(err);
            overviewTab.classList.remove('block');
            overviewTab.classList.add('hidden');
            exportTab.classList.remove('hidden');
            exportTab.classList.add('block');

            btnDlImg.innerHTML = originalText;
            btnDlImg.disabled = false;
            showToast('Có lỗi xảy ra khi tạo ảnh');
          });
        }, 500);
      });
    }
  }

  // ==================== SEARCH & FILTER ====================
  function setupSearch() {
    document.getElementById('search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderDetail();
    });
  }

  function setupFilters() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => {
          c.classList.remove('bg-primary', 'text-white');
          c.classList.add('bg-white', 'text-gray-700');
        });
        chip.classList.add('bg-primary', 'text-white');
        chip.classList.remove('bg-white', 'text-gray-700');

        currentFilter = chip.dataset.filter;
        renderDetail();
      });
    });
  }

  // ==================== TOAST ====================
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-20');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-20');
    }, 3000);
  }
})();
