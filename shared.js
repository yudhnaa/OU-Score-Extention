// shared.js - Shared utilities for GPA calculation

const ScoreUtils = {
  // Auto-exclude patterns
  AUTO_EXCLUDE_PATTERNS: [
    /^_BHYT/i,
    /^MEETING/i,
    /^TEST/i,
    /^_SH/i,
    /^_KT/i,
  ],

  ENGLISH_PATTERN: /^GENG/i,

  isAutoExcluded(code) {
    return this.AUTO_EXCLUDE_PATTERNS.some(p => p.test(code.trim()));
  },

  isEnglish(code) {
    return this.ENGLISH_PATTERN.test(code.trim());
  },

  /**
   * Tính ĐTBHK hệ 4 cho 1 kỳ
   * Công thức: Σ(Điểm TK(4) × TC) / Σ(TC)
   * Chỉ tính môn có credits > 0, có điểm, và không bị loại bỏ
   */
  calcSemesterGPA4(courses) {
    let totalWeighted = 0;
    let totalCredits = 0;

    courses.forEach(c => {
      if (c.excluded) return;
      if (c.credits <= 0) return;
      if (c.diemTK4 === null || c.diemTK4 === undefined || isNaN(c.diemTK4)) return;

      totalWeighted += c.diemTK4 * c.credits;
      totalCredits += c.credits;
    });

    if (totalCredits === 0) return null;
    return Math.round((totalWeighted / totalCredits) * 100) / 100;
  },

  /**
   * Tính ĐTBHK hệ 10 cho 1 kỳ
   */
  calcSemesterGPA10(courses) {
    let totalWeighted = 0;
    let totalCredits = 0;

    courses.forEach(c => {
      if (c.excluded) return;
      if (c.credits <= 0) return;
      if (c.diemTK10 === null || c.diemTK10 === undefined || isNaN(c.diemTK10)) return;

      totalWeighted += c.diemTK10 * c.credits;
      totalCredits += c.credits;
    });

    if (totalCredits === 0) return null;
    return Math.round((totalWeighted / totalCredits) * 100) / 100;
  },

  /**
   * Tính ĐTBTL (tích lũy) cho tất cả các kỳ
   */
  calcCumulativeGPA4(semesters) {
    let totalWeighted = 0;
    let totalCredits = 0;

    semesters.forEach(sem => {
      sem.courses.forEach(c => {
        if (c.excluded) return;
        if (c.credits <= 0) return;
        if (c.diemTK4 === null || c.diemTK4 === undefined || isNaN(c.diemTK4)) return;

        totalWeighted += c.diemTK4 * c.credits;
        totalCredits += c.credits;
      });
    });

    if (totalCredits === 0) return null;
    return Math.round((totalWeighted / totalCredits) * 100) / 100;
  },

  calcCumulativeGPA10(semesters) {
    let totalWeighted = 0;
    let totalCredits = 0;

    semesters.forEach(sem => {
      sem.courses.forEach(c => {
        if (c.excluded) return;
        if (c.credits <= 0) return;
        if (c.diemTK10 === null || c.diemTK10 === undefined || isNaN(c.diemTK10)) return;

        totalWeighted += c.diemTK10 * c.credits;
        totalCredits += c.credits;
      });
    });

    if (totalCredits === 0) return null;
    return Math.round((totalWeighted / totalCredits) * 100) / 100;
  },

  /**
   * Tổng tín chỉ tích lũy (không bị loại bỏ, có điểm đạt)
   */
  calcTotalCredits(semesters) {
    let total = 0;
    semesters.forEach(sem => {
      sem.courses.forEach(c => {
        if (c.excluded) return;
        if (c.credits <= 0) return;
        if (c.result !== 'pass') return;
        total += c.credits;
      });
    });
    return total;
  },

  /**
   * Xếp loại GPA hệ 4
   */
  classifyGPA4(gpa) {
    if (gpa === null) return '';
    if (gpa >= 3.6) return 'Xuất sắc';
    if (gpa >= 3.2) return 'Giỏi';
    if (gpa >= 2.5) return 'Khá';
    if (gpa >= 2.0) return 'Trung bình';
    if (gpa >= 1.0) return 'Yếu';
    return 'Kém';
  },

  /**
   * Xuất CSV
   */
  exportCSV(semesters, studentInfo) {
    let csv = '\uFEFF'; // BOM for Excel UTF-8
    csv += 'BẢNG ĐIỂM SINH VIÊN\n';
    if (studentInfo) {
      csv += `MSSV,${studentInfo.mssv || ''}\n`;
      csv += `Họ và tên,${studentInfo.hoTen || ''}\n`;
    }
    csv += '\n';

    semesters.forEach(sem => {
      csv += `${sem.name}\n`;
      csv += 'STT,Mã MH,Nhóm,Tên môn học,Tín chỉ,Bài tập,Quá trình,Điểm thi,T2,Điểm TK(10),Điểm TK(4),Điểm TK(C),Kết quả,Loại bỏ\n';

      sem.courses.forEach((c, i) => {
        const row = [
          i + 1,
          c.code,
          c.group,
          `"${c.name}"`,
          c.credits,
          c.scores?.baiTap ?? '',
          c.scores?.quaTrinh ?? '',
          c.scores?.diemThi ?? '',
          c.scores?.t2 ?? '',
          c.diemTK10 ?? '',
          c.diemTK4 ?? '',
          c.diemTKC,
          c.result === 'pass' ? 'Đạt' : c.result === 'fail' ? 'Không đạt' : '',
          c.excluded ? 'Có' : ''
        ];
        csv += row.join(',') + '\n';
      });

      const gpa4 = ScoreUtils.calcSemesterGPA4(sem.courses);
      const gpa10 = ScoreUtils.calcSemesterGPA10(sem.courses);
      csv += `ĐTBHK hệ 4:,${gpa4 ?? ''},ĐTBHK hệ 10:,${gpa10 ?? ''}\n\n`;
    });

    const cumGPA4 = ScoreUtils.calcCumulativeGPA4(semesters);
    const cumGPA10 = ScoreUtils.calcCumulativeGPA10(semesters);
    const totalCredits = ScoreUtils.calcTotalCredits(semesters);
    csv += `\nĐTBTL hệ 4:,${cumGPA4 ?? ''}\n`;
    csv += `ĐTBTL hệ 10:,${cumGPA10 ?? ''}\n`;
    csv += `Tổng tín chỉ tích lũy:,${totalCredits}\n`;
    csv += `Xếp loại:,${ScoreUtils.classifyGPA4(cumGPA4)}\n`;

    return csv;
  },

  downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'bang_diem.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  downloadImage(canvas, filename) {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'thong_ke_diem.png';
    a.click();
  },

  /**
   * Merge fresh data from page with local stored data (to keep exclusions/moves)
   */
  mergeData(freshData, localData) {
    if (!localData || !localData.semesters) return freshData;
    if (freshData.studentInfo?.mssv !== localData.studentInfo?.mssv) return freshData;

    // Count total courses
    let freshCount = 0;
    freshData.semesters.forEach(s => freshCount += s.courses.length);
    
    let localCount = 0;
    localData.semesters.forEach(s => localCount += s.courses.length);

    // If counts differ (new courses added), use fresh data
    if (freshCount !== localCount) return freshData;

    // Otherwise, we use the local data because it contains custom semester arrangements and exclude flags
    // But we should update the actual scores from freshData just in case grades changed.
    // For simplicity and since grades rarely change after published, returning localData is usually safe,
    // but a proper merge maps course grades over while keeping local placement/flags.
    
    // Create a map of fresh courses by code
    const freshCoursesMap = {};
    freshData.semesters.forEach(sem => {
      sem.courses.forEach(c => {
        freshCoursesMap[c.code] = c;
      });
    });

    // Update localData with any fresh score changes, unless the score was manually modified by user
    localData.semesters.forEach(sem => {
      sem.courses.forEach(localC => {
        const freshC = freshCoursesMap[localC.code];
        if (freshC && !localC.modified) {
          // Update scores only
          localC.scores = freshC.scores;
          localC.diemTK10 = freshC.diemTK10;
          localC.diemTK4 = freshC.diemTK4;
          localC.diemTKC = freshC.diemTKC;
          localC.result = freshC.result;
        }
      });
    });

    return localData;
  }
};

// Make available globally
if (typeof window !== 'undefined') {
  window.ScoreUtils = ScoreUtils;
}
