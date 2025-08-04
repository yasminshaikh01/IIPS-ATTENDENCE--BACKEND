const ExcelJS = require('exceljs');
const Student = require('../models/Student');
const Course = require('../models/Course');
const bcrypt = require("bcryptjs");
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const AttendanceSummary = require('../models/AttendanceSummary');
const Teacher=require('../models/Teacher');

// Get subjects with no attendance records for ALL courses
exports.getAllUnmarkedAttendanceReport = async (req, res) => {
  try {
    console.log('Generating comprehensive unmarked attendance report for all courses');

    // Step 1: Get all unique course and semester combinations
    const coursesSemesters = await Subject.aggregate([
      {
        $group: {
          _id: {
            courseId: "$Course_ID",
            semId: "$Sem_Id"
          },
          subjectCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          "_id.courseId": 1,
          "_id.semId": 1
        }
      }
    ]);

    console.log(`Found ${coursesSemesters.length} course-semester combinations`);

    if (coursesSemesters.length === 0) {
      return res.status(404).json({ 
        message: 'No subjects found in the database' 
      });
    }

    // Step 2: Get all courses for name mapping
    const allCourses = await Course.find({});
    const courseMap = {};
    allCourses.forEach(course => {
      courseMap[course.Course_Id] = course.Course_Name;
    });

    // Step 3: Get all attendance records
    const allAttendanceRecords = await Attendance.find({}).distinct('subjectCode');
    console.log(`Found attendance records for ${allAttendanceRecords.length} subjects`);

    // Step 4: Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('All Unmarked Attendance');

    // Set up headers
    const headers = [
      'Course ID',
      'Course Name', 
      'Semester ID',
      'Subject Code',
      'Subject Name',
      'Specialization',
      'Semester Type',
      'Year',
      'Has Sections',
      'Applicable Sections',
      'Status'
    ];

    worksheet.addRow(headers);

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    let totalUnmarkedSubjects = 0;
    let totalSubjects = 0;

    // Step 5: Process each course-semester combination
    for (const courseSem of coursesSemesters) {
      const { courseId, semId } = courseSem._id;
      
      console.log(`Processing ${courseId} - ${semId}`);

      // Get all subjects for this course-semester
      const subjects = await Subject.find({
        Course_ID: courseId,
        Sem_Id: semId
      });

      totalSubjects += subjects.length;

      // Check if students in this course/semester have sections
      const studentsWithSections = await Student.find({
        courseId: courseId,
        semId: semId,
        section: { $ne: null, $exists: true, $ne: '' }
      });

      const hasSections = studentsWithSections.length > 0;
      
      // Get unique sections for this course-semester if they exist
      let allSections = [];
      if (hasSections) {
        allSections = await Student.find({
          courseId: courseId,
          semId: semId
        }).distinct('section');
        allSections = allSections.filter(section => section && section.trim() !== '');
      }

      // Process each subject
      for (const subject of subjects) {
        const hasAttendance = allAttendanceRecords.includes(subject.Sub_Code);
        
        if (!hasAttendance) {
          totalUnmarkedSubjects++;
          
          // Determine applicable sections for this subject
          let applicableSections = [];
          
          if (hasSections) {
            if (subject.Specialization) {
              // Find students with this specialization and get their sections
              const studentsWithSpec = await Student.find({
                courseId: courseId,
                semId: semId,
                specializations: { $in: [subject.Specialization] }
              }).distinct('section');
              applicableSections = studentsWithSpec.filter(section => section && section.trim() !== '');
            } else {
              // General subject - applies to all sections
              applicableSections = allSections;
            }
          }

          const sectionsText = applicableSections.length > 0 
            ? applicableSections.join(', ') 
            : (hasSections ? 'None' : 'No Sections');

          // Add row to Excel
          worksheet.addRow([
            courseId,
            courseMap[courseId] || 'Unknown Course',
            semId,
            subject.Sub_Code,
            subject.Sub_Name,
            subject.Specialization || 'General',
            subject.Semester,
            subject.Year,
            hasSections ? 'Yes' : 'No',
            sectionsText,
            'No Attendance Records'
          ]);
        }
      }
    }

    // Step 6: Add summary at the top (insert rows)
    worksheet.spliceRows(2, 0, 
      ['=== SUMMARY ===', '', '', '', '', '', '', '', '', '', ''],
      [`Total Subjects: ${totalSubjects}`, '', '', '', '', '', '', '', '', '', ''],
      [`Subjects Without Attendance: ${totalUnmarkedSubjects}`, '', '', '', '', '', '', '', '', '', ''],
      [`Subjects With Attendance: ${totalSubjects - totalUnmarkedSubjects}`, '', '', '', '', '', '', '', '', '', ''],
      [`Report Generated: ${new Date().toLocaleString()}`, '', '', '', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', ''],
      ['=== DETAILED REPORT ===', '', '', '', '', '', '', '', '', '', '']
    );

    // Style summary rows
    for (let i = 2; i <= 8; i++) {
      const row = worksheet.getRow(i);
      if (i === 2 || i === 8) {
        row.font = { bold: true, size: 12 };
      } else if (i !== 7) {
        row.font = { bold: true };
      }
    }

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50);
    });

    // Add borders and alternate row colors for better readability
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 8) { // Skip summary rows
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
        
        // Alternate row colors
        if ((rowNumber - 8) % 2 === 0) {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5F5' }
          };
        }
      }
    });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `all_unmarked_attendance_${timestamp}.xlsx`;

    // Set response headers for download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

    console.log(`Report generated successfully. ${totalUnmarkedSubjects} unmarked subjects found out of ${totalSubjects} total subjects.`);

  } catch (error) {
    console.error('Error generating comprehensive unmarked attendance report:', error);
    return res.status(500).json({ 
      message: 'Server error generating report',
      error: error.message 
    });
  }
};

// Get summary data for all courses without Excel download
exports.getAllUnmarkedAttendanceSummary = async (req, res) => {
  try {
    console.log('Generating summary of all unmarked attendance');

    // Get all subjects
    const allSubjects = await Subject.find({});
    const totalSubjects = allSubjects.length;

    // Get all attendance records
    const allAttendanceRecords = await Attendance.find({}).distinct('subjectCode');
    const subjectsWithAttendance = allAttendanceRecords.length;

    // Find unmarked subjects
    const unmarkedSubjects = allSubjects.filter(subject => 
      !allAttendanceRecords.includes(subject.Sub_Code)
    );

    // Group by course and semester
    const summaryByCourse = {};
    
    for (const subject of allSubjects) {
      const key = `${subject.Course_ID}-${subject.Sem_Id}`;
      if (!summaryByCourse[key]) {
        summaryByCourse[key] = {
          courseId: subject.Course_ID,
          semId: subject.Sem_Id,
          totalSubjects: 0,
          unmarkedSubjects: 0
        };
      }
      summaryByCourse[key].totalSubjects++;
      
      if (!allAttendanceRecords.includes(subject.Sub_Code)) {
        summaryByCourse[key].unmarkedSubjects++;
      }
    }

    return res.status(200).json({
      overallSummary: {
        totalSubjects,
        subjectsWithAttendance,
        subjectsWithoutAttendance: unmarkedSubjects.length,
        completionPercentage: Math.round((subjectsWithAttendance / totalSubjects) * 100)
      },
      byCourse: Object.values(summaryByCourse),
      unmarkedSubjectsList: unmarkedSubjects.map(subject => ({
        courseId: subject.Course_ID,
        semId: subject.Sem_Id,
        subjectCode: subject.Sub_Code,
        subjectName: subject.Sub_Name,
        specialization: subject.Specialization || 'General'
      }))
    });

  } catch (error) {
    console.error('Error getting comprehensive unmarked attendance summary:', error);
    return res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
};