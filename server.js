const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const session = require("express-session");
const { MongoClient, ObjectId } = require("mongodb");
const { calculateAge, generateQuestion, parseQuestion } = require("./util");

const app = express();
const PORT = 3000;

// MongoDB 연결 설정
const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

let db;

async function connectToMongoDB() {
  try {
    console.log("connectToMongoDB");

    // MongoDB에 연결
    await client.connect();
    db = client.db("question"); // 'question' 데이터베이스 선택
    console.log("MongoDB에 연결되었습니다.");

    // 서버 시작은 MongoDB 연결이 완료된 후에만
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB 연결 실패:", err);
  }
}

// Middleware 설정
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 세션 설정
app.use(
  session({
    secret: "dkanrjsksjgdmausehla", // 세션 암호화 키
    resave: false, // 세션이 수정되지 않아도 저장
    saveUninitialized: true, // 초기화되지 않은 세션도 저장
    cookie: { secure: false }, // HTTPS에서만 사용할 경우 true로 설정 (개발용으로는 false)
  })
);

// 정적 파일 제공
app.use(express.static(path.join(__dirname, "public")));

// Route for home page (index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 회원가입 처리
app.post("/signup", async (req, res) => {
  const { id, nickname, password, keyword, birthdate } = req.body;

  try {
    // 중복된 ID 체크
    const existingUser = await db.collection("users").findOne({ id });
    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    // 사용자 데이터 저장
    const newUser = {
      id,
      nickname,
      password,
      keyword,
      birthdate,
      level: 1,
      score: 0,
    };

    await db.collection("users").insertOne(newUser);
    res.status(201).send("User registered successfully");
  } catch (err) {
    console.error("회원가입 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 로그인 처리
app.post("/login", async (req, res) => {
  const { id, password } = req.body;

  try {
    // 사용자 조회
    const user = await db.collection("users").findOne({ id });
    if (!user) {
      return res.status(400).send("User not found");
    }

    // 비밀번호 체크
    if (user.password !== password) {
      return res.status(400).send("Invalid password");
    }

    // 세션에 사용자 정보 저장
    req.session.user = {
      id: user.id,
      nickname: user.nickname,
      birthdate: user.birthdate,
      keyword: user.keyword,
    };

    res.status(200).send("Login successful");
  } catch (err) {
    console.error("로그인 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 로그아웃 처리
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error logging out");
    }
    res.clearCookie("connect.sid"); // 세션 쿠키 삭제
    res.status(200).send("Logged out successfully");
  });
});

// 홈 화면 요청 처리
app.get("/home", async (req, res) => {
  if (req.session.user) {
    const keywords = await db.collection("keyword").find({}).toArray();
    res.status(200).json({
      message: `Welcome to the home page, ${req.session.user.nickname}`,
      user: req.session.user,
      keywords: keywords, // 모든 키워드
    });
  } else {
    res.status(401).send("Unauthorized: Please log in");
  }
});

// 마이페이지 요청 처리 (마이페이지에서는 사용자 정보를 보여줌)
app.get("/mypage", (req, res) => {
  if (req.session.user) {
    res.status(200).json({
      message: `Welcome to your MyPage, ${req.session.user.nickname}`,
      user: req.session.user,
    });
  } else {
    res.status(401).send("Unauthorized: Please log in");
  }
});

// 닉네임 및 키워드 업데이트 처리
app.patch("/updateProfile", async (req, res) => {
  const { id, nickname, keyword } = req.body;

  try {
    const result = await db.collection("users").updateOne(
      { id }, // 사용자 ID를 기반으로 업데이트
      { $set: { nickname, keyword } } // 닉네임과 키워드 업데이트
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("User not found");
    }

    // 세션 업데이트
    req.session.user.nickname = nickname;
    req.session.user.keyword = keyword;

    res.status(200).send("Profile updated successfully");
  } catch (err) {
    console.error("프로필 업데이트 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 키워드 조회
app.post("/getKeywords", async (req, res) => {
  const { birthdate } = req.body;

  // 나이대 계산
  const ageGroup = calculateAge(birthdate);

  if (!ageGroup) {
    return res.status(400).send("Invalid age group");
  }

  try {
    // MongoDB에서 나이대에 맞는 키워드 조회
    const keywords = await db
      .collection("keyword")
      .find({ ages: { $regex: ageGroup.toString() } })
      .toArray();

    res.status(200).json(keywords);
  } catch (err) {
    console.error("키워드 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 랜덤 문제 가져오기
app.post("/getRandomQuestion", async (req, res) => {
  const { keyword } = req.body;
  const userId = req.session.user.id;

  try {
    const history = await db
      .collection("history")
      .findOne({ userId, subject: keyword });

    let difficultyLevel = "하";
    if (history) {
      difficultyLevel = history.difficultyLevel;
    }

    const randomQuestion = await db
      .collection("question")
      .aggregate([
        { $match: { subject: keyword, difficulty: difficultyLevel } },
        { $sample: { size: 1 } },
      ])
      .toArray();

    if (randomQuestion.length > 0) {
      res.status(200).json(randomQuestion[0]);
    } else {
      res
        .status(404)
        .send("No question found for the selected keyword and difficulty");
    }
  } catch (err) {
    console.error("문제 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 문제 풀이 결과 처리
app.post("/submitAnswer", async (req, res) => {
  const { keyword, isCorrect } = req.body;
  const userId = req.session.user.id;

  try {
    let history = await db
      .collection("history")
      .findOne({ userId, subject: keyword });

    if (!history) {
      history = { userId, subject: keyword, score: 0, difficultyLevel: "하" };
    }

    let updatedScore = history.score;

    if (isCorrect) {
      updatedScore +=
        history.difficultyLevel === "하"
          ? 1
          : history.difficultyLevel === "중"
          ? 2
          : 3;
    } else {
      updatedScore = Math.max(0, updatedScore - 1);
    }

    if (updatedScore >= 15) {
      history.difficultyLevel = "상";
    } else if (updatedScore >= 5) {
      history.difficultyLevel = "중";
    } else {
      history.difficultyLevel = "하";
    }

    await db.collection("history").updateOne(
      { userId, subject: keyword },
      {
        $set: {
          score: updatedScore,
          difficultyLevel: history.difficultyLevel,
        },
      },
      { upsert: true }
    );

    res.status(200).json({
      message: "Score updated successfully",
      score: updatedScore,
      difficultyLevel: history.difficultyLevel,
    });
  } catch (err) {
    console.error("문제 풀이 결과 처리 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 히스토리 조회 (마이페이지에서 사용)
app.post("/getHistory", async (req, res) => {
  const { keyword } = req.body;
  const userId = req.session.user.id;

  try {
    const history = await db
      .collection("history")
      .findOne({ userId, subject: keyword });

    if (history) {
      res.status(200).json({
        score: history.score,
        difficultyLevel: history.difficultyLevel,
      });
    } else {
      res.status(200).json({ score: 0, difficultyLevel: "하" });
    }
  } catch (err) {
    console.error("히스토리 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 모든 회원 정보 조회 (관리자용)
app.get("/admin/users", async (req, res) => {
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const usersWithHistory = await db
      .collection("users")
      .aggregate([
        {
          $lookup: {
            from: "history",
            localField: "id",
            foreignField: "userId",
            as: "history",
          },
        },
      ])
      .toArray();

    res.status(200).json(usersWithHistory);
  } catch (err) {
    console.error("회원 정보 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 회원 정보 수정 (관리자용)
app.patch("/admin/users", async (req, res) => {
  const { id, nickname, password } = req.body;

  // 관리자 인증 체크
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    // 해당 회원 정보 수정
    const result = await db.collection("users").updateOne(
      { id: id }, // 회원 ID로 찾기
      {
        $set: {
          nickname: nickname,
          password: password,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("해당 ID의 회원을 찾을 수 없습니다.");
    }

    res.status(200).send("회원 정보가 성공적으로 수정되었습니다.");
  } catch (err) {
    console.error("회원 정보 수정 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 퀴즈 정보 조회 (관리자용)
app.get("/admin/quizzes", async (req, res) => {
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const subject = req.query.subject;
    let query = {};
    if (subject) {
      query = { subject };
    }
    const quizzes = await db.collection("question").find(query).toArray();
    res.status(200).json(quizzes);
  } catch (err) {
    console.error("퀴즈 정보 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 퀴즈 수정 (관리자용)
app.patch("/admin/quizzes", async (req, res) => {
  const { id } = req.query; // 쿼리에서 id를 가져옴
  const { subject, question, difficulty, options, answer } = req.body; // 프론트에서 전달된 수정할 필드들

  // 관리자 인증 체크
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    // MongoDB ObjectId로 변환하여 해당 퀴즈를 찾아서 업데이트
    const result = await db.collection("question").updateOne(
      { _id: new ObjectId(id) }, // id를 ObjectId로 변환
      {
        $set: {
          subject: subject,
          question: question,
          difficulty: difficulty,
          options: options,
          answer: answer,
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send("해당 ID의 퀴즈를 찾을 수 없습니다.");
    }

    res.status(200).send("퀴즈가 성공적으로 수정되었습니다.");
  } catch (err) {
    console.error("퀴즈 수정 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 관리자 로그인 API
app.post("/admin/login", (req, res) => {
  const { id, password } = req.body;

  const adminId = "admin";
  const adminPassword = "1111";

  if (id === adminId && password === adminPassword) {
    req.session.role = "admin";
    return res.status(200).json({ message: "관리자 로그인 성공" });
  } else {
    return res.status(401).json({ message: "관리자 인증 실패" });
  }
});

// 관리자 세션 확인 API
app.get("/admin/checkSession", (req, res) => {
  if (req.session.role === "admin") {
    res.status(200).json({ isAdmin: true });
  } else {
    res.status(200).json({ isAdmin: false });
  }
});

// 퀴즈 추가 (관리자용)
app.post("/admin/quizzes", async (req, res) => {
  const { subject, difficulty, question, options, answer } = req.body;

  // 관리자 인증 체크
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    // 문제를 데이터베이스에 추가
    console.log("123");

    await db
      .collection("question")
      .insertOne({ subject, difficulty, question, options, answer });

    console.log("234");

    res.status(201).send("문제가 성공적으로 추가되었습니다.");
  } catch (err) {
    console.error("문제 추가 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 주제 목록을 가져오는 API (관리자용)
app.get("/admin/keywords", async (req, res) => {
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const subjects = await db.collection("keyword").find({}).toArray();
    res.status(200).json(subjects);
  } catch (err) {
    console.error("주제 목록 조회 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 문제 삭제 (관리자용)
app.delete("/admin/quizzes", async (req, res) => {
  const { id } = req.query; // 쿼리에서 id 가져오기

  console.log("id:", id);

  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    const result = await db
      .collection("question")
      .deleteOne({ _id: new ObjectId(id) });

    console.log("result:", result);

    if (result.deletedCount === 0) {
      return res.status(404).send("해당 ID의 문제를 찾을 수 없습니다.");
    }

    res.status(200).send("문제가 성공적으로 삭제되었습니다.");
  } catch (err) {
    console.error("문제 삭제 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 키워드 추가 (관리자용)
app.post("/admin/keywords", async (req, res) => {
  const { keyword, ages } = req.body;

  // 관리자 인증 체크
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    // 새로운 키워드를 추가 (keyword와 ages 포함)
    await db.collection("keyword").insertOne({ keyword, ages });

    res.status(201).send("키워드가 성공적으로 추가되었습니다.");
  } catch (err) {
    console.error("키워드 추가 오류:", err);
    res.status(500).send("Internal Server Error");
  }
});

// 문제 생성 및 저장 API
app.post("/admin/quizzes/generate", async (req, res) => {
  const { keyword, difficulty } = req.body;

  // 관리자 인증 체크
  if (req.session.role !== "admin") {
    return res.status(403).send("Unauthorized");
  }

  try {
    // chatGPT를 사용하여 문제 생성
    const generatedQuestion = await generateQuestion(keyword, difficulty);

    // 생성된 문제를 데이터베이스에 저장
    await db.collection("question").insertOne({
      subject: keyword,
      difficulty: difficulty,
      question: generatedQuestion.question,
      options: generatedQuestion.options,
      answer: generatedQuestion.answer,
    });

    res.status(201).json({
      message: "문제가 성공적으로 생성되고 저장되었습니다.",
      question: generatedQuestion,
    });
  } catch (err) {
    console.error("문제 생성 오류:", err);
    res.status(500).send("문제 생성 및 저장 중 오류가 발생했습니다.");
  }
});

app.get("/admin/quizzes/generate/test", async (req, res) => {
  try {
    // chatGPT를 사용하여 문제 생성
    const generatedQuestion = await generateQuestion("축구", "하");

    // 생성된 문제를 데이터베이스에 저장
    await db.collection("question").insertOne({
      subject: "축구",
      difficulty: "하",
      question: generatedQuestion.question,
      options: generatedQuestion.options,
      answer: generatedQuestion.answer,
    });

    res.status(201).json({
      message: "문제가 성공적으로 생성되고 저장되었습니다.",
      question: generatedQuestion,
    });
  } catch (err) {
    console.error("문제 생성 오류:", err);
    res.status(500).send("문제 생성 및 저장 중 오류가 발생했습니다.");
  }
});

connectToMongoDB();
