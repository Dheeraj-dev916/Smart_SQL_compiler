// Demo data for the sandbox database. Deliberately contains NULLs so that NULL-sensitive
// rewrites can be checked for equivalence.
export const SCHEMA_SQL = `
CREATE TABLE students (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  age INTEGER,
  gpa DECIMAL
);
CREATE TABLE courses (
  id INTEGER PRIMARY KEY,
  course_name TEXT NOT NULL,
  department TEXT,
  credits INTEGER NOT NULL
);
CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  course_id INTEGER NOT NULL REFERENCES courses(id),
  grade TEXT
);
`;

export const SEED_SQL = `
INSERT INTO students (id, name, department, age, gpa) VALUES
 (1, 'Alice Khan', 'Computer Science', 21, 3.8),
 (2, 'Bilal Ahmed', 'Computer Science', 22, 3.2),
 (3, 'Chen Wei', 'Electrical Engineering', 20, 3.5),
 (4, 'Dina Farouk', 'Mathematics', 23, 3.9),
 (5, 'Ethan Brown', 'Computer Science', 19, 2.7),
 (6, 'Fatima Noor', 'Mathematics', 21, NULL),
 (7, 'George Mills', 'Electrical Engineering', NULL, 3.1),
 (8, 'Hira Malik', NULL, 22, 3.6),
 (9, 'Ivan Petrov', 'Physics', 24, 3.3),
 (10, 'Julia Roberts', 'Physics', 20, 2.9),
 (11, 'Kareem Ali', 'Computer Science', 25, 3.0),
 (12, 'Laila Hassan', 'Mathematics', 18, 3.7);
INSERT INTO courses (id, course_name, department, credits) VALUES
 (1, 'Compiler Design', 'Computer Science', 3),
 (2, 'Database Systems', 'Computer Science', 4),
 (3, 'Circuit Analysis', 'Electrical Engineering', 4),
 (4, 'Linear Algebra', 'Mathematics', 3),
 (5, 'Quantum Mechanics', 'Physics', 4),
 (6, 'Discrete Mathematics', 'Mathematics', 2),
 (7, 'Ethics in Computing', NULL, 1);
INSERT INTO enrollments (id, student_id, course_id, grade) VALUES
 (1, 1, 1, 'A'), (2, 1, 2, 'A'), (3, 2, 1, 'B'), (4, 2, 2, NULL),
 (5, 3, 3, 'B'), (6, 4, 4, 'A'), (7, 4, 6, 'A'), (8, 5, 1, 'C'),
 (9, 5, 2, 'B'), (10, 6, 4, NULL), (11, 7, 3, 'C'), (12, 8, 1, 'A'),
 (13, 9, 5, 'B'), (14, 10, 5, 'C'), (15, 11, 2, 'B'), (16, 12, 6, 'A'),
 (17, 12, 4, 'A'), (18, 3, 7, 'A');
`;
