
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const AttendanceSummary = require('../models/AttendanceSummary');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Subject = require('../models/Subject');
const bcrypt = require("bcryptjs");
const emailService = require('../config/nodemailer');

// Get all subjects for a course and semester
exports.getSubjects = async (req, res) => {
  const { course, semester, specialization } = req.body;

  if (!course || !semester) {
    return res.status(400).json({ message: 'Course and semester are required' });
  }

  try {
    // Find course by Course_Name to get Course_Id
    const courseDoc = await Course.findOne({ Course_Name: course });
    if (!courseDoc) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Build the query
    const query = {
      Course_ID: courseDoc.Course_Id,
      Sem_Id: semester
    };

    // Add specialization if provided
    if (specialization) {
      query.Specialization = specialization;
    }

    const subjects = await Subject.find(query);
    res.status(200).json(subjects);
  } catch (err) {
    console.error('Error fetching subjects:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get students by course and semester
// Get students by course and semester (optimized)
exports.getStudentsByCourseAndSemester = async (req, res) => {
  try {
    const { className, semester_id, specialization, section } = req.body;

    if (!className || !semester_id) {
      return res.status(400).json({ message: "Class name and semester ID are required" });
    }

    // Step 1: Get course ID directly
    const course = await Course.findOne({ Course_Name: className }, { Course_Id: 1 }).lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Step 2: Build query
    const query = {
      courseId: course.Course_Id,
      semId: semester_id
    };
    if (specialization?.trim()) {
      query.specializations = specialization; // no need for $in if it's a single value
    }
    if (section?.trim()) {
      query.section = section;
    }

    // Step 3: Aggregation
    const students = await Student.aggregate([
      { $match: query },
      {
        $set: {
          splitRoll: { $split: ["$rollNumber", "-"] }
        }
      },
      {
        $set: {
          yearPart: {
            $toInt: { $substr: [{ $arrayElemAt: ["$splitRoll", 1] }, 2, 2] }
          },
          numericRoll: {
            $toInt: { $arrayElemAt: ["$splitRoll", 2] }
          }
        }
      },
      { $sort: { yearPart: 1, numericRoll: 1 } },
      { $unset: ["yearPart", "numericRoll", "splitRoll"] }
    ]);

    return res.status(200).json(students);
  } catch (error) {
    console.error("Error fetching students:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Submit new attendance
const getCurrentAcademicYear = () => {
  const year = new Date().getFullYear();
  return `${year}-${(year + 1).toString().slice(-2)}`;
};

exports.submitAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { courseName, semId, subjectCode, date, attendance, specialization, section } = req.body;

    if (!courseName || !semId || !subjectCode || !date || !attendance) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const course = await Course.findOne({ Course_Name: courseName });
    const courseId = course ? course.Course_Id : null;
    const academicYear = getCurrentAcademicYear();

    // 1️⃣ Validate students in bulk
    const validStudents = await Student.find({
      _id: { $in: attendance.map(a => a.studentId) },
      ...(specialization ? { specializations: { $in: [specialization] } } : {}),
      ...(section ? { section } : {})
    }).session(session);

    const validStudentIds = new Set(validStudents.map(s => s._id.toString()));

    // 2️⃣ Bulk insert into Attendance
    const attendanceOps = attendance
      .filter(r => validStudentIds.has(r.studentId.toString()))
      .map(r => ({
        updateOne: {
          filter: { studentId: r.studentId, subjectCode },
          update: {
            $setOnInsert: { studentId: r.studentId, subjectCode },
            $push: { records: { date: new Date(date), present: r.present } }
          },
          upsert: true
        }
      }));

    if (attendanceOps.length > 0) {
      await Attendance.bulkWrite(attendanceOps, { session });
    }

    // 3️⃣ Bulk insert/update AttendanceSummary
    const summaryOps = attendance
      .filter(r => validStudentIds.has(r.studentId.toString()))
      .map(r => ({
        updateOne: {
          filter: { studentId: r.studentId, courseId, semId, subjectCode, academicYear },
          update: {
            $inc: { totalClasses: 1, attendedClasses: r.present ? 1 : 0 },
            $set: { lastUpdated: new Date() },
            $setOnInsert: { studentId: r.studentId, courseId, semId, subjectCode, academicYear }
          },
          upsert: true
        }
      }));

    if (summaryOps.length > 0) {
      await AttendanceSummary.bulkWrite(summaryOps, { session });
    }

    await session.commitTransaction();
    session.endSession();
    return res.status(201).json({ message: 'Attendance submitted successfully' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error submitting attendance:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


// Get attendance by course, semester, subject, and academic year with optional filters
exports.getAttendanceByCourseAndSubject = async (req, res) => {
  try {
    const { course, semester, subject, academicYear, specialization, section, startDate, endDate } = req.body;
    console.log('Query params:', { course, semester, subject, academicYear, specialization, section, startDate, endDate });

    // Step 1: Build student query
    const studentQuery = {
      courseId: course,
      semId: semester
    };

    if (specialization && specialization.trim() !== '') {
      studentQuery.specializations = { $in: [specialization] };
    }

    if (section && section.trim() !== '') {
      studentQuery.section = section;
    }

    console.log('Student query:', JSON.stringify(studentQuery));

    // Step 2: Fetch students
    const students = await Student.find(studentQuery);

    if (students.length === 0) {
      return res.status(404).json({
        message: 'No students found for this course, semester, and filters',
        filters: { course, semester, specialization, section }
      });
    }

    const studentIds = students.map(s => s._id);

    // Step 3: Build aggregation pipeline
    const pipeline = [
      { $match: { studentId: { $in: studentIds }, subjectCode: subject } },
      { $unwind: "$records" },
    ];

    // Apply date filter if provided
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      pipeline.push({ $match: { "records.date": dateFilter } });
    }

    // Group by studentId and calculate totals
    pipeline.push({
      $group: {
        _id: "$studentId",
        total: { $sum: 1 },
        attended: { $sum: { $cond: ["$records.present", 1, 0] } }
      }
    });

    const aggregated = await Attendance.aggregate(pipeline);

    // Step 4: Map aggregation results back to students
    const attendanceMap = new Map();
    aggregated.forEach(doc => {
      attendanceMap.set(doc._id.toString(), {
        attended: doc.attended,
        total: doc.total
      });
    });

    const attendanceSummaries = students.map(student => {
      const summary = attendanceMap.get(student._id.toString()) || { attended: 0, total: 0 };
      return {
        studentId: student._id,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        courseId: student.courseId,
        semId: student.semId,
        specializations: student.specializations || [],
        section: student.section || '',
        subjectCode: subject,
        academicYear,
        classesAttended: summary.attended,
        totalClasses: summary.total,
        attendancePercentage: summary.total > 0 ? Math.round((summary.attended / summary.total) * 100) : 0
      };
    });

    // Sort by roll number
    attendanceSummaries.sort((a, b) => {
      return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
    });

    return res.status(200).json({
      students: attendanceSummaries,
      totalStudents: attendanceSummaries.length,
      filters: { course, semester, subject, academicYear, specialization, section, startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching attendance by course and subject:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getStudentAttendanceDetail = async (req, res) => {
  try {
    const { studentId, subject } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      console.error('Invalid student ID:', studentId);
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    const query = {
      studentId: new mongoose.Types.ObjectId(studentId),
      subjectCode: subject.trim(),
    };

    console.log('Searching attendance with query:', JSON.stringify(query, null, 2));

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const attendanceDoc = await Attendance.findOne(query);

    if (!attendanceDoc || !Array.isArray(attendanceDoc.records) || attendanceDoc.records.length === 0) {
      console.log('No attendance records found for student:', studentId, 'and subject:', subject);
      return res.status(200).json([]);
    }

    // Filter by date range if startDate and/or endDate are provided
    let filteredRecords = attendanceDoc.records;

    if (startDate || endDate) {
      const from = startDate ? new Date(startDate) : new Date('1970-01-01');
      const to = endDate ? new Date(endDate) : new Date(); // current date if endDate is not provided

      filteredRecords = filteredRecords.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= from && recordDate <= to;
      });
    }

    const formattedRecords = filteredRecords
      .map(record => ({
        date: record.date,
        present: record.present
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json(formattedRecords);

  } catch (error) {
    console.error('Error fetching student attendance details:', error);
    return res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
};


  
  // Get student information
  exports.getStudentById = async (req, res) => {
    try {
      const { id } = req.params;
      
      const student = await Student.findById(id).select('-password'); // Exclude password
      
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      
      return res.status(200).json(student);
    } catch (error) {
      console.error('Error fetching student information:', error);
      return res.status(500).json({ message: 'Server error' });
    }
  };

// Controller to send low attendance notifications
// Controller to send low attendance notifications
exports.sendLowAttendanceNotifications = async (req, res) => {
  try {
    const { attendanceSummary, threshold } = req.body;
    
    if (!attendanceSummary || !threshold) {
      return res.status(400).json({ message: 'Missing required data' });
    }

    // Filter students below threshold
    const lowAttendanceStudents = attendanceSummary.filter(record => {
      const percentage = (record.classesAttended / record.totalClasses) * 100;
      return percentage < threshold;
    });

    if (lowAttendanceStudents.length === 0) {
      return res.status(200).json({ 
        message: 'No students found below the threshold', 
        sentCount: 0 
      });
    }

    // Get subject name for the email
    const firstRecord = attendanceSummary[0];
    let subjectName = firstRecord.subject;

    // For each student, fetch their email and send notification
    let successCount = 0;
    let failedCount = 0;

    for (const student of lowAttendanceStudents) {
      try {
        // Fetch student details using _id
        const studentData = await Student.findOne({ _id: student.studentId });

        if (!studentData || !studentData.email) {
          console.log(`No email found for student ${student.studentName}`);
          failedCount++;
          continue;
        }

        const attendancePercentage = ((student.classesAttended / student.totalClasses) * 100).toFixed(2);
        const attendanceGap = threshold - attendancePercentage;
        const classesNeeded = calculateClassesNeeded(student.classesAttended, student.totalClasses, threshold);

        await sendLowAttendanceEmail(
          studentData.email,
          studentData.fullName,
          studentData.rollNumber,
          subjectName,
          attendancePercentage,
          threshold,
          attendanceGap,
          student.classesAttended,
          student.totalClasses,
          classesNeeded
        );

        successCount++;
      } catch (error) {
        console.error(`Error sending notification to ${student.studentName}:`, error);
        failedCount++;
      }
    }

    return res.status(200).json({
      message: 'Notifications processed',
      sentCount: successCount,
      failedCount: failedCount,
      totalProcessed: lowAttendanceStudents.length
    });

  } catch (error) {
    console.error('Error in sendLowAttendanceNotifications:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

  
  // Calculate how many consecutive classes a student needs to attend to reach the threshold
  function calculateClassesNeeded(present, total, threshold) {
    const currentPercentage = (present / total) * 100;
    
    if (currentPercentage >= threshold) return 0;
    
    let additionalClasses = 0;
    let newTotal = total;
    let newPresent = present;
    
    while ((newPresent / newTotal) * 100 < threshold) {
      additionalClasses++;
      newPresent++;
      newTotal++;
    }
    
    return additionalClasses;
  }
  
  // Function to send the low attendance email
  async function sendLowAttendanceEmail(
    email, 
    studentName, 
    rollNumber, 
    subject, 
    currentPercentage, 
    threshold, 
    gap, 
    present, 
    total,
    classesNeeded
  ) {
    // Format the email with HTML for better readability
    const emailSubject = `⚠️ IMPORTANT: Low Attendance Warning for ${subject}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 5px solid #dc3545;">
          <h2 style="color: #721c24; margin-top: 0;">Low Attendance Alert</h2>
          <p style="margin-bottom: 0;">This is an important notification regarding your attendance in ${subject}.</p>
        </div>
        
        <p>Dear <strong>${studentName}</strong> (Roll No: ${rollNumber}),</p>
        
        <p>We are writing to inform you that your current attendance in <strong>${subject}</strong> has fallen below the acceptable threshold.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Your current attendance:</strong> ${currentPercentage}% (${present} out of ${total} classes)</p>
          <p style="margin: 5px 0;"><strong>Required attendance threshold:</strong> ${threshold}%</p>
          <p style="margin: 5px 0;"><strong>Gap to minimum requirement:</strong> ${gap.toFixed(2)}%</p>
          <p style="margin: 5px 0;"><strong>Classes you need to attend consecutively:</strong> ${classesNeeded}</p>
        </div>
        
        <p><strong>Important:</strong> As per institutional policy, students with attendance below 75% may be prevented from taking examinations or may be subject to other academic penalties.</p>
        
        <div style="margin: 20px 0;">
          <h3>Actions Required:</h3>
          <ol>
            <li>Ensure regular attendance in all upcoming classes</li>
            <li>Meet with your course instructor to discuss your situation</li>
            <li>If you have legitimate reasons for absences (medical or otherwise), please submit appropriate documentation to the administration office</li>
          </ol>
        </div>
        
        <p>Please take this notification seriously and take immediate steps to improve your attendance. If you have any questions or need assistance, please contact your course instructor or the academic office.</p>
        
        <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          <p style="margin: 5px 0;">Regards,</p>
          <p style="margin: 5px 0;"><strong>Academic Administration</strong></p>
          <p style="margin: 5px 0; color: #666; font-size: 0.9em;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    `;
    
    try {
      await emailService.sendAttendanceEmail(
        email,
        emailSubject,
        emailHtml
      );
      return true;
    } catch (error) {
      console.error('Error sending attendance email:', error);
      throw error;
    }
  }

// delete attendance (optimized)
exports.deleteAttendance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { courseId, semId, subjectCode, date, specialization, section } = req.body;

    if (!courseId || !semId || !subjectCode || !date) {
      return res.status(400).json({ message: 'courseId, semId, subjectCode, and date are required' });
    }

    const academicYear = getCurrentAcademicYear();
    const targetDate = new Date(date + 'T00:00:00.000Z');

    // Step 1: Build student filter (optional filters applied here)
    const studentQuery = {};
    if (specialization && specialization.trim() !== '') {
      studentQuery.specializations = { $in: [specialization] };
    }
    if (section && section.trim() !== '') {
      studentQuery.section = section;
    }

    const students = await Student.find(studentQuery, { _id: 1 }).lean();
    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found matching the criteria' });
    }

    const studentIds = students.map(s => s._id);

    // Step 2: Start transaction
    await session.withTransaction(async () => {
      // --- A) Remove attendance records for the given date ---
      const attendances = await Attendance.find({
        studentId: { $in: studentIds },
        subjectCode,
        "records.date": targetDate
      }).session(session);

      if (attendances.length === 0) {
        throw new Error("No attendance records found for given date");
      }

      let deletedCount = 0;
      let updatedSummaries = 0;
      const attendanceOps = [];
      const summaryOps = [];

      for (const att of attendances) {
        const recordIndex = att.records.findIndex(r => r.date.toDateString() === targetDate.toDateString());
        if (recordIndex === -1) continue;

        const wasPresent = att.records[recordIndex].present;
        att.records.splice(recordIndex, 1);

        if (att.records.length === 0) {
          attendanceOps.push({
            deleteOne: { filter: { _id: att._id } }
          });
        } else {
          attendanceOps.push({
            updateOne: {
              filter: { _id: att._id },
              update: { $set: { records: att.records } }
            }
          });
        }
        deletedCount++;

        // --- B) Update summaries ---
        const summary = await AttendanceSummary.findOne({
          studentId: att.studentId,
          courseId,
          semId,
          subjectCode,
          academicYear
        }).session(session);

        if (summary) {
          summary.totalClasses = Math.max(0, summary.totalClasses - 1);
          if (wasPresent) summary.attendedClasses = Math.max(0, summary.attendedClasses - 1);

          if (summary.totalClasses === 0) {
            summaryOps.push({ deleteOne: { filter: { _id: summary._id } } });
          } else {
            summaryOps.push({
              updateOne: {
                filter: { _id: summary._id },
                update: {
                  $set: {
                    totalClasses: summary.totalClasses,
                    attendedClasses: summary.attendedClasses,
                    attendancePercentage: parseFloat(((summary.attendedClasses / summary.totalClasses) * 100).toFixed(2)),
                    lastUpdated: new Date()
                  }
                }
              }
            });
            updatedSummaries++;
          }
        }
      }

      // --- C) Execute bulk ops ---
      if (attendanceOps.length > 0) {
        await Attendance.bulkWrite(attendanceOps, { session });
      }
      if (summaryOps.length > 0) {
        await AttendanceSummary.bulkWrite(summaryOps, { session });
      }

      // Respond inside transaction block only if success
      res.status(200).json({
        message: "Attendance deleted successfully",
        deletedRecords: deletedCount,
        updatedSummaries
      });
    }, { maxCommitTimeMS: 120000 });

  } catch (error) {
    console.error("Error deleting attendance:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// merge attendance (optimized, max present kept)
exports.mergeAttendance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { courseId, semId, subjectCode, date, specialization, section, finalCount } = req.body;

    if (!courseId || !semId || !subjectCode || !date || !finalCount) {
      return res.status(400).json({
        message: "courseId, semId, subjectCode, date, and finalCount are required"
      });
    }

    if (finalCount < 1) {
      return res.status(400).json({ message: "finalCount must be at least 1" });
    }

    const academicYear = getCurrentAcademicYear();
    const targetDate = new Date(date + "T00:00:00.000Z");

    // Step 1: Find matching students
    const studentQuery = {};
    if (specialization && specialization.trim() !== "") {
      studentQuery.specializations = { $in: [specialization] };
    }
    if (section && section.trim() !== "") {
      studentQuery.section = section;
    }

    const students = await Student.find(studentQuery, { _id: 1 }).lean();
    if (students.length === 0) {
      return res.status(404).json({ message: "No students found matching the criteria" });
    }

    const studentIds = students.map(s => s._id);

    // Step 2: Transaction
    await session.withTransaction(async () => {
      const attendances = await Attendance.find({
        studentId: { $in: studentIds },
        subjectCode,
        "records.date": targetDate
      }).session(session);

      if (attendances.length === 0) {
        throw new Error("No attendance records found for given date");
      }

      const attendanceOps = [];
      const summaryOps = [];

      let processedStudents = 0;
      let updatedSummaries = 0;
      let mergeStats = {
        studentsWithRecords: 0,
        totalRecordsRemoved: 0,
        presentRecordsKept: 0,
        absentRecordsKept: 0
      };

      for (const att of attendances) {
        const studentId = att.studentId;

        const dateRecords = att.records.filter(
          r => r.date.toDateString() === targetDate.toDateString()
        );
        if (dateRecords.length === 0) continue;

        if (dateRecords.length <= finalCount) continue;

        mergeStats.studentsWithRecords++;

        const presentRecords = dateRecords.filter(r => r.present);
        const absentRecords = dateRecords.filter(r => !r.present);

        // --- ✅ maximize present records ---
        let keepPresent = Math.min(presentRecords.length, finalCount);
        let keepAbsent = finalCount - keepPresent;

        if (keepAbsent > absentRecords.length) {
          keepAbsent = absentRecords.length;
          keepPresent = finalCount - keepAbsent;
        }

        const finalRecords = [
          ...presentRecords.slice(0, keepPresent),
          ...absentRecords.slice(0, keepAbsent)
        ];

        mergeStats.presentRecordsKept += keepPresent;
        mergeStats.absentRecordsKept += keepAbsent;
        mergeStats.totalRecordsRemoved += dateRecords.length - finalRecords.length;

        // Replace old records for this date with finalRecords
        const newRecords = att.records.filter(
          r => r.date.toDateString() !== targetDate.toDateString()
        );
        newRecords.push(...finalRecords);

        attendanceOps.push({
          updateOne: {
            filter: { _id: att._id },
            update: { $set: { records: newRecords } }
          }
        });
        processedStudents++;

        // --- update summary ---
        const summary = await AttendanceSummary.findOne({
          studentId,
          courseId,
          semId,
          subjectCode,
          academicYear
        }).session(session);

        if (summary) {
          const originalTotal = dateRecords.length;
          const originalPresent = presentRecords.length;
          const newTotal = finalRecords.length;
          const newPresent = finalRecords.filter(r => r.present).length;

          summary.totalClasses -= (originalTotal - newTotal);
          summary.attendedClasses -= (originalPresent - newPresent);

          summary.totalClasses = Math.max(0, summary.totalClasses);
          summary.attendedClasses = Math.max(0, summary.attendedClasses);

          summary.attendancePercentage =
            summary.totalClasses === 0
              ? 0
              : parseFloat(((summary.attendedClasses / summary.totalClasses) * 100).toFixed(2));

          summary.lastUpdated = new Date();

          summaryOps.push({
            updateOne: {
              filter: { _id: summary._id },
              update: {
                $set: {
                  totalClasses: summary.totalClasses,
                  attendedClasses: summary.attendedClasses,
                  attendancePercentage: summary.attendancePercentage,
                  lastUpdated: summary.lastUpdated
                }
              }
            }
          });

          updatedSummaries++;
        }
      }

      if (attendanceOps.length > 0) {
        await Attendance.bulkWrite(attendanceOps, { session });
      }
      if (summaryOps.length > 0) {
        await AttendanceSummary.bulkWrite(summaryOps, { session });
      }

      res.status(200).json({
        message: "Attendance merged successfully",
        processedStudents,
        updatedSummaries,
        mergeStatistics: mergeStats
      });
    }, { maxCommitTimeMS: 120000 });

  } catch (error) {
    console.error("Error merging attendance:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};
