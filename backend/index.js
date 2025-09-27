const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const StudentRoutes = require("./routes/StudentRoutes");
const TeacherRoutes = require("./routes/Teacherroutes");
const AttendanceRoutes = require("./routes/Attendanceroutes");
const cors = require("cors"); // Add this line
require("dotenv").config();
const { removeExpiredSessions } = require("./utils/sessionCleanup");



const app = express();

// Add CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      callback(null, true); // Allow all origins
    },
    credentials: true, // Allow cookies to be sent
  })
);

app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => {
    console.log("Connected to Database");
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
  });

app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, 
  })
);

app.use("/teacher", TeacherRoutes);
app.use("/attendance",AttendanceRoutes );
app.use("/student", StudentRoutes);
//cleaning session
//setInterval(removeExpiredSessions, 1 * 60 * 1000); // every 30 min

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
