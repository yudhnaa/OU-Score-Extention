// popup.js - Popup logic with Tailwind and state sync

document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  const mainEl = document.getElementById('main-content');
  const errorMsg = document.getElementById('error-message');

  let scoreData = null;

  // Get current tab and request data from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('tienichsv.ou.edu.vn')) {
      showError('Vui lòng mở trang tienichsv.ou.edu.vn/#/diem');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'getScoreData' }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Không thể kết nối. Hãy reload trang và thử lại.');
        return;
      }

      if (!response || !response.success || !response.data) {
        showError('Không tìm thấy bảng điểm. Hãy đảm bảo bảng điểm đã hiển thị.');
        return;
      }

      const freshData = response.data;

      // Merge with local storage data
      chrome.storage.local.get('scoreData', (result) => {
        scoreData = ScoreUtils.mergeData(freshData, result.scoreData);
        
        // Save the merged data back to storage for dashboard to use
        chrome.storage.local.set({ scoreData: scoreData }, () => {
          renderData(scoreData);
        });
      });
    });
  });

  function showError(msg) {
    loadingEl.classList.add('hidden');
    errorMsg.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function renderData(data) {
    loadingEl.classList.add('hidden');
    mainEl.classList.remove('hidden');
    mainEl.classList.add('flex');

    const { semesters, studentInfo } = data;

    // Student info
    if (studentInfo) {
      document.getElementById('student-name').textContent = studentInfo.hoTen || '—';
      document.getElementById('student-id').textContent = `MSSV: ${studentInfo.mssv || '—'}`;
    }

    // Calculate GPA
    const cumGPA4 = ScoreUtils.calcCumulativeGPA4(semesters);
    const cumGPA10 = ScoreUtils.calcCumulativeGPA10(semesters);
    const totalCredits = ScoreUtils.calcTotalCredits(semesters);
    const classify = ScoreUtils.classifyGPA4(cumGPA4);

    document.getElementById('gpa-cum-4').textContent = cumGPA4 !== null ? cumGPA4.toFixed(2) : '—';
    document.getElementById('gpa-cum-10').textContent = cumGPA10 !== null ? cumGPA10.toFixed(2) : '—';
    document.getElementById('gpa-classify').textContent = classify;
    document.getElementById('total-credits').textContent = `${totalCredits} tín chỉ`;
    document.getElementById('sem-count').textContent = `${semesters.length} kỳ`;

    // Semester list
    const listEl = document.getElementById('semester-list');
    listEl.innerHTML = '';

    semesters.forEach(sem => {
      const gpa4 = ScoreUtils.calcSemesterGPA4(sem.courses);
      const credits = sem.courses.filter(c => !c.excluded && c.credits > 0 && c.result === 'pass')
        .reduce((sum, c) => sum + c.credits, 0);

      const item = document.createElement('div');
      item.className = 'flex items-center justify-between p-2.5 bg-card rounded-md border border-gray-100 hover:border-gray-300 transition-colors cursor-default';
      item.innerHTML = `
        <span class="text-xs font-medium text-gray-900 truncate mr-2" title="${sem.name}">${sem.name}</span>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-sm font-bold text-primary">${gpa4 !== null ? gpa4.toFixed(2) : '—'}</span>
          <span class="text-xs text-muted w-10 text-right">${credits} TC</span>
        </div>
      `;
      listEl.appendChild(item);
    });
  }

  // Open Dashboard in new window
  document.getElementById('btn-open-dashboard').addEventListener('click', () => {
    if (!scoreData) return;

    const dashUrl = chrome.runtime.getURL('dashboard.html');
    chrome.windows.create({
      url: dashUrl,
      type: 'popup',
      width: 1400,
      height: 850
    }, () => {
      // Đóng popup sau khi mở dashboard
      window.close();
    });
  });
});
