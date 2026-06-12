// content.js - Parse bảng điểm từ DOM trang tienichsv.ou.edu.vn

(function () {
  'use strict';

  // Patterns cho các môn tự động loại bỏ
  const AUTO_EXCLUDE_PATTERNS = [
    /^_BHYT/i,    // Bảo hiểm y tế
    /^MEETING/i,  // Sinh hoạt
    /^TEST/i,     // Lịch thi
    /^_SH/i,      // Sinh hoạt khác
    /^_KT/i,      // Khoản thu
  ];

  // Pattern cho môn Tiếng Anh
  const ENGLISH_PATTERN = /^GENG/i;

  function parseScoreTable() {
    const table = document.querySelector('#excel-table');
    if (!table) return null;

    const tbody = table.querySelector('tbody');
    if (!tbody) return null;

    const rows = tbody.querySelectorAll('tr');
    const semesters = [];
    let currentSemester = null;

    for (const row of rows) {
      // Check if this is a semester header row (lightgray background)
      const style = row.getAttribute('style') || '';
      if (style.includes('lightgray')) {
        const span = row.querySelector('span[style*="float: left"]') || row.querySelector('span');
        if (span) {
          currentSemester = {
            name: span.textContent.trim(),
            courses: [],
            summary: null
          };
          semesters.push(currentSemester);
        }
        continue;
      }

      // Check if this is a summary row (table-primary class)
      if (row.classList.contains('table-primary')) {
        if (currentSemester) {
          currentSemester.summary = parseSummaryRow(row);
        }
        continue;
      }

      // This should be a course row
      if (!currentSemester) continue;
      if (!row.classList.contains('ng-star-inserted')) continue;

      const tds = row.querySelectorAll('td');
      if (tds.length < 6) continue;

      // Parse course data from td elements
      const course = parseCourseRow(tds);
      if (course) {
        // Determine auto-exclude
        course.autoExcluded = shouldAutoExclude(course.code);
        course.isEnglish = ENGLISH_PATTERN.test(course.code.trim());
        course.excluded = course.autoExcluded; // Initially match auto-exclude
        currentSemester.courses.push(course);
      }
    }

    return {
      semesters: semesters,
      studentInfo: parseStudentInfo()
    };
  }

  function parseCourseRow(tds) {
    try {
      const tdArray = Array.from(tds);

      // Find the text-left td which is the course name
      let stt = '', code = '', group = '', name = '', credits = 0;
      let scores = { baiTap: null, quaTrinh: null, diemThi: null, t2: null };
      let diemTK10 = null, diemTK4 = null, diemTKC = '', result = '';

      // STT is always first
      stt = tdArray[0]?.textContent?.trim() || '';

      // Mã MH is the second td (text-nowrap align-middle)
      code = tdArray[1]?.textContent?.trim() || '';

      // Find the td index pattern based on class analysis
      let idx = 2;

      // Nhóm/Tổ
      group = tdArray[idx]?.textContent?.trim() || '';
      idx++;

      // Tên môn học (align-middle text-left)
      name = tdArray[idx]?.textContent?.trim() || '';
      idx++;

      // Số tín chỉ
      const creditText = tdArray[idx]?.textContent?.trim() || '0';
      credits = parseInt(creditText) || 0;
      idx++;

      // Score columns: Bài tập, Quá trình, Điểm thi, T2
      scores.baiTap = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;
      scores.quaTrinh = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;
      scores.diemThi = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;
      scores.t2 = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;

      // Điểm TK (10)
      diemTK10 = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;

      // Điểm TK (4)
      diemTK4 = parseFloat(tdArray[idx]?.textContent?.trim()) || null;
      idx++;

      // Điểm TK (C)
      diemTKC = tdArray[idx]?.textContent?.trim() || '';
      idx++;

      // Kết quả - check for fa-check or fa-times icon
      const resultTd = tdArray[idx];
      if (resultTd) {
        const checkIcon = resultTd.querySelector('.fa-check');
        const timesIcon = resultTd.querySelector('.fa-times');
        if (checkIcon) result = 'pass';
        else if (timesIcon) result = 'fail';
        else result = '';
      }

      return {
        stt, code, group, name, credits,
        scores, diemTK10, diemTK4, diemTKC, result
      };
    } catch (e) {
      console.error('Error parsing course row:', e);
      return null;
    }
  }

  function parseSummaryRow(row) {
    const summary = {};
    const tds = row.querySelectorAll('.td-cus');

    tds.forEach(td => {
      const label = td.textContent.trim();
      const valueTd = td.nextElementSibling;
      const value = valueTd ? valueTd.textContent.trim() : '';

      if (label.includes('trung bình học kỳ hệ 4') || label.includes('trung bình hệ 4')) {
        summary.dtbhk4 = parseFloat(value) || null;
      } else if (label.includes('tín chỉ đạt học kỳ')) {
        summary.tcDatHK = parseInt(value) || 0;
      } else if (label.includes('rèn luyện học kỳ')) {
        summary.diemRL_HK = parseFloat(value) || null;
      } else if (label.includes('loại điểm rèn luyện') && !label.includes('tích lũy')) {
        summary.xepLoaiRL = value;
      } else if (label.includes('trung bình tích lũy hệ 4')) {
        summary.dtbtl4 = parseFloat(value) || null;
      } else if (label.includes('tín chỉ tích lũy')) {
        summary.tcTichLuy = parseInt(value) || 0;
      } else if (label.includes('rèn luyện tích lũy')) {
        summary.diemRL_TL = parseFloat(value) || null;
      } else if (label.includes('Phân loại') || label.includes('phân loại')) {
        summary.phanLoai = value;
      }
    });

    return summary;
  }

  function parseStudentInfo() {
    const info = {};
    const printArea = document.querySelector('#printArea');
    if (printArea) {
      const pTags = printArea.querySelectorAll('p');
      pTags.forEach(p => {
        const text = p.textContent.trim();
        if (text.includes('Mã sinh viên')) {
          info.mssv = text.replace(/.*:\s*/, '').trim();
        } else if (text.includes('Họ và tên') || text.includes('tên')) {
          info.hoTen = text.replace(/.*:\s*/, '').trim();
        }
      });
    }
    return info;
  }

  function shouldAutoExclude(code) {
    const trimmed = code.trim();
    return AUTO_EXCLUDE_PATTERNS.some(pattern => pattern.test(trimmed));
  }

  // Listen for messages from popup/dashboard
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getScoreData') {
      const data = parseScoreTable();
      sendResponse({ success: !!data, data: data });
    }
    return true; // Keep message channel open for async response
  });
})();
