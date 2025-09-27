const Teacher = require("../models/Teacher");

const removeExpiredSessions = async () => {
  try {
    console.log("Running session cleanup...");
    const teachers = await Teacher.find({
      "sessions.expiresAt": { $lt: new Date() },
    });

    for (const teacher of teachers) {
      teacher.sessions = teacher.sessions.filter(
        (session) => new Date(session.expiresAt) > new Date()
      );
      await teacher.save();
    }
    console.log("Expired sessions removed successfully.");
  } catch (error) {
    console.error("Error while removing expired sessions:", error);
  }
};

module.exports = { removeExpiredSessions };
